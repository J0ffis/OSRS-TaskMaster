package com.osrstaskmaster;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The panel's view of the player's progress: the plugin's latest profile plus the website's goals.
 * It tells which suggestions, goals and route steps are finished (more kinds than
 * {@link PickProgress} can judge from an id alone), and brings a row's bar and counts up to date,
 * so a list the website saved a while ago doesn't show old numbers. Rules and wording follow
 * web/recommender.js (clogCandidates, caCandidates, levelCandidates, goalProgress).
 * Immutable: build a new one when the profile or the goals change.
 */
final class LiveProgress
{
	/** Nothing known yet: nothing is done and rows show as the website saved them. */
	static final LiveProgress NONE = new LiveProgress(null, null);

	private static final List<String> CA_TIERS = Arrays.asList("Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster");
	private static final List<String> DIARY_TIERS = Arrays.asList("easy", "medium", "hard", "elite");
	/** Route step titles from planRoute: "Reach 32 quest points", "Reach combat level 70". */
	private static final Pattern QP_TITLE = Pattern.compile("(\\d+) quest points");
	private static final Pattern COMBAT_TITLE = Pattern.compile("combat level (\\d+)");

	private final JsonObject profile;
	private final Map<String, Map<String, Object>> goalsById = new HashMap<>();

	LiveProgress(JsonObject profile, List<Map<String, Object>> goals)
	{
		this.profile = profile;
		if (goals != null)
		{
			for (Map<String, Object> g : goals)
			{
				if (g != null && g.get("id") instanceof String)
				{
					goalsById.put((String) g.get("id"), g);
				}
			}
		}
	}

	boolean hasProfile()
	{
		return profile != null;
	}

	LiveProgress withProfile(JsonObject p)
	{
		return new LiveProgress(p, new ArrayList<>(goalsById.values()));
	}

	LiveProgress withGoals(List<Map<String, Object>> goals)
	{
		return new LiveProgress(profile, goals);
	}

	// ---- Done or not -----------------------------------------------------------------------

	/**
	 * True if the profile shows this finished: a {@link PickProgress} id, a goal row
	 * ("goal:g1", judged from the website's goal), or a "reach:" suggestion (its quest or diary).
	 */
	boolean isDone(String key)
	{
		if (profile == null || key == null)
		{
			return false;
		}
		if (key.startsWith("goal:"))
		{
			Map<String, Object> g = goalsById.get(key.substring("goal:".length()));
			return g != null && goalDone(g);
		}
		if (key.startsWith("reach:"))
		{
			return isDone(key.substring("reach:".length()));
		}
		return PickProgress.isDone(key, profile);
	}

	/**
	 * A suggestion: by its id, or by the goal it would make ("Get any missing note" is done once
	 * one of its notes is logged, as the website's goal for it would be).
	 */
	boolean isDone(Picks.Pick p)
	{
		return p != null && (isDone(p.id) || (profile != null && p.goal != null && goalDone(p.goal)));
	}

	/** A route step; quest point and combat level steps carry their target only in the title. */
	boolean isDone(Picks.Step s)
	{
		if (s == null || profile == null)
		{
			return false;
		}
		if ("qp".equals(s.key))
		{
			Integer need = number(QP_TITLE, s.title);
			JsonElement have = profile.get("questPoints");
			return need != null && have != null && have.isJsonPrimitive() && have.getAsInt() >= need;
		}
		if ("combat".equals(s.key))
		{
			Integer need = number(COMBAT_TITLE, s.title);
			JsonObject player = PickProgress.obj(profile, "player");
			JsonElement have = player == null ? null : player.get("combatLevel");
			return need != null && have != null && have.isJsonPrimitive() && have.getAsInt() >= need;
		}
		return isDone(s.key);
	}

