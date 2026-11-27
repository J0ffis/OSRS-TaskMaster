package com.osrstaskmaster;

import com.google.gson.annotations.SerializedName;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * The website's latest suggestions, as stored by the upload service (GET /v1/picks/:id).
 * The website works them out; the plugin only shows them.
 */
class Picks
{
	/** Tier names used by the website and service, in display order. */
	static final String[] TIERS = {"Quick", "Medium", "Long", "Challenge"};

	Map<String, List<Pick>> tiers;
	String filters;
	/** The route pinned on the website (its route planner), or null when none is pinned. */
	Route route;

	List<Pick> tier(String name)
	{
		List<Pick> list = tiers == null ? null : tiers.get(name);
		return list == null ? Collections.emptyList() : list;
	}

	static class Pick
	{
		String id;
		String title;
		String detail;
		String category;
		Double progress;
		boolean wilderness;
		Icon icon;
		/**
		 * The goal this suggestion would make, as the website built it; null when it can't be a
		 * goal. The plugin only checks it's there: "Make it a goal" sends the pick's id and the
		 * service adds this goal.
		 */
		Map<String, Object> goal;
	}

	static class Icon
	{
		Integer item;
		String skill;
	}

	/**
	 * A pinned route: the steps still to do, in order (at most 30), plus how many were done when
	 * the website saved it. Step keys come from web/recommender.js planRoute
	 * ("skill:slayer:3258594", "quest:Dream Mentor", "qp", "combat", "goal:g1").
	 */
	static class Route
	{
		List<String> goals;
		int done;
		int total;
		int left;
		String time;
		List<Step> steps;

		List<Step> steps()
		{
			return steps == null ? Collections.emptyList() : steps;
		}
	}

	static class Step
	{
		String key;
		String title;
		/** "about 3-5 hours", or null when there's no estimate. */
		String hours;
		/** Which goals the step is on the way to. */
		@SerializedName("for")
		List<String> forGoals;
		/** True when this step finishes one of the goals. */
		boolean goal;
		/** Anything else it needs ("Also needs: 100 Kudos."), or null. */
		String note;
	}

	/** The service's reply: the picks plus when the website saved them. */
	static class Reply
	{
		Picks picks;
		Long picksAt;
		Long uploadedAt;
	}
}
