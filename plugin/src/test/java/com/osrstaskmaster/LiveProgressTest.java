package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class LiveProgressTest
{
	// The plugin's profile shape (SnapshotCollector + collectionLog()), cut down.
	private static final JsonObject PROFILE = new JsonParser().parse("{"
		+ "\"questPoints\": 40,"
		+ "\"player\": {\"combatLevel\": 70},"
		+ "\"skills\": {\"slayer\": {\"level\": 85, \"xp\": 3300000}},"
		+ "\"quests\": [{\"name\": \"Dragon Slayer II\", \"state\": \"FINISHED\"}],"
		+ "\"diaries\": {\"Ardougne\": {\"easy\": true, \"medium\": true, \"hard\": false, \"elite\": false}},"
		+ "\"combatAchievements\": {\"points\": 300, \"thresholds\": {\"Elite\": 1000}, \"tasks\": ["
		+ "  {\"id\": 1, \"name\": \"Snake Slayer\", \"monster\": \"Zulrah\", \"tier\": \"Easy\", \"done\": true},"
		+ "  {\"id\": 2, \"name\": \"Snake. Snake!?\", \"monster\": \"Zulrah\", \"tier\": \"Easy\", \"done\": false},"
		+ "  {\"id\": 3, \"name\": \"Mutta-diet\", \"monster\": \"Zulrah\", \"tier\": \"Medium\", \"done\": false}]},"
		+ "\"collectionLog\": {\"items\": {},"
		+ "  \"pages\": {"
		+ "    \"Fossil Island Notes\": {\"items\": ["
		+ "      {\"id\": 1, \"name\": \"Partial note\", \"quantity\": 1},"
		+ "      {\"id\": 2, \"name\": \"Ancient note\", \"quantity\": 0},"
		+ "      {\"id\": 3, \"name\": \"Short note\", \"quantity\": 0},"
		+ "      {\"id\": 4, \"name\": \"Old writing\", \"quantity\": 0}]},"
		+ "    \"Zulrah\": {\"items\": ["
		+ "      {\"id\": 12921, \"name\": \"Pet snakeling\", \"quantity\": 0},"
		+ "      {\"id\": 12922, \"name\": \"Tanzanite fang\", \"quantity\": 1},"
		+ "      {\"id\": 12932, \"name\": \"Magic fang\", \"quantity\": 0}]},"
		+ "    \"All Pets\": {\"items\": [{\"id\": 12921, \"name\": \"Pet snakeling\", \"quantity\": 0}]}}}"
		+ "}").getAsJsonObject();

	private static List<Map<String, Object>> goals(String json)
	{
		return new Gson().fromJson(json, new TypeToken<List<Map<String, Object>>>() { }.getType());
	}

	private static final LiveProgress LIVE = new LiveProgress(PROFILE, goals("["
		+ "{\"id\": \"g1\", \"type\": \"family\", \"page\": \"Fossil Island Notes\", \"family\": \"note\","
		+ "  \"items\": [\"Partial note\", \"Ancient note\"]},"
		+ "{\"id\": \"g2\", \"type\": \"family\", \"page\": \"Fossil Island Notes\", \"family\": \"note\","
		+ "  \"items\": [\"Ancient note\", \"Short note\"]},"
		+ "{\"id\": \"g3\", \"type\": \"quest\", \"quest\": \"Dragon Slayer II\"},"
		+ "{\"id\": \"g4\", \"type\": \"skill\", \"skill\": \"slayer\", \"level\": 90},"
		+ "{\"id\": \"g5\", \"type\": \"clog\", \"page\": \"Zulrah\"},"
		+ "{\"id\": \"g6\", \"type\": \"caboss\", \"monster\": \"Zulrah\", \"tier\": \"Easy\"},"
		+ "{\"id\": \"g7\", \"type\": \"item\", \"item\": \"Tanzanite fang\"},"
		+ "{\"id\": \"g8\", \"type\": \"item\", \"item\": \"Not in the log\", \"done\": true}"
		+ "]"));

	private static Picks.Pick pick(String id, String detail, Double progress, String goalJson)
	{
		Picks.Pick p = new Picks.Pick();
		p.id = id;
		p.title = "Title";
		p.detail = detail;
		p.progress = progress;
		p.goal = goalJson == null ? null : new Gson().fromJson(goalJson, new TypeToken<Map<String, Object>>() { }.getType());
		return p;
	}

	private static Picks.Step step(String key, String title)
	{
		Picks.Step s = new Picks.Step();
		s.key = key;
		s.title = title;
		return s;
	}

	@Test
	public void anyMissingPieceIsDoneOnceOneIsLogged()
	{
		// "Get any missing note": the panel used to keep it forever (no "clogfam:" check).
		Picks.Pick got = pick("clogfam:Fossil Island Notes:note", "2 still missing", 0.0,
			"{\"type\": \"family\", \"page\": \"Fossil Island Notes\", \"family\": \"note\", \"items\": [\"Partial note\", \"Ancient note\"]}");
		Picks.Pick notYet = pick("clogfam:Fossil Island Notes:note", "2 still missing", 0.0,
			"{\"type\": \"family\", \"page\": \"Fossil Island Notes\", \"family\": \"note\", \"items\": [\"Ancient note\", \"Short note\"]}");
		assertTrue(LIVE.isDone(got));
		assertFalse(LIVE.isDone(notYet));
	}

	@Test
	public void goalRowsAreJudgedFromTheWebsitesGoals()
	{
		assertTrue(LIVE.isDone("goal:g1"));  // family, one logged
		assertFalse(LIVE.isDone("goal:g2")); // family, none logged
		assertTrue(LIVE.isDone("goal:g3"));  // quest
		assertFalse(LIVE.isDone("goal:g4")); // 85 of 90 Slayer
		assertFalse(LIVE.isDone("goal:g5")); // Zulrah log not complete
		assertFalse(LIVE.isDone("goal:g6")); // one Easy Zulrah task left
		assertTrue(LIVE.isDone("goal:g7"));  // a log item, logged
		assertTrue(LIVE.isDone("goal:g8"));  // not a log item: ticked on the website
		assertFalse(LIVE.isDone("goal:nope"));
		// Route steps that finish a goal use the same key.
		assertTrue(LIVE.isDone(step("goal:g3", "Do Dragon Slayer II")));
	}

	@Test
	public void reachSuggestionsAndRouteTargets()
	{
		assertTrue(LIVE.isDone("reach:quest:Dragon Slayer II"));
		assertFalse(LIVE.isDone("reach:diary:Ardougne:hard"));
		assertTrue(LIVE.isDone("reach:diary:Ardougne:medium"));
		assertTrue(LIVE.isDone(step("qp", "Reach 40 quest points")));
		assertFalse(LIVE.isDone(step("qp", "Reach 41 quest points")));
		assertTrue(LIVE.isDone(step("combat", "Reach combat level 70")));
		assertFalse(LIVE.isDone(step("combat", "Reach combat level 71")));
	}

	@Test
	public void nothingIsDoneWithoutAProfile()
	{
		assertFalse(LiveProgress.NONE.hasProfile());
		assertFalse(LiveProgress.NONE.isDone("quest:Dragon Slayer II"));
		assertFalse(LiveProgress.NONE.isDone(step("qp", "Reach 1 quest points")));
		Picks.Pick p = pick("clogpage:Zulrah", "old", 0.1, null);
		assertSame(p, LiveProgress.NONE.refresh(p));
	}

	@Test
	public void logRowsShowTodaysCounts()
	{
		Picks.Pick page = LIVE.refresh(pick("clogpage:Fossil Island Notes", "0/4 slots. Missing: everything.", 0.0, null));
		assertEquals("1/4 slots. Missing: Ancient note, Short note, Old writing.", page.detail);
		assertEquals(0.25, page.progress, 1e-9);

		// Pets count in the shown slots, not in the bar or the missing list (as on the website).
		Picks.Pick zulrah = LIVE.refresh(pick("clogpage:Zulrah", "old", 0.0, null));
		assertEquals("1/3 slots. Missing: Magic fang (plus the pet).", zulrah.detail);
		assertEquals(0.5, zulrah.progress, 1e-9);

		Picks.Pick fam = LIVE.refresh(pick("clogfam:Fossil Island Notes:note", "2 still missing", 0.0,
			"{\"type\": \"family\", \"page\": \"Fossil Island Notes\", \"items\": [\"Ancient note\", \"Short note\"]}"));
		assertEquals("2 still missing", fam.detail);
		assertEquals(0.25, fam.progress, 1e-9);

		Picks.Pick item = LIVE.refresh(pick("clog:12932", "From the Zulrah collection log page (Bosses tab).", 0.0, null));
		assertEquals(0.5, item.progress, 1e-9);
	}

	@Test
	public void combatAndLevelRows()
	{
		Picks.Pick bundle = LIVE.refresh(pick("cabundle:Zulrah|Easy", "Tasks: old", 0.0, null));
		assertEquals("Tasks: “Snake. Snake!?”", bundle.detail);
		assertEquals(0.5, bundle.progress, 1e-9);

		// Same XP as when the website made it: its time estimate stays.
		long gap = LiveProgress.xpForLevel(90) - 3_300_000;
		String head = "85 → 90: " + LiveProgress.fmt(gap) + " XP to go.";
		assertEquals(head + " About 5-7 hours.", LIVE.refresh(pick("lvl:slayer:90", head + " About 5-7 hours.", 0.1, null)).detail);
		// The XP moved on: the old estimate is left off.
		Picks.Pick moved = LIVE.refresh(pick("lvl:slayer:90", "84 → 90: 2.1M XP to go. About 9-12 hours.", 0.1, null));
		assertEquals(head, moved.detail);
		double expect = (3_300_000.0 - LiveProgress.xpForLevel(85)) / (LiveProgress.xpForLevel(90) - LiveProgress.xpForLevel(85));
		assertEquals(expect, moved.progress, 1e-9);
	}

	@Test
	public void goalRowsCountUp()
	{
		Picks.Pick slayer = LIVE.refresh(pick("goal:g4", "Currently 84/90 Slayer.", 0.5, null));
		assertEquals("Currently 85/90 Slayer.", slayer.detail);
		assertEquals(3_300_000.0 / LiveProgress.xpForLevel(90), slayer.progress, 1e-9);
		Picks.Pick log = LIVE.refresh(pick("goal:g5", "Currently 0/3.", 0.0, null));
		assertEquals("Currently 1/3.", log.detail);
		// Descriptions that aren't a count stay as the website wrote them.
		assertEquals("Any one of: Ancient note, Short note", LIVE.refresh(pick("goal:g2", "Any one of: Ancient note, Short note", 0.0, null)).detail);
	}

	@Test
	public void numbersAndXpLikeTheWebsite()
	{
		assertEquals(0, LiveProgress.xpForLevel(1));
		assertEquals(83, LiveProgress.xpForLevel(2));
		assertEquals(13_034_431, LiveProgress.xpForLevel(99));
		assertEquals("9,500", LiveProgress.fmt(9_500));
		assertEquals("12K", LiveProgress.fmt(12_400));
		assertEquals("1.2M", LiveProgress.fmt(1_210_000));
		assertEquals("2M", LiveProgress.fmt(2_000_000));
		assertEquals("150M", LiveProgress.fmt(150_000_000));
		assertEquals("1.5B", LiveProgress.fmt(1_500_000_000L));
	}
}
