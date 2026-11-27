package com.osrstaskmaster;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.EnumComposition;
import net.runelite.api.Player;
import net.runelite.api.Quest;
import net.runelite.api.QuestState;
import net.runelite.api.Skill;
import net.runelite.api.StructComposition;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;

/**
 * Reads everything the website needs straight from the game client's memory.
 * Must be called on the client thread. Makes no network calls.
 */
@Slf4j
@Singleton
public class SnapshotCollector
{
	public static final int SCHEMA_VERSION = 1;

	// Combat achievement task bitfields, in task-id order (task id N -> varp[N / 32], bit N % 32).
	private static final int[] CA_TASK_VARPS = {
		VarPlayerID.CA_TASK_COMPLETED_0, VarPlayerID.CA_TASK_COMPLETED_1, VarPlayerID.CA_TASK_COMPLETED_2,
		VarPlayerID.CA_TASK_COMPLETED_3, VarPlayerID.CA_TASK_COMPLETED_4, VarPlayerID.CA_TASK_COMPLETED_5,
		VarPlayerID.CA_TASK_COMPLETED_6, VarPlayerID.CA_TASK_COMPLETED_7, VarPlayerID.CA_TASK_COMPLETED_8,
		VarPlayerID.CA_TASK_COMPLETED_9, VarPlayerID.CA_TASK_COMPLETED_10, VarPlayerID.CA_TASK_COMPLETED_11,
		VarPlayerID.CA_TASK_COMPLETED_12, VarPlayerID.CA_TASK_COMPLETED_13, VarPlayerID.CA_TASK_COMPLETED_14,
		VarPlayerID.CA_TASK_COMPLETED_15, VarPlayerID.CA_TASK_COMPLETED_16, VarPlayerID.CA_TASK_COMPLETED_17,
		VarPlayerID.CA_TASK_COMPLETED_18, VarPlayerID.CA_TASK_COMPLETED_19, VarPlayerID.CA_TASK_COMPLETED_20,
	};

	// Cache enums listing CA task structs per tier (easy .. grandmaster) and the struct params on each task.
	private static final int[] CA_TIER_ENUMS = {3981, 3982, 3983, 3984, 3985, 3986};
	private static final String[] CA_TIER_NAMES = {"Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster"};
	private static final int CA_MONSTER_ENUM = 3971;
	private static final int PARAM_CA_ID = 1306;
	private static final int PARAM_CA_NAME = 1308;
	private static final int PARAM_CA_DESCRIPTION = 1309;
	// (Param 1310 is the tier; it isn't read, since each tier has its own enum above.)
	private static final int PARAM_CA_TYPE = 1311;
	private static final int PARAM_CA_MONSTER = 1312;

	private static final String[] DIARY_TIERS = {"easy", "medium", "hard", "elite"};
	private static final Map<String, int[]> DIARY_VARBITS = new LinkedHashMap<>();