	/** A website goal (web/recommender.js goalProgress shapes). */
	boolean goalDone(Map<String, Object> g)
	{
		if (profile == null || g == null)
		{
			return false;
		}
		String key = CompletionKeys.goalKey(g);
		if (key != null)
		{
			return PickProgress.isDone(key, profile);
		}
		Object type = g.get("type");
		try
		{
			if ("family".equals(type))
			{
				// Any one of the pieces it listed counts.
				Object items = g.get("items");
				if (items instanceof List)
				{
					for (Object name : (List<?>) items)
					{
						if (name instanceof String && owned((String) name))
						{
							return true;
						}
					}
				}
				return false;
			}
			if ("pet".equals(type))
			{
				return g.get("pet") instanceof String && owned((String) g.get("pet"));
			}
			if ("item".equals(type))
			{
				// A collection log item tracks itself; anything else is ticked off on the website.
				String item = g.get("item") instanceof String ? (String) g.get("item") : null;
				Boolean inLog = item == null ? null : ownedOrNull(item);
				return inLog != null ? inLog : Boolean.TRUE.equals(g.get("done"));
			}
			if ("caboss".equals(type))
			{
				int max = CA_TIERS.indexOf(String.valueOf(g.get("tier")));
				Object monster = g.get("monster");
				boolean general = monster == null || "Other".equals(monster) || "None".equals(monster);
				boolean any = false;
				for (JsonElement t : PickProgress.arr(PickProgress.obj(profile, "combatAchievements"), "tasks"))
				{
					JsonObject o = t.getAsJsonObject();
					String m = PickProgress.str(o, "monster");
					boolean here = general ? (m == null || "Other".equals(m) || "None".equals(m)) : monster.equals(m);
					int tier = CA_TIERS.indexOf(PickProgress.str(o, "tier"));
					if (here && tier >= 0 && tier <= max)
					{
						any = true;
						if (!taskDone(o))
						{
							return false;
						}
					}
				}
				return any;
			}
		}
		catch (RuntimeException ex)
		{
			return false;
		}
		return Boolean.TRUE.equals(g.get("done"));
	}

	// ---- Up-to-date rows --------------------------------------------------------------------

	/**
	 * The row as it should look now: the bar and the counts in its description worked out from the
	 * profile, the rest as the website saved it. Kinds it can't recount come back unchanged.
	 */
	Picks.Pick refresh(Picks.Pick p)
	{
		if (profile == null || p == null || p.id == null)
		{
			return p;
		}
		try
		{
			String kind = p.id.substring(0, Math.max(0, p.id.indexOf(':')));
			String rest = p.id.substring(p.id.indexOf(':') + 1);
			switch (kind)
			{
				case "clogpage":
					return clogPageRow(p, rest);
				case "clogfam":
				{
					Object page = p.goal == null ? null : p.goal.get("page");
					return pageBar(p, page instanceof String ? (String) page : rest.substring(0, rest.lastIndexOf(':')));
				}
				case "clog":
					return pageBar(p, pageOf(Integer.parseInt(rest), p.detail));
				case "cabundle":
					return bundleRow(p, rest);
				case "lvl":
					return levelRow(p, rest);
				case "goal":
				{
					Map<String, Object> g = goalsById.get(rest);
					return g == null ? p : goalRow(p, g);
				}
				default:
					return p;
			}
		}
		catch (RuntimeException ex)
		{
			return p; // a shape this version doesn't know: show it as the website saved it
		}
	}

	/** "Complete the X log": "5/10 slots. Missing: A, B, C, D and 2 more (plus the pet)." */
	private Picks.Pick clogPageRow(Picks.Pick p, String name)
	{
		JsonArray items = pageItems(name);
		if (items == null || items.size() == 0)
		{
			return p;
		}
		Set<Integer> pets = petIds();
		int shownGot = 0;
		int nonPet = 0;
		int nonPetGot = 0;
		boolean petMissing = false;
		List<String> missing = new ArrayList<>();
		for (JsonElement e : items)
		{
			JsonObject i = e.getAsJsonObject();
			boolean got = quantity(i) > 0;
			boolean pet = pets.contains(i.get("id").getAsInt());
			shownGot += got ? 1 : 0;
			if (pet)
			{
				petMissing |= !got;
				continue;
			}
			nonPet++;
			if (got)
			{
				nonPetGot++;
			}
			else
			{
				missing.add(PickProgress.str(i, "name"));
			}
		}
		if (missing.isEmpty() || nonPet == 0)
		{
			return p; // finished: the row drops off anyway
		}
		StringBuilder d = new StringBuilder(shownGot + "/" + items.size() + " slots. Missing: ");
		d.append(String.join(", ", missing.subList(0, Math.min(4, missing.size()))));
		if (missing.size() > 4)
		{
			d.append(" and ").append(missing.size() - 4).append(" more");
		}
		d.append(petMissing ? " (plus the pet)." : ".");
		return copy(p, d.toString(), (double) nonPetGot / nonPet);
	}

