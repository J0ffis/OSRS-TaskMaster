package com.osrstaskmaster;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Spots goals and suggestions the player finishes while they play, for the "X completed" chat
 * message and pop-up. Something counts only when this session saw it unfinished first and finished
 * later, so logging in never announces old progress, and each thing is announced once per session.
 * Not thread-safe: use it from the client thread.
 */
final class CompletionTracker
{
	/** Something being watched: its key ({@link PickProgress} ids), name and whether it's a goal. */
	static final class Item
	{
		final String key;
		final String label;
		final boolean goal;

		Item(String key, String label, boolean goal)
		{
			this.key = key;
			this.label = label;
			this.goal = goal;
		}
	}

	private Map<String, Item> tracked = Collections.emptyMap();
	/** Keys seen unfinished this session. */
	private final Set<String> open = new HashSet<>();
	/** Keys already announced this session. */
	private final Set<String> announced = new HashSet<>();

	/**
	 * Replace what's watched (the latest goals, suggestions and route steps). A key listed twice is
	 * watched once, as a goal if any entry is one. What was seen before is remembered.
	 */
	void setTracked(List<Item> items)
	{
		Map<String, Item> next = new LinkedHashMap<>();
		for (Item i : items)
		{
			if (i == null || i.key == null || i.label == null)
			{
				continue;
			}
			Item had = next.get(i.key);
			if (had == null || (i.goal && !had.goal))
			{
				next.put(i.key, i);
			}
		}
		tracked = next;
	}

	/** Check everything watched against the latest progress; returns what was just finished. */
	List<Item> check(Predicate<String> isDone)
	{
		List<Item> done = new ArrayList<>();
		for (Item i : tracked.values())
		{
			if (!isDone.test(i.key))
			{
				open.add(i.key);
			}
			else if (open.remove(i.key) && announced.add(i.key))
			{
				done.add(i);
			}
		}
		// Goals first: they're what the player chose.
		done.sort((a, b) -> Boolean.compare(b.goal, a.goal));
		return done;
	}

	/** True if a watched XP target for this skill is now reached (a cheap test before a full check). */
	boolean xpTargetReached(String skill, long xp)
	{
		for (String key : tracked.keySet())
		{
			if (!open.contains(key))
			{
				continue;
			}
			String[] p = key.split(":");
			if (p.length == 3 && (p[0].equals("xp") || p[0].equals("skill")) && p[1].equals(skill))
			{
				try
				{
					if (xp >= Long.parseLong(p[2]))
					{
						return true;
					}
				}
				catch (NumberFormatException ignored)
				{
					// not a number: not ours to judge
				}
			}
		}
		return false;
	}

	/** What to watch from the service's reply: the goals, every listed suggestion and the route. */
	static List<Item> watchList(Picks.Reply reply)
	{
		List<Item> out = new ArrayList<>();
		if (reply == null)
		{
			return out;
		}
		if (reply.goals != null)
		{
			for (Map<String, Object> g : reply.goals)
			{
				String key = CompletionKeys.goalKey(g);
				Object name = g == null ? null : g.get("name");
				out.add(new Item(key, CompletionKeys.label(key, name instanceof String ? (String) name : null), true));
			}
		}
		if (reply.picks != null)
		{
			if (reply.picks.tiers != null)
			{
				for (List<Picks.Pick> tier : reply.picks.tiers.values())
				{
					for (Picks.Pick p : tier == null ? Collections.<Picks.Pick>emptyList() : tier)
					{
						if (p != null)
						{
							out.add(new Item(p.id, CompletionKeys.label(p.id, p.title), false));
						}
					}
				}
			}
			if (reply.picks.route != null)
			{
				for (Picks.Step s : reply.picks.route.steps())
				{
					if (s != null)
					{
						out.add(new Item(s.key, CompletionKeys.label(s.key, s.title), false));
					}
				}
			}
		}
		return out;
	}

	boolean isEmpty()
	{
		return tracked.isEmpty();
	}

	/** Another account logged in: start over. */
	void reset()
	{
		tracked = Collections.emptyMap();
		open.clear();
		announced.clear();
	}
}