	static
	{
		DIARY_VARBITS.put("Ardougne", new int[]{VarbitID.ARDOUGNE_DIARY_EASY_COMPLETE, VarbitID.ARDOUGNE_DIARY_MEDIUM_COMPLETE, VarbitID.ARDOUGNE_DIARY_HARD_COMPLETE, VarbitID.ARDOUGNE_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Desert", new int[]{VarbitID.DESERT_DIARY_EASY_COMPLETE, VarbitID.DESERT_DIARY_MEDIUM_COMPLETE, VarbitID.DESERT_DIARY_HARD_COMPLETE, VarbitID.DESERT_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Falador", new int[]{VarbitID.FALADOR_DIARY_EASY_COMPLETE, VarbitID.FALADOR_DIARY_MEDIUM_COMPLETE, VarbitID.FALADOR_DIARY_HARD_COMPLETE, VarbitID.FALADOR_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Fremennik", new int[]{VarbitID.FREMENNIK_DIARY_EASY_COMPLETE, VarbitID.FREMENNIK_DIARY_MEDIUM_COMPLETE, VarbitID.FREMENNIK_DIARY_HARD_COMPLETE, VarbitID.FREMENNIK_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Kandarin", new int[]{VarbitID.KANDARIN_DIARY_EASY_COMPLETE, VarbitID.KANDARIN_DIARY_MEDIUM_COMPLETE, VarbitID.KANDARIN_DIARY_HARD_COMPLETE, VarbitID.KANDARIN_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Karamja", new int[]{VarbitID.ATJUN_EASY_DONE, VarbitID.ATJUN_MED_DONE, VarbitID.ATJUN_HARD_DONE, VarbitID.KARAMJA_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Kourend & Kebos", new int[]{VarbitID.KOUREND_DIARY_EASY_COMPLETE, VarbitID.KOUREND_DIARY_MEDIUM_COMPLETE, VarbitID.KOUREND_DIARY_HARD_COMPLETE, VarbitID.KOUREND_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Lumbridge & Draynor", new int[]{VarbitID.LUMBRIDGE_DIARY_EASY_COMPLETE, VarbitID.LUMBRIDGE_DIARY_MEDIUM_COMPLETE, VarbitID.LUMBRIDGE_DIARY_HARD_COMPLETE, VarbitID.LUMBRIDGE_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Morytania", new int[]{VarbitID.MORYTANIA_DIARY_EASY_COMPLETE, VarbitID.MORYTANIA_DIARY_MEDIUM_COMPLETE, VarbitID.MORYTANIA_DIARY_HARD_COMPLETE, VarbitID.MORYTANIA_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Varrock", new int[]{VarbitID.VARROCK_DIARY_EASY_COMPLETE, VarbitID.VARROCK_DIARY_MEDIUM_COMPLETE, VarbitID.VARROCK_DIARY_HARD_COMPLETE, VarbitID.VARROCK_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Western Provinces", new int[]{VarbitID.WESTERN_DIARY_EASY_COMPLETE, VarbitID.WESTERN_DIARY_MEDIUM_COMPLETE, VarbitID.WESTERN_DIARY_HARD_COMPLETE, VarbitID.WESTERN_DIARY_ELITE_COMPLETE});
		DIARY_VARBITS.put("Wilderness", new int[]{VarbitID.WILDERNESS_DIARY_EASY_COMPLETE, VarbitID.WILDERNESS_DIARY_MEDIUM_COMPLETE, VarbitID.WILDERNESS_DIARY_HARD_COMPLETE, VarbitID.WILDERNESS_DIARY_ELITE_COMPLETE});
	}

	/**
	 * Set once any task in a region's diary is done: the in-game diary journal shows those regions
	 * in yellow. It is per region, not per tier.
	 */
	private static final Map<String, Integer> DIARY_STARTED_VARBITS = new LinkedHashMap<>();

	static
	{
		DIARY_STARTED_VARBITS.put("Ardougne", VarbitID.STARTED_ARDOUGNE_DIARY);
		DIARY_STARTED_VARBITS.put("Desert", VarbitID.STARTED_DESERT_DIARY);
		DIARY_STARTED_VARBITS.put("Falador", VarbitID.STARTED_FALADOR_DIARY);
		DIARY_STARTED_VARBITS.put("Fremennik", VarbitID.STARTED_FREMENNIK_DIARY);
		DIARY_STARTED_VARBITS.put("Kandarin", VarbitID.STARTED_KANDARIN_DIARY);
		DIARY_STARTED_VARBITS.put("Karamja", VarbitID.ATJUN_STARTED);
		DIARY_STARTED_VARBITS.put("Kourend & Kebos", VarbitID.STARTED_KOUREND_DIARY);
		DIARY_STARTED_VARBITS.put("Lumbridge & Draynor", VarbitID.STARTED_LUMBRIDGE_DIARY);
		DIARY_STARTED_VARBITS.put("Morytania", VarbitID.STARTED_MORYTANIA_DIARY);
		DIARY_STARTED_VARBITS.put("Varrock", VarbitID.STARTED_VARROCK_DIARY);
		DIARY_STARTED_VARBITS.put("Western Provinces", VarbitID.STARTED_WESTERN_DIARY);
		DIARY_STARTED_VARBITS.put("Wilderness", VarbitID.STARTED_WILDERNESS_DIARY);
	}

	private static final String[] ACCOUNT_TYPES = {
		"Normal", "Ironman", "Ultimate Ironman", "Hardcore Ironman",
		"Group Ironman", "Hardcore Group Ironman", "Unranked Group Ironman"
	};

	@Inject
	private Client client;

	@Inject
	private ProgressStore store;

	/** Cached CA task definitions; read from the game cache once per session. */
	private List<Map<String, Object>> caTaskDefs;

	public Map<String, Object> collect()
	{
		Map<String, Object> s = new LinkedHashMap<>();
		s.put("schema", SCHEMA_VERSION);
		s.put("syncedAt", System.currentTimeMillis());
		s.put("player", player());
		s.put("skills", skills());
		s.put("questPoints", client.getVarpValue(VarPlayerID.QP));
		s.put("quests", quests());
		s.put("diaries", diaries());
		s.put("diaryStarted", diaryStarted());
		s.put("combatAchievements", combatAchievements());
		s.put("slayer", slayer());
		return s;
	}

	// ---- Slayer ---------------------------------------------------------------------------
	// Task names come from the cache's slayer DB tables, the same way RuneLite's Slayer plugin reads them.
	private static final int DB_SLAYER_TASK_BY_TARGET = 113; // column 0: target id
	private static final int DB_SLAYER_BOSS = 116;           // column 1: boss id, column 4: task row
	private static final int DB_SLAYER_AREA = 115;           // column 0: area id, column 3: name
	private static final int DB_SLAYER_TASK_NAME_COL = 10;
	private static final int TARGET_BOSS = 98;
	private static final int MASTER_KRYSTILIA = 7;
	private static final int MODIFIER_SIZE = 2;

	private Map<String, Object> slayer()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("points", client.getVarbitValue(VarbitID.SLAYER_POINTS));
		out.put("streak", client.getVarbitValue(VarbitID.SLAYER_TASKS_COMPLETED));
		int master = client.getVarbitValue(VarbitID.SLAYER_MASTER);
		out.put("masterId", master);

		int remaining = client.getVarpValue(VarPlayerID.SLAYER_COUNT);
		if (remaining > 0)
		{
			Map<String, Object> t = new LinkedHashMap<>();
			int target = client.getVarpValue(VarPlayerID.SLAYER_TARGET);
			t.put("name", slayerTaskName(target, client.getVarbitValue(VarbitID.SLAYER_TARGET_BOSSID)));
			t.put("boss", target == TARGET_BOSS);
			t.put("remaining", remaining);
			int initial = client.getVarpValue(VarPlayerID.SLAYER_COUNT_ORIGINAL);
			// A task-size modifier changes the assigned amount after the original count was set.
			if (client.getVarbitValue(VarbitID.SLAYER_MODIFIER_ID) == MODIFIER_SIZE)
			{
				int v = client.getVarbitValue(VarbitID.SLAYER_MODIFIER_VALUE);
				initial += client.getVarbitValue(VarbitID.SLAYER_MODIFIER_NEGATIVE) == 1 ? -v : v;
			}
			t.put("initial", Math.max(initial, remaining));
			t.put("location", slayerArea(client.getVarpValue(VarPlayerID.SLAYER_AREA)));
			t.put("wilderness", master == MASTER_KRYSTILIA);
			out.put("task", t);
		}

		// Task storage (a Slayer reward). SLAYER_STORED_VARP packs the stored master (bits 0-3), boss
		// id (4-10), partner flags (11, 12, 28) and task-size modifier (13-27); nothing else.
		Map<String, Object> st = new LinkedHashMap<>();
		st.put("unlocked", client.getVarbitValue(VarbitID.SLAYER_UNLOCK_STORAGE) > 0);
		int raw = client.getVarpValue(VarPlayerID.SLAYER_STORED_VARP);
		st.put("raw", raw);
		st.put("masterId", client.getVarbitValue(VarbitID.SLAYER_MASTER_STORED));
		st.put("bossId", client.getVarbitValue(VarbitID.SLAYER_TARGET_BOSSID_STORED));
		out.put("storage", st);
		// The stored creature and amount aren't in any varp the client receives; the game only shows
		// them in the Slayer rewards interface, where the plugin reads them (see TaskMasterPlugin).
		ProgressStore.StoredTask seen = store.storedSlayer;
		// A "stored" task identical to the current one is a misread from an older plugin version.
		Object cur = out.get("task");
		boolean sameAsCurrent = seen != null && cur instanceof Map
			&& seen.name != null && seen.name.equalsIgnoreCase(String.valueOf(((Map<?, ?>) cur).get("name")))
			&& Integer.valueOf(seen.amount).equals(((Map<?, ?>) cur).get("remaining"));
		if (seen != null && seen.varp == raw && raw != 0 && !sameAsCurrent)
		{
			st.put("name", seen.name);
			st.put("amount", seen.amount);
		}
		if (raw != 0)
		{
			log.debug("OSRS TaskMaster: stored slayer varp={} (0x{}), master={}, boss={}", raw, Integer.toHexString(raw),
				st.get("masterId"), st.get("bossId"));
		}
		return out;
	}

	/** The current Slayer task's creature name, or null without a task. Client thread. */
	public String currentSlayerTaskName()
	{
		if (client.getVarpValue(VarPlayerID.SLAYER_COUNT) <= 0)
		{
			return null;
		}
		return slayerTaskName(client.getVarpValue(VarPlayerID.SLAYER_TARGET), client.getVarbitValue(VarbitID.SLAYER_TARGET_BOSSID));
	}

	private String slayerTaskName(int target, int bossId)
	{
		try
		{
			List<Integer> rows = target == TARGET_BOSS
				? client.getDBRowsByValue(DB_SLAYER_BOSS, 1, 0, bossId)
				: client.getDBRowsByValue(DB_SLAYER_TASK_BY_TARGET, 0, 0, target);
			if (rows == null || rows.isEmpty())
			{
				return null;
			}
			int taskRow = target == TARGET_BOSS ? (Integer) client.getDBTableField(rows.get(0), 4, 0)[0] : rows.get(0);
			return (String) client.getDBTableField(taskRow, DB_SLAYER_TASK_NAME_COL, 0)[0];
		}
		catch (Exception ex)
		{
			log.warn("OSRS TaskMaster: could not read the slayer task name", ex);
			return null;
		}
	}

	private String slayerArea(int area)
	{
		if (area <= 0)
		{
			return null;
		}
		try
		{
			List<Integer> rows = client.getDBRowsByValue(DB_SLAYER_AREA, 0, 0, area);
			return rows == null || rows.isEmpty() ? null : (String) client.getDBTableField(rows.get(0), 3, 0)[0];
		}
		catch (Exception ex)
		{
			return null;
		}
	}

	private Map<String, Object> player()
	{
		Map<String, Object> p = new LinkedHashMap<>();
		Player lp = client.getLocalPlayer();
		p.put("name", lp == null ? null : lp.getName());
		p.put("combatLevel", lp == null ? 0 : lp.getCombatLevel());
		int type = client.getVarbitValue(VarbitID.IRONMAN);
		p.put("accountType", type >= 0 && type < ACCOUNT_TYPES.length ? ACCOUNT_TYPES[type] : "Unknown");
		p.put("world", client.getWorld());
		return p;
	}

	private Map<String, Object> skills()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		long totalXp = 0;
		int totalLevel = 0;
		for (Skill skill : Skill.values())
		{
			if ("Overall".equalsIgnoreCase(skill.getName()))
			{
				continue;
			}
			Map<String, Object> e = new LinkedHashMap<>();
			int level = client.getRealSkillLevel(skill);
			int xp = client.getSkillExperience(skill);
			e.put("level", level);
			e.put("xp", xp);
			out.put(skill.getName().toLowerCase(), e);
			totalLevel += level;
			totalXp += xp;
		}
		Map<String, Object> overall = new LinkedHashMap<>();
		overall.put("level", totalLevel);
		overall.put("xp", totalXp);
		out.put("overall", overall);
		return out;
	}

	private List<Map<String, Object>> quests()
	{
		List<Map<String, Object>> out = new ArrayList<>();
		for (Quest q : Quest.values())
		{
			Map<String, Object> e = new LinkedHashMap<>();
			e.put("name", q.getName());
			QuestState st;
			try
			{
				st = q.getState(client);
			}
			catch (Exception ex)
			{
				continue;
			}
			e.put("state", st.name());
			out.add(e);
		}
		return out;
	}

	private Map<String, Object> diaries()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		for (Map.Entry<String, int[]> d : DIARY_VARBITS.entrySet())
		{
			Map<String, Object> tiers = new LinkedHashMap<>();
			for (int i = 0; i < DIARY_TIERS.length; i++)
			{
				tiers.put(DIARY_TIERS[i], client.getVarbitValue(d.getValue()[i]) > 0);
			}
			out.put(d.getKey(), tiers);
		}
		return out;
	}

	/** Region name to whether any of its diary tasks are done. Kept apart from {@code diaries} so tier counts stay simple. */
	private Map<String, Object> diaryStarted()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		for (Map.Entry<String, Integer> d : DIARY_STARTED_VARBITS.entrySet())
		{
			out.put(d.getKey(), client.getVarbitValue(d.getValue()) > 0);
		}
		return out;
	}

	private Map<String, Object> combatAchievements()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("points", client.getVarbitValue(VarbitID.CA_POINTS));

		Map<String, Object> thresholds = new LinkedHashMap<>();
		thresholds.put("Easy", client.getVarbitValue(VarbitID.CA_THRESHOLD_EASY));
		thresholds.put("Medium", client.getVarbitValue(VarbitID.CA_THRESHOLD_MEDIUM));
		thresholds.put("Hard", client.getVarbitValue(VarbitID.CA_THRESHOLD_HARD));
		thresholds.put("Elite", client.getVarbitValue(VarbitID.CA_THRESHOLD_ELITE));
		thresholds.put("Master", client.getVarbitValue(VarbitID.CA_THRESHOLD_MASTER));
		thresholds.put("Grandmaster", client.getVarbitValue(VarbitID.CA_THRESHOLD_GRANDMASTER));
		out.put("thresholds", thresholds);

		int[] bits = new int[CA_TASK_VARPS.length];
		for (int i = 0; i < bits.length; i++)
		{
			bits[i] = client.getVarpValue(CA_TASK_VARPS[i]);
		}

		List<Map<String, Object>> tasks = new ArrayList<>();
		for (Map<String, Object> def : taskDefs())
		{
			int id = (Integer) def.get("id");
			int word = id / 32;
			boolean done = word < bits.length && ((bits[word] >>> (id % 32)) & 1) == 1;
			Map<String, Object> t = new LinkedHashMap<>(def);
			t.put("done", done);
			tasks.add(t);
		}
		out.put("tasks", tasks);
		return out;
	}