	/** A log row whose bar is how much of its page is done (pets left out, as on the website). */
	private Picks.Pick pageBar(Picks.Pick p, String name)
	{
		JsonArray items = name == null ? null : pageItems(name);
		if (items == null)
		{
			return p;
		}
		Set<Integer> pets = petIds();
		int all = 0;
		int got = 0;
		for (JsonElement e : items)
		{
			JsonObject i = e.getAsJsonObject();
			if (!pets.contains(i.get("id").getAsInt()))
			{
				all++;
				got += quantity(i) > 0 ? 1 : 0;
			}
		}
		return all == 0 ? p : copy(p, p.detail, (double) got / all);
	}

	/** "Finish every Easy task at Zulrah": "Tasks: “A”, “B”, “C” and 2 more". */
	private Picks.Pick bundleRow(Picks.Pick p, String rest)
	{
		int bar = rest.lastIndexOf('|');
		String monster = rest.substring(0, bar);
		String tier = rest.substring(bar + 1);
		int all = 0;
		List<String> left = new ArrayList<>();
		for (JsonElement t : PickProgress.arr(PickProgress.obj(profile, "combatAchievements"), "tasks"))
		{
			JsonObject o = t.getAsJsonObject();
			if (monster.equals(PickProgress.str(o, "monster")) && tier.equals(PickProgress.str(o, "tier")))
			{
				all++;
				if (!taskDone(o))
				{
					left.add("“" + PickProgress.str(o, "name") + "”");
				}
			}
		}
		if (all == 0 || left.isEmpty())
		{
			return p;
		}
		String d = "Tasks: " + String.join(", ", left.subList(0, Math.min(3, left.size())))
			+ (left.size() > 3 ? " and " + (left.size() - 3) + " more" : "");
		return copy(p, d, (double) (all - left.size()) / all);
	}

	/**
	 * "Train Slayer to 90": "85 → 90: 1.2M XP to go." The website adds a time for the XP it saw;
	 * once the XP has moved on that time is out of date, so it's left off rather than shown wrong.
	 */
	private Picks.Pick levelRow(Picks.Pick p, String rest)
	{
		String[] k = rest.split(":");
		JsonObject skill = PickProgress.obj(PickProgress.obj(profile, "skills"), k[0]);
		if (skill == null)
		{
			return p;
		}
		int target = Integer.parseInt(k[1]);
		int cur = skill.get("level").getAsInt();
		long xp = skill.get("xp").getAsLong();
		long from = xpForLevel(cur);
		long to = xpForLevel(target);
		double progress = Math.max(0, Math.min(1, (double) (xp - from) / Math.max(1, to - from)));
		String head = cur + " → " + target + ": " + fmt(to - xp) + " XP to go.";
		String detail = p.detail != null && p.detail.startsWith(head) ? p.detail : head;
		return copy(p, detail, progress);
	}

