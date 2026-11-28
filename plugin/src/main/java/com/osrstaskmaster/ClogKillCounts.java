package com.osrstaskmaster;

import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Kill counts from the header of a collection log page, e.g. "Zulrah kills: 87" or
 * "Chambers of Xeric completions: 30". Players who killed a boss before installing the plugin
 * get its count by opening the boss's page, instead of waiting for their next kill message.
 *
 * Names are stored the way the kill-count chat message names them ("Zulrah", "Barrows"), so
 * both sources fill the same entry.
 */
final class ClogKillCounts
{
	/** "Name what: 1,234" (tags already removed). */
	private static final Pattern LINE = Pattern.compile("^(.+?):\\s*([\\d,]+)$");
	/** What's counted, removed to leave the boss or activity name. Lines without one are ignored. */
	private static final Pattern COUNTED = Pattern.compile(
		"\\s+(?:chests? opened|(?:kill|chest|completion|harvest|success|lap) count|completions?|completed|kills?|opened|chests?"
			+ "|harvests?|subdued|successes|laps?|runs?|count)$",
		Pattern.CASE_INSENSITIVE);

	private ClogKillCounts()
	{
	}

	/** The boss or activity name and its count, or null if the line isn't a kill count. */
	static Map.Entry<String, Integer> parse(String line)
	{
		if (line == null)
		{
			return null;
		}
		Matcher m = LINE.matcher(line.replace(' ', ' ').trim());
		if (!m.matches())
		{
			return null;
		}
		Matcher what = COUNTED.matcher(m.group(1).trim());
		if (!what.find())
		{
			return null;
		}
		String name = m.group(1).trim().substring(0, what.start()).trim();
		if (name.isEmpty())
		{
			return null;
		}
		try
		{
			return new AbstractMap.SimpleEntry<>(name, Integer.parseInt(m.group(2).replace(",", "")));
		}
		catch (NumberFormatException e)
		{
			return null;
		}
	}

	/**
	 * Every kill count among a page header's texts (widget text, possibly with colour tags or
	 * several lines), skipping the page title. Null and blank texts are ignored.
	 */
	static List<Map.Entry<String, Integer>> parseAll(List<String> texts, String title)
	{
		List<Map.Entry<String, Integer>> out = new ArrayList<>();
		for (String raw : texts)
		{
			if (raw == null)
			{
				continue;
			}
			for (String line : raw.split("(?i)<br>|\\n"))
			{
				String text = line.replaceAll("<[^>]*>", "").trim();
				if (text.isEmpty() || text.equalsIgnoreCase(title))
				{
					continue;
				}
				Map.Entry<String, Integer> kc = parse(text);
				if (kc != null && out.stream().noneMatch(e -> e.getKey().equalsIgnoreCase(kc.getKey())))
				{
					out.add(kc);
				}
			}
		}
		return out;
	}

	/**
	 * Records a count, matching an existing entry whatever its capitalisation and never lowering
	 * it (counts only go up; a lower number is an older reading). Returns true if anything changed.
	 */
	static boolean merge(Map<String, Integer> counts, String name, int count)
	{
		String key = name;
		for (String k : counts.keySet())
		{
			if (k.equalsIgnoreCase(name))
			{
				key = k;
				break;
			}
		}
		Integer old = counts.get(key);
		if (old != null && old >= count)
		{
			return false;
		}
		counts.put(key, count);
		return true;
	}
}
