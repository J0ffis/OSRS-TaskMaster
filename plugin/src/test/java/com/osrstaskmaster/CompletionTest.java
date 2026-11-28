package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.google.gson.Gson;
import com.google.gson.JsonParser;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.Test;

public class CompletionTest
{
	private static final Gson GSON = new Gson();

	@SuppressWarnings("unchecked")
	private static Map<String, Object> goal(String json)
	{
		return GSON.fromJson(json, Map.class);
	}

	@Test
	public void goalsBecomeTheKeysPickProgressJudges()
	{
		assertEquals("lvl:slayer:85", CompletionKeys.goalKey(goal("{\"id\":\"g1\",\"type\":\"skill\",\"skill\":\"slayer\",\"level\":85}")));
		assertEquals("xp:slayer:13034431", CompletionKeys.goalKey(goal("{\"type\":\"xp\",\"skill\":\"slayer\",\"xp\":13034431}")));
		assertEquals("quest:Dragon Slayer II", CompletionKeys.goalKey(goal("{\"type\":\"quest\",\"quest\":\"Dragon Slayer II\"}")));
		assertEquals("diary:Ardougne:hard", CompletionKeys.goalKey(goal("{\"type\":\"diary\",\"region\":\"Ardougne\",\"tier\":\"hard\"}")));
		assertEquals("ca:123", CompletionKeys.goalKey(goal("{\"type\":\"catask\",\"task\":123,\"name\":\"Snake. Snake!?\"}")));
		assertEquals("cabundle:Zulrah|Hard", CompletionKeys.goalKey(goal("{\"type\":\"cabundle\",\"monster\":\"Zulrah\",\"tier\":\"Hard\"}")));
		assertEquals("clogpage:Abyssal Sire", CompletionKeys.goalKey(goal("{\"type\":\"clog\",\"page\":\"Abyssal Sire\"}")));
		assertEquals("catier:Elite", CompletionKeys.goalKey(goal("{\"type\":\"ca\",\"tier\":\"Elite\"}")));
	}

	@Test
	public void goalsThePluginCantJudgeGetNoKey()
	{
		assertNull(CompletionKeys.goalKey(goal("{\"type\":\"pet\",\"pet\":\"Pet snakeling\"}")));
		assertNull(CompletionKeys.goalKey(goal("{\"type\":\"item\",\"item\":\"Abyssal whip\"}")));
		assertNull(CompletionKeys.goalKey(goal("{\"type\":\"custom\",\"text\":\"Buy a house\"}")));
		assertNull("no level", CompletionKeys.goalKey(goal("{\"type\":\"skill\",\"skill\":\"slayer\"}")));
		assertNull(CompletionKeys.goalKey(null));
	}

	@Test
	public void labelsSayWhatWasFinished()
	{
		assertEquals("85 Slayer", CompletionKeys.label("lvl:slayer:85", "Train Slayer to 85"));
		assertEquals("13,034,431 Slayer XP", CompletionKeys.label("xp:slayer:13034431", null));
		assertEquals("80 Slayer", CompletionKeys.label("skill:slayer:1986068", "Train Slayer"));
		assertEquals("Dragon Slayer II", CompletionKeys.label("quest:Dragon Slayer II", "Complete Dragon Slayer II"));
		assertEquals("Ardougne Hard diary", CompletionKeys.label("diary:Ardougne:hard", null));
		assertEquals("Every Hard task at Zulrah", CompletionKeys.label("cabundle:Zulrah|Hard", null));
		assertEquals("Elite combat achievements", CompletionKeys.label("catier:Elite", null));
		assertEquals("Snake. Snake!?", CompletionKeys.label("ca:123", "Snake. Snake!?"));
		assertEquals("Pet snakeling", CompletionKeys.label("pet:12921", "Hunt Pet snakeling"));
		assertEquals(null, CompletionKeys.label("ca:123", null));
	}

	@Test
	public void levelsFromXp()
	{
		assertEquals(1, CompletionKeys.levelForXp(0));
		assertEquals(1, CompletionKeys.levelForXp(82));
		assertEquals(2, CompletionKeys.levelForXp(83));
		assertEquals(80, CompletionKeys.levelForXp(1986068));
		assertEquals(99, CompletionKeys.levelForXp(13034431));
		assertEquals(99, CompletionKeys.levelForXp(200_000_000));
	}

	private static List<String> labels(List<CompletionTracker.Item> items)
	{
		return items.stream().map(i -> i.label).collect(Collectors.toList());
	}

	@Test
	public void onlyWhatThisSessionSawUnfinishedIsAnnounced()
	{
		CompletionTracker t = new CompletionTracker();
		t.setTracked(Arrays.asList(
			new CompletionTracker.Item("lvl:slayer:85", "85 Slayer", false),
			new CompletionTracker.Item("quest:Dragon Slayer II", "Dragon Slayer II", false)));
		Set<String> done = new HashSet<>();
		done.add("quest:Dragon Slayer II"); // already done at login: never announced
		assertTrue(t.check(done::contains).isEmpty());

		done.add("lvl:slayer:85");
		assertEquals(Arrays.asList("85 Slayer"), labels(t.check(done::contains)));
		assertTrue("once only", t.check(done::contains).isEmpty());

		// The website's next list may still have it: still not announced again.
		t.setTracked(Arrays.asList(new CompletionTracker.Item("lvl:slayer:85", "85 Slayer", false)));
		assertTrue(t.check(done::contains).isEmpty());
	}