	/** A goal row: "Currently 85/90 Slayer." and its bar, for the goal kinds that count up. */
	private Picks.Pick goalRow(Picks.Pick p, Map<String, Object> g)
	{
		Object type = g.get("type");
		double progress;
		String label;
		if ("skill".equals(type) || "xp".equals(type))
		{
			String name = (String) g.get("skill");
			JsonObject skill = PickProgress.obj(PickProgress.obj(profile, "skills"), name);
			if (skill == null)
			{
				return p;
			}
			long xp = skill.get("xp").getAsLong();
			if ("skill".equals(type))
			{
				int level = ((Number) g.get("level")).intValue();
				progress = Math.min(1, (double) xp / xpForLevel(level));
				label = skill.get("level").getAsInt() + "/" + level + " " + cap(name);
			}
			else
			{
				long target = ((Number) g.get("xp")).longValue();
				progress = Math.min(1, (double) xp / target);
				label = fmt(xp) + "/" + fmt(target) + " XP";
			}
		}
		else if ("clog".equals(type))
		{
			JsonArray items = pageItems((String) g.get("page"));
			if (items == null || items.size() == 0)
			{
				return p;
			}
			int got = 0;
			for (JsonElement e : items)
			{
				got += quantity(e.getAsJsonObject()) > 0 ? 1 : 0;
			}
			progress = (double) got / items.size();
			label = got + "/" + items.size();
		}
		else if ("cabundle".equals(type))
		{
			int all = 0;
			int got = 0;
			for (JsonElement t : PickProgress.arr(PickProgress.obj(profile, "combatAchievements"), "tasks"))
			{
				JsonObject o = t.getAsJsonObject();
				if (g.get("monster").equals(PickProgress.str(o, "monster")) && g.get("tier").equals(PickProgress.str(o, "tier")))
				{
					all++;
					got += taskDone(o) ? 1 : 0;
				}
			}
			if (all == 0)
			{
				return p;
			}
			progress = (double) got / all;
			label = got + "/" + all + " tasks";
		}
		else if ("diary".equals(type))
		{
			JsonObject region = PickProgress.obj(PickProgress.obj(profile, "diaries"), (String) g.get("region"));
			int need = DIARY_TIERS.indexOf(String.valueOf(g.get("tier"))) + 1;
			if (region == null || need == 0)
			{
				return p;
			}
			int have = 0;
			for (String t : DIARY_TIERS)
			{
				JsonElement e = region.get(t);
				have += e != null && e.isJsonPrimitive() && e.getAsBoolean() ? 1 : 0;
			}
			progress = Math.min(1, (double) have / need);
			label = have + "/4 tiers";
		}
		else if ("ca".equals(type))
		{
			JsonObject ca = PickProgress.obj(profile, "combatAchievements");
			JsonObject thresholds = PickProgress.obj(ca, "thresholds");
			JsonElement need = thresholds == null ? null : thresholds.get(String.valueOf(g.get("tier")));
			if (need == null || need.getAsInt() <= 0 || ca.get("points") == null)
			{
				return p;
			}
			int pts = ca.get("points").getAsInt();
			progress = Math.min(1, (double) pts / need.getAsInt());
			label = pts + "/" + need.getAsInt() + " pts";
		}
		else
		{
			return p;
		}
		// Only the "Currently ..." text is the website's count; other goal descriptions stay.
		String detail = p.detail != null && p.detail.startsWith("Currently ") ? "Currently " + label + "." : p.detail;
		return copy(p, detail, progress);
	}

	// ---- Helpers ------------------------------------------------------------------------------

	private static Picks.Pick copy(Picks.Pick p, String detail, Double progress)
	{
		Picks.Pick c = new Picks.Pick();
		c.id = p.id;
		c.title = p.title;
		c.detail = detail;
		c.category = p.category;
		c.progress = progress;
		c.wilderness = p.wilderness;
		c.icon = p.icon;
		c.goal = p.goal;
		c.est = p.est;
		return c;
	}

	private JsonArray pageItems(String name)
	{
		JsonObject page = PickProgress.obj(PickProgress.obj(PickProgress.obj(profile, "collectionLog"), "pages"), name);
		return page == null ? null : page.getAsJsonArray("items");
	}

