package com.osrstaskmaster;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;

/**
 * Turns the website's goals into the same keys {@link PickProgress} judges, and gives every key a
 * short name for "X completed". Goal shapes come from web/recommender.js (goalProgress, goalTitle).
 * Goal kinds the plugin can't judge on its own (pets and items by name, "any missing piece",
 * whole-boss CA groups, ticked-by-hand goals) get no key, so they're never announced.
 */
final class CompletionKeys
{
	private CompletionKeys()
	{
	}

	/** The key for a website goal ("lvl:slayer:85", "quest:Dragon Slayer II", ...), or null. */
	static String goalKey(Map<String, Object> g)
	{
		if (g == null || !(g.get("type") instanceof String))
		{
			return null;
		}
		try
		{
			switch ((String) g.get("type"))
			{
				case "skill":
					return "lvl:" + str(g, "skill") + ":" + num(g, "level");
				case "xp":
					return "xp:" + str(g, "skill") + ":" + num(g, "xp");
				case "quest":
					return "quest:" + str(g, "quest");
				case "diary":
					return "diary:" + str(g, "region") + ":" + str(g, "tier");
				case "catask":
					return "ca:" + num(g, "task");
				case "cabundle":
					return "cabundle:" + str(g, "monster") + "|" + str(g, "tier");
				case "clog":
					return "clogpage:" + str(g, "page");
				case "ca":
					return "catier:" + str(g, "tier");
				default:
					return null;
			}
		}
		catch (RuntimeException ex)
		{
			return null; // a field missing or of the wrong kind
		}
	}

	/**
	 * A short name for what was finished: worked out from the key where it says it all ("85 Slayer",
	 * "Ardougne Hard diary"), otherwise the title the website gave, without its leading verb.
	 */
	static String label(String key, String title)
	{
		String fromKey = key == null ? null : fromKey(key);
		if (fromKey != null)
		{
			return fromKey;
		}
		if (title == null || title.trim().isEmpty())
		{
			return null;
		}
		return title.trim().replaceFirst("^(?:Train|Push|Complete|Finish|Do|Hunt|Get|Obtain) ", "");
	}

	private static String fromKey(String key)
	{
		String[] p = key.split(":", -1);
		try
		{
			switch (p[0])
			{
				case "lvl":
					return p[2] + " " + cap(p[1]);
				case "xp":
					return fmt(Long.parseLong(p[2])) + " " + cap(p[1]) + " XP";
				case "skill": // a route step: "skill:<skill>:<target XP>"
					return levelForXp(Long.parseLong(p[2])) + " " + cap(p[1]);
				case "quest":
					return key.substring("quest:".length());
				case "diary":
				{
					int split = key.lastIndexOf(':');
					return key.substring("diary:".length(), split) + " " + cap(key.substring(split + 1)) + " diary";
				}
				case "clogpage":
					return key.substring("clogpage:".length()) + " collection log";
				case "cabundle":
				{
					String rest = key.substring("cabundle:".length());
					int bar = rest.lastIndexOf('|');
					return "Every " + rest.substring(bar + 1) + " task at " + rest.substring(0, bar);
				}
				case "catier":
					return key.substring("catier:".length()) + " combat achievements";
				default:
					return null;
			}
		}
		catch (RuntimeException ex)
		{
			return null;
		}
	}

	/** The level a total XP gives (the game's XP table, levels 1-99). */
	static int levelForXp(long xp)
	{
		double points = 0;
		for (int lvl = 1; lvl < 99; lvl++)
		{
			points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7.0));
			if (xp < (long) Math.floor(points / 4))
			{
				return lvl;
			}
		}
		return 99;
	}

	private static String str(Map<String, Object> g, String field)
	{
		Object v = g.get(field);
		if (!(v instanceof String) || ((String) v).isEmpty())
		{
			throw new IllegalArgumentException(field);
		}
		return (String) v;
	}

	/** Whole numbers arrive from Gson as doubles (85.0); keys use them without the ".0". */
	private static long num(Map<String, Object> g, String field)
	{
		Object v = g.get(field);
		if (!(v instanceof Number))
		{
			throw new IllegalArgumentException(field);
		}
		return ((Number) v).longValue();
	}

	private static String cap(String s)
	{
		return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
	}

	private static String fmt(long n)
	{
		return NumberFormat.getIntegerInstance(Locale.ROOT).format(n);
	}
}