	private List<Map<String, Object>> taskDefs()
	{
		if (caTaskDefs != null && !caTaskDefs.isEmpty())
		{
			return caTaskDefs;
		}
		List<Map<String, Object>> defs = new ArrayList<>();
		try
		{
			EnumComposition monsters = client.getEnum(CA_MONSTER_ENUM);
			for (int tier = 0; tier < CA_TIER_ENUMS.length; tier++)
			{
				EnumComposition e = client.getEnum(CA_TIER_ENUMS[tier]);
				if (e == null)
				{
					continue;
				}
				for (int structId : e.getIntVals())
				{
					StructComposition sc = client.getStructComposition(structId);
					if (sc == null)
					{
						continue;
					}
					Map<String, Object> d = new LinkedHashMap<>();
					d.put("id", sc.getIntValue(PARAM_CA_ID));
					d.put("name", sc.getStringValue(PARAM_CA_NAME));
					d.put("description", sc.getStringValue(PARAM_CA_DESCRIPTION));
					d.put("tier", CA_TIER_NAMES[tier]);
					d.put("type", sc.getIntValue(PARAM_CA_TYPE));
					int monsterId = sc.getIntValue(PARAM_CA_MONSTER);
					String monster = monsters == null ? null : monsters.getStringValue(monsterId);
					d.put("monster", monster == null || monster.isEmpty() ? "Other" : monster);
					defs.add(d);
				}
			}
		}
		catch (Exception ex)
		{
			log.warn("OSRS TaskMaster: could not read combat achievement tasks from cache", ex);
		}
		caTaskDefs = defs;
		return defs;
	}
}