	/** The page a log item's row is about: the one its description names, else the first with it. */
	private String pageOf(int itemId, String detail)
	{
		JsonObject pages = PickProgress.obj(PickProgress.obj(profile, "collectionLog"), "pages");
		if (pages == null)
		{
			return null;
		}
		String first = null;
		for (String name : pages.keySet())
		{
			JsonArray items = pages.getAsJsonObject(name).getAsJsonArray("items");
			if (items == null)
			{
				continue;
			}
			for (JsonElement e : items)
			{
				if (e.getAsJsonObject().get("id").getAsInt() == itemId)
				{
					if (detail != null && detail.contains(name + " collection log page"))
					{
						return name;
					}
					first = first == null ? name : first;
				}
			}
		}
		return first;
	}

	/** Pets, from the "All Pets" page (as the website's petInfo). */
	private Set<Integer> petIds()
	{
		JsonArray all = pageItems("All Pets");
		if (all == null)
		{
			return Collections.emptySet();
		}
		Set<Integer> ids = new HashSet<>();
		for (JsonElement e : all)
		{
			ids.add(e.getAsJsonObject().get("id").getAsInt());
		}
		return ids;
	}

	private boolean owned(String name)
	{
		return Boolean.TRUE.equals(ownedOrNull(name));
	}

	/** Whether a collection log item (by name, any page) is logged; null when it's not in the log. */
	private Boolean ownedOrNull(String name)
	{
		JsonObject pages = PickProgress.obj(PickProgress.obj(profile, "collectionLog"), "pages");
		if (pages == null)
		{
			return null;
		}
		Boolean found = null;
		for (String page : pages.keySet())
		{
			JsonArray items = pages.getAsJsonObject(page).getAsJsonArray("items");
			if (items == null)
			{
				continue;
			}
			for (JsonElement e : items)
			{
				JsonObject i = e.getAsJsonObject();
				if (name.equalsIgnoreCase(PickProgress.str(i, "name")))
				{
					if (quantity(i) > 0)
					{
						return true;
					}
					found = false;
				}
			}
		}
		return found;
	}

	private static int quantity(JsonObject item)
	{
		JsonElement q = item.get("quantity");
		return q != null && q.isJsonPrimitive() ? q.getAsInt() : 0;
	}

	private static boolean taskDone(JsonObject task)
	{
		return task.has("done") && task.get("done").getAsBoolean();
	}

	private static Integer number(Pattern p, String text)
	{
		Matcher m = text == null ? null : p.matcher(text);
		return m != null && m.find() ? Integer.valueOf(m.group(1)) : null;
	}

	/** XP for a level, the game's table (web/recommender.js xpForLevel), levels 1-99. */
	static long xpForLevel(int level)
	{
		int lvl = Math.max(1, Math.min(99, level));
		double points = 0;
		for (int l = 1; l < lvl; l++)
		{
			points += Math.floor(l + 300 * Math.pow(2, l / 7.0));
		}
		return (long) Math.floor(points / 4);
	}

	/** Numbers as the website writes them (web/recommender.js fmt): 9,500 · 12K · 1.2M · 1.5B. */
	static String fmt(long n)
	{
		if (n < 0)
		{
			return "?";
		}
		if (n >= 1_000_000_000L)
		{
			return trim(String.format(java.util.Locale.ROOT, n >= 10_000_000_000L ? "%.0f" : "%.2f", n / 1e9)) + "B";
		}
		if (n >= 1_000_000L)
		{
			String s = String.format(java.util.Locale.ROOT, n >= 100_000_000L ? "%.0f" : "%.1f", n / 1e6);
			return (s.endsWith(".0") ? s.substring(0, s.length() - 2) : s) + "M";
		}
		if (n >= 10_000L)
		{
			return Math.round(n / 1e3) + "K";
		}
		return java.text.NumberFormat.getIntegerInstance(java.util.Locale.US).format(n);
	}

	/** "1.50" -> "1.5", "2.00" -> "2" (the website's replace(/\.?0+$/, "")). */
	private static String trim(String s)
	{
		return s.contains(".") ? s.replaceAll("\\.?0+$", "") : s;
	}

	private static String cap(String s)
	{
		return s == null || s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
	}
}
