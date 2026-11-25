package com.osrstaskmaster;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.Range;

@ConfigGroup(TaskMasterConfig.GROUP)
public interface TaskMasterConfig extends Config
{
	String GROUP = "osrstaskmaster";
	/** Config group used before the rename; settings are moved from it once. */
	String LEGACY_GROUP = "grindplanner";

	@ConfigItem(
		keyName = "endpoint",
		name = "Sync endpoint",
		description = "Where snapshots are sent. Defaults to the OSRS TaskMaster server running on this PC.",
		position = 1
	)
	default String endpoint()
	{
		return "http://127.0.0.1:8787/api/sync";
	}

	@ConfigItem(
		keyName = "token",
		name = "Sync token",
		description = "Shared secret sent with each snapshot. Must match the server's token (see server/token.txt).",
		secret = true,
		position = 2
	)
	default String token()
	{
		return "";
	}

	@ConfigItem(
		keyName = "autoSync",
		name = "Auto sync",
		description = "Send a snapshot on login and whenever your data changes.",
		position = 3
	)
	default boolean autoSync()
	{
		return true;
	}

	@Range(min = 1, max = 60)
	@ConfigItem(
		keyName = "minMinutesBetweenSyncs",
		name = "Min minutes between syncs",
		description = "Auto sync never sends more often than this.",
		position = 4
	)
	default int minMinutesBetweenSyncs()
	{
		return 5;
	}
}
