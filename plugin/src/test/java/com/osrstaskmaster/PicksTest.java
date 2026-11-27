package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import com.google.gson.Gson;
import org.junit.Test;

public class PicksTest
{
	@Test
	public void readsTheGoalEachPickWouldMake()
	{
		// GET /v1/picks/:id, cut down: one pick that can be a goal and one that can't.
		String json = "{\"picks\": {\"tiers\": {\"Quick\": ["
			+ "{\"id\": \"quest:Dragon Slayer II\", \"title\": \"Finish Dragon Slayer II\", \"category\": \"quests\","
			+ " \"goal\": {\"type\": \"quest\", \"quest\": \"Dragon Slayer II\"}},"
			+ "{\"id\": \"odd\", \"title\": \"Something\", \"goal\": null}]}}, \"picksAt\": 5}";
		Picks.Reply reply = new Gson().fromJson(json, Picks.Reply.class);
		Picks.Pick first = reply.picks.tier("Quick").get(0);
		assertNotNull(first.goal);
		assertEquals("quest", first.goal.get("type"));
		assertNull(reply.picks.tier("Quick").get(1).goal);
		assertEquals(Long.valueOf(5), reply.picksAt);
	}
}
