package com.osrstaskmaster;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.inject.Inject;
import javax.inject.Singleton;
import net.runelite.client.config.ConfigManager;

/**
 * Data that is only visible at certain moments (collection log open, kill-count chat messages)
 * is remembered here, per RuneScape account, in RuneLite's own profile config.
 */
@Singleton
public class ProgressStore
{
	private static final String KEY = "progress";

	@Inject
	private ConfigManager configManager;

	@Inject
	private Gson gson;

	/** Collection log item id -> quantity obtained (0 entries are items seen but not obtained). */
	public Map<Integer, Integer> clogItems = new LinkedHashMap<>();
	/** Collection log page name -> {tab, items:[ids]} */
	public Map<String, Page> clogPages = new LinkedHashMap<>();
	public Map<String, Integer> killCounts = new LinkedHashMap<>();
	/** The stored Slayer task as last seen in the Slayer rewards interface; null if unknown. */
	public StoredTask storedSlayer;

	public static class StoredTask
	{
		public String name;
		public int amount;
		/** SLAYER_STORED_VARP when it was read: if the varp changes, the stored task changed too. */
		public int varp;
	}

	public static class Page
	{
		public String tab;
		public List<Integer> items = new ArrayList<>();
	}

	// Only these fields are saved; anything else in old saves (such as wealth) is dropped.
	private static class Saved
	{
		Map<Integer, Integer> clogItems;
		Map<String, Page> clogPages;
		Map<String, Integer> killCounts;
		StoredTask storedSlayer;
	}

	public void load()
	{
		clogItems = new LinkedHashMap<>();
		clogPages = new LinkedHashMap<>();
		killCounts = new LinkedHashMap<>();
		storedSlayer = null;

		String json = configManager.getRSProfileConfiguration(TaskMasterConfig.GROUP, KEY);
		if (json == null || json.isEmpty())
		{
			return;
		}
		try
		{
			Type t = new TypeToken<Saved>(){}.getType();
			Saved s = gson.fromJson(json, t);
			if (s.clogItems != null) clogItems = s.clogItems;
			if (s.clogPages != null) clogPages = s.clogPages;
			if (s.killCounts != null) killCounts = s.killCounts;
			storedSlayer = s.storedSlayer;
		}
		catch (Exception ignored)
		{
			// corrupt or old format: start fresh
		}
		// Re-save so any fields from older versions (e.g. wealth) are dropped.
		save();
	}

	public void save()
	{
		Saved s = new Saved();
		s.clogItems = clogItems;
		s.clogPages = clogPages;
		s.killCounts = killCounts;
		s.storedSlayer = storedSlayer;
		configManager.setRSProfileConfiguration(TaskMasterConfig.GROUP, KEY, gson.toJson(s));
	}
}
