package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
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
	public void readsAWholeHeader()
	{
		// The header container's children, with colour tags, read alongside its title text widget,
		// so the same line may come twice; blank and null texts are skipped.
		List<Map.Entry<String, Integer>> kcs = ClogKillCounts.parseAll(Arrays.asList(
			"Dagannoth Kings", null, "",
			"Obtained: <col=ff0000>5/14</col>",
			"Dagannoth Rex kills: <col=ffffff>410</col>",
			"Dagannoth Prime kills: <col=ffffff>1,388</col><br>Dagannoth Supreme kills: <col=ffffff>402</col>",
			"Dagannoth Rex kills: <col=ffffff>410</col>",
			"Dagannoth Kings"), "Dagannoth Kings");
		assertEquals(3, kcs.size());
		assertEquals("Dagannoth Rex", kcs.get(0).getKey());
		assertEquals(Integer.valueOf(410), kcs.get(0).getValue());
		assertEquals("Dagannoth Prime", kcs.get(1).getKey());
		assertEquals(Integer.valueOf(1388), kcs.get(1).getValue());
		assertEquals("Dagannoth Supreme", kcs.get(2).getKey());
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
