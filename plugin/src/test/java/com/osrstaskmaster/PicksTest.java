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
		assertNull("no route pinned", reply.picks.route);
	}

	@Test
	public void readsThePinnedRoute()
	{
		String json = "{\"picks\": {\"tiers\": {}, \"route\": {\"goals\": [\"Dragon Slayer II\", \"85 Slayer\"],"
			+ " \"done\": 2, \"total\": 9, \"left\": 7, \"time\": \"About 1 hour\", \"steps\": ["
			+ "{\"key\": \"skill:crafting:368599\", \"title\": \"Train Crafting to 62\", \"hours\": \"under an hour\", \"for\": [\"Dragon Slayer II\"], \"goal\": false, \"note\": null},"
			+ "{\"key\": \"quest:Bone Voyage\", \"title\": \"Do Bone Voyage\", \"hours\": null, \"for\": [\"Dragon Slayer II\"], \"goal\": false, \"note\": \"Also needs: 100 Kudos.\"},"
			+ "{\"key\": \"quest:Dragon Slayer II\", \"title\": \"Do Dragon Slayer II\", \"for\": [\"Dragon Slayer II\"], \"goal\": true}]}}}";
		Picks.Route route = new Gson().fromJson(json, Picks.Reply.class).picks.route;
		assertNotNull(route);
		assertEquals(3, route.steps().size());
		assertEquals(9, route.total);
		Picks.Step crafting = route.steps().get(0);
		assertEquals("skill:crafting:368599", crafting.key);
		assertEquals(java.util.Arrays.asList("Dragon Slayer II"), crafting.forGoals);
		assertEquals("Under an hour · For: Dragon Slayer II", TaskMasterPanel.stepDetail(crafting, true));
		assertEquals("Under an hour", TaskMasterPanel.stepDetail(crafting, false));
		assertEquals("Also needs: 100 Kudos.", TaskMasterPanel.stepDetail(route.steps().get(1), false));
		assertEquals("Finishes a goal", TaskMasterPanel.stepDetail(route.steps().get(2), true));
	}

	@Test
	public void readsTheTimeEstimateForFastestLogsFirst()
	{
		// With "Fastest logs first" on, log and pet picks carry a rough time; others don't.
		String json = "{\"picks\": {\"tiers\": {\"Medium\": ["
			+ "{\"id\": \"clog:1\", \"title\": \"Get Frozen tear\", \"category\": \"clog\", \"est\": \"~3 h\"},"
			+ "{\"id\": \"quest:x\", \"title\": \"Do X\", \"category\": \"quests\", \"est\": null}]}}}";
		Picks picks = new Gson().fromJson(json, Picks.Reply.class).picks;
		assertEquals(" · ~3 h", TaskMasterPanel.estLabel(picks.tier("Medium").get(0)));
		assertEquals("", TaskMasterPanel.estLabel(picks.tier("Medium").get(1)));
	}
}
