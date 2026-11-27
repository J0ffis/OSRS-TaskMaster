package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;

public class ClogKillCountsTest
{
	private static void assertParsed(String line, String name, int count)
	{
		Map.Entry<String, Integer> e = ClogKillCounts.parse(line);
		assertEquals(line, name, e == null ? null : e.getKey());
		assertEquals(line, Integer.valueOf(count), e.getValue());
	}

	@Test
	public void readsKillCountLines()
	{
		assertParsed("Zulrah kills: 87", "Zulrah", 87);
		assertParsed("Abyssal Sire kills: 1,204", "Abyssal Sire", 1204);
		assertParsed("Chambers of Xeric completions: 30", "Chambers of Xeric", 30);
		assertParsed("Barrows Chests opened: 214", "Barrows", 214);
		assertParsed("Barrows chest count: 214", "Barrows", 214);
		assertParsed("Gauntlet completion count: 12", "Gauntlet", 12);
		assertParsed("Tempoross subdued: 40", "Tempoross", 40);
		assertParsed("Hespori harvests: 9", "Hespori", 9);
		assertParsed("Zulrah kills: 87", "Zulrah", 87);
	}

	@Test
	public void ignoresOtherHeaderLines()
	{
		assertNull(ClogKillCounts.parse("Obtained: 5/10"));
		assertNull(ClogKillCounts.parse("Zulrah"));
		assertNull(ClogKillCounts.parse("Kills: 12"));
		assertNull(ClogKillCounts.parse("Rewards claimed: 4"));
		assertNull(ClogKillCounts.parse(""));
		assertNull(ClogKillCounts.parse(null));
	}

	@Test
	public void mergeKeepsExistingSpellingAndNeverLowers()
	{
		Map<String, Integer> kc = new LinkedHashMap<>();
		kc.put("Zulrah", 90);
		assertFalse(ClogKillCounts.merge(kc, "zulrah", 87));
		assertEquals(Integer.valueOf(90), kc.get("Zulrah"));
		assertTrue(ClogKillCounts.merge(kc, "ZULRAH", 95));
		assertEquals(Integer.valueOf(95), kc.get("Zulrah"));
		assertEquals(1, kc.size());
		assertTrue(ClogKillCounts.merge(kc, "Vorkath", 12));
		assertEquals(Integer.valueOf(12), kc.get("Vorkath"));
	}
}
