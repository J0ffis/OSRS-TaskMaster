package com.osrstaskmaster;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

public class PickProgressTest
{
	// The plugin's profile shape (SnapshotCollector + collectionLog()), cut down.
	private static final JsonObject PROFILE = new JsonParser().parse("{"
		+ "\"skills\": {\"slayer\": {\"level\": 85, \"xp\": 3300000}, \"agility\": {\"level\": 70, \"xp\": 737627}},"
		+ "\"quests\": [{\"name\": \"Dragon Slayer II\", \"state\": \"FINISHED\"}, {\"name\": \"Song of the Elves\", \"state\": \"IN_PROGRESS\"}],"
		+ "\"diaries\": {\"Ardougne\": {\"easy\": true, \"medium\": true, \"hard\": false, \"elite\": false}},"
		+ "\"combatAchievements\": {\"tasks\": ["
		+ "  {\"id\": 1, \"monster\": \"Zulrah\", \"tier\": \"Easy\", \"done\": true},"
		+ "  {\"id\": 2, \"monster\": \"Zulrah\", \"tier\": \"Easy\", \"done\": true},"
		+ "  {\"id\": 3, \"monster\": \"Zulrah\", \"tier\": \"Hard\", \"done\": false}]},"
		+ "\"collectionLog\": {\"items\": {\"4151\": 1},"
		+ "  \"pages\": {\"Abyssal Sire\": {\"items\": [{\"id\": 13262, \"quantity\": 2}, {\"id\": 13273, \"quantity\": 0}]},"
		+ "             \"Small page\": {\"items\": [{\"id\": 4151, \"quantity\": 1}, {\"id\": 13262, \"quantity\": 1}]}}}"
		+ "}").getAsJsonObject();

	private static boolean done(String id)
	{
		return PickProgress.isDone(id, PROFILE);
	}

	@Test
	public void finishedThingsAreDone()
	{
		assertTrue(done("lvl:slayer:85"));
		assertTrue(done("xp:slayer:3000000"));
		assertTrue(done("quest:Dragon Slayer II"));
		assertTrue(done("diary:Ardougne:medium"));
		assertTrue(done("ca:1"));
		assertTrue(done("cabundle:Zulrah|Easy"));
		assertTrue(done("clog:4151"));
		assertTrue(done("clog:13262"));
		assertTrue(done("pet:4151"));
		assertTrue(done("clogpage:Small page"));
		// Route steps (the website's route planner).
		assertTrue(done("skill:agility:737627"));
		assertFalse(done("skill:agility:737628"));
		assertFalse(done("qp"));
	}

	@Test
	public void unfinishedOrUnknownThingsAreNot()
	{
		assertFalse(done("lvl:slayer:90"));
		assertFalse(done("lvl:attack:50"));
		assertFalse(done("quest:Song of the Elves"));
		assertFalse(done("quest:Not a quest"));
		assertFalse(done("diary:Ardougne:hard"));
		assertFalse(done("diary:Nowhere:easy"));
		assertFalse(done("ca:3"));
		assertFalse(done("ca:99"));
		assertFalse(done("cabundle:Zulrah|Hard"));
		assertFalse(done("cabundle:Vorkath|Easy"));
		assertFalse(done("clog:13273"));
		assertFalse(done("clogpage:Abyssal Sire"));
		// Kinds the plugin can't judge stay on the list.
		assertFalse(done("clogfam:Barrows Chests:ahrim"));
		assertFalse(done("goal:g1"));
		assertFalse(done("quest:cape"));
		assertFalse(done("lvl:broken"));
		assertFalse(done(null));
	}
}
