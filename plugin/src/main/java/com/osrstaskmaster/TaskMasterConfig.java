package com.osrstaskmaster;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Range;

/**
 * Plugin settings shown under Configuration &gt; OSRS TaskMaster. Sending to a server is off by
 * default and only meant for players running the local server in {@code server/}.
 */
@ConfigGroup(TaskMasterConfig.GROUP)
public interface TaskMasterConfig extends Config
{
	String GROUP = "osrstaskmaster";
	String DEFAULT_WEBSITE = "https://j0ffis.github.io/OSRS-TaskMaster/";

	@ConfigItem(
		keyName = "websiteUrl",
		name = "Website",
		description = "Opened by the panel's Open website button. Paste your copied profile there.",
		position = 1
	)
	default String websiteUrl()
	{
		return DEFAULT_WEBSITE;
	}

	@ConfigItem(
		keyName = "autoSync",
		name = "Keep profile up to date",
		description = "Save your profile file on login and whenever your progress changes"
			+ " (and send it to your own server, if that's switched on below).",
		position = 2
	)
	default boolean autoSync()
	{
		return true;
	}

	@Range(min = 1, max = 60)
	@ConfigItem(
		keyName = "minMinutesBetweenSyncs",
		name = "Min minutes between updates",
		description = "Automatic updates never happen more often than this.",
		position = 3
	)
	default int minMinutesBetweenSyncs()
	{
		return 5;
	}

	@ConfigSection(
		name = "Your own server (advanced)",
		description = "Only for people running the OSRS TaskMaster server on their own PC.",
		position = 10,
		closedByDefault = true
	)
	String serverSection = "server";

	@ConfigItem(
		keyName = "serverSync",
		name = "Send to my own server",
		description = "Also send each update to the OSRS TaskMaster server below. Off unless you run that server yourself.",
		section = serverSection,
		position = 11
	)
	default boolean serverSync()
	{
		return false;
	}

	@ConfigItem(
		keyName = "endpoint",
		name = "Server address",
		description = "Where updates are sent when 'Send to my own server' is on.",
		section = serverSection,
		position = 12
	)
	default String endpoint()
	{
		return "http://127.0.0.1:8787/api/sync";
	}

	@ConfigItem(
		keyName = "token",
		name = "Sync token",
		description = "Must match the server's token (shown when Start-LocalServer.ps1 starts).",
		secret = true,
		section = serverSection,
		position = 13
	)
	default String token()
	{
		return "";
	}
}