	@Test
	public void aGoalAndASuggestionForTheSameThingAreOneAnnouncementAsAGoal()
	{
		CompletionTracker t = new CompletionTracker();
		t.setTracked(Arrays.asList(
			new CompletionTracker.Item("lvl:agility:70", "70 Agility", false),
			new CompletionTracker.Item("lvl:slayer:85", "85 Slayer", false),
			new CompletionTracker.Item("lvl:slayer:85", "85 Slayer", true)));
		t.check(k -> false);
		List<CompletionTracker.Item> done = t.check(k -> true);
		assertEquals(Arrays.asList("85 Slayer", "70 Agility"), labels(done));
		assertTrue("goals first", done.get(0).goal);
		assertFalse(done.get(1).goal);
	}

	@Test
	public void itemsWithoutAKeyOrNameAreSkippedAndResetForgetsEverything()
	{
		CompletionTracker t = new CompletionTracker();
		t.setTracked(Arrays.asList(new CompletionTracker.Item(null, "x", true), new CompletionTracker.Item("ca:1", null, false)));
		assertTrue(t.isEmpty());

		t.setTracked(Arrays.asList(new CompletionTracker.Item("xp:slayer:1000", "1,000 Slayer XP", false)));
		t.check(k -> false);
		assertTrue(t.xpTargetReached("slayer", 1000));
		assertFalse(t.xpTargetReached("slayer", 999));
		assertFalse(t.xpTargetReached("attack", 5000));
		t.reset();
		assertTrue(t.isEmpty());
		assertFalse(t.xpTargetReached("slayer", 1000));
	}

	@Test
	public void theWatchListComesFromGoalsPicksAndRoute()
	{
		Picks.Reply reply = GSON.fromJson("{"
			+ "\"goals\": [{\"id\":\"g1\",\"type\":\"skill\",\"skill\":\"slayer\",\"level\":85},"
			+ "            {\"id\":\"g2\",\"type\":\"catask\",\"task\":7,\"name\":\"Whack-a-Mole\"},"
			+ "            {\"id\":\"g3\",\"type\":\"pet\",\"pet\":\"Baby mole\"}],"
			+ "\"picks\": {\"tiers\": {\"Quick\": [{\"id\":\"quest:Dragon Slayer II\",\"title\":\"Complete Dragon Slayer II\"}]},"
			+ "            \"route\": {\"steps\": [{\"key\":\"skill:slayer:1986068\",\"title\":\"Train Slayer to 80\"}]}}"
			+ "}", Picks.Reply.class);
		List<CompletionTracker.Item> watch = CompletionTracker.watchList(reply);
		CompletionTracker t = new CompletionTracker();
		t.setTracked(watch);
		t.check(k -> false);
		List<String> done = labels(t.check(k -> true));
		assertEquals(Arrays.asList("85 Slayer", "Whack-a-Mole", "Dragon Slayer II", "80 Slayer"), done);
		assertTrue(CompletionTracker.watchList(null).isEmpty());
		assertTrue("an older service sends no goals", CompletionTracker.watchList(GSON.fromJson("{\"picks\":null}", Picks.Reply.class)).isEmpty());
	}

	@Test
	public void caTierGoalsAreJudgedFromPoints()
	{
		String ca = "{\"combatAchievements\": {\"points\": 1200, \"thresholds\": {\"Elite\": 1100, \"Master\": 1500, \"Grandmaster\": 0}}}";
		assertTrue(PickProgress.isDone("catier:Elite", new JsonParser().parse(ca).getAsJsonObject()));
		assertFalse(PickProgress.isDone("catier:Master", new JsonParser().parse(ca).getAsJsonObject()));
		assertFalse("unknown threshold", PickProgress.isDone("catier:Grandmaster", new JsonParser().parse(ca).getAsJsonObject()));
	}

	@Test
	public void thePopUpRisesAndFades()
	{
		assertEquals(0f, CompletionOverlay.alpha(0), 0.001);
		assertEquals(1f, CompletionOverlay.alpha(500), 0.001);
		assertTrue(CompletionOverlay.alpha(2500) < 0.5f);
		assertEquals(0f, CompletionOverlay.alpha(CompletionOverlay.DURATION_MS), 0.001);
		assertEquals(0, CompletionOverlay.rise(0));
		assertTrue(CompletionOverlay.rise(1500) > CompletionOverlay.rise(500));
		assertEquals(45, CompletionOverlay.rise(CompletionOverlay.DURATION_MS));
		assertEquals("85 Slayer completed!", CompletionOverlay.text("85 Slayer"));
		assertTrue(CompletionOverlay.text("x".repeat(80)).length() < 60);
	}
}
