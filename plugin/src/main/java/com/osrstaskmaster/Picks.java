package com.osrstaskmaster;

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
	}

	static class Icon
	{
		Integer item;
		String skill;
	}

	/** The service's reply: the picks plus when the website saved them. */
	static class Reply
	{
		Picks picks;
		Long picksAt;
		Long uploadedAt;
	}
}
