package com.osrstaskmaster;

import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.ConfigSection;
import net.runelite.client.config.Range;

/**
 * Plugin settings shown under Configuration &gt; OSRS TaskMaster. Automatic upload to the
 * OSRS TaskMaster service ({@code sync/}) is off by default; copy and paste never sends anything.
 */
@ConfigGroup(TaskMasterConfig.GROUP)
public interface TaskMasterConfig extends Config
{
	String GROUP = "osrstaskmaster";
	String DEFAULT_WEBSITE = "https://j0ffis.github.io/OSRS-TaskMaster/";
	/** The OSRS TaskMaster upload service (sync/ in the project). Set when it's deployed. */
	String DEFAULT_UPLOAD_SERVER = "https://osrs-taskmaster-sync.j0ffis.workers.dev";

	/**
	 * The go-live switch for Automatic upload, shared with UPLOAD_LIVE in web/config.js. Flip both
	 * with scripts\Set-UploadLive.ps1 (tests/upload-switch.test.mjs fails if they differ). While
	 * false, the upload settings are closed and marked "not live yet", and the panel points testers
	 * to Test Auto-Upload.bat: switching it on here would upload to a server that isn't running.
	 * Test Auto-Upload.bat turns uploading on for its run whatever this says.
	 */
	boolean UPLOAD_LIVE = false;

	@ConfigItem(
		keyName = "websiteUrl",
		name = "Website",
		description = "Opened by the panel's Open website button.",
		position = 1
	)
	default String websiteUrl()
	{
		return DEFAULT_WEBSITE;
	}

	@ConfigItem(
		keyName = "autoSync",
		name = "Keep profile up to date",
		description = "Refresh your profile on login and whenever your progress changes"
			+ " (and upload it, if Automatic upload is on).",
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

	// Completion alerts need the goals and suggestions from the website, so for now they work with
	// Automatic upload (or Test Auto-Upload.bat) only.
	@ConfigItem(
		keyName = "completionChat",
		name = "Chat message when done",
		description = "Say in the chat box when you finish one of your goals or a suggestion from the panel"
			+ " (needs Automatic upload).",
		position = 4
	)
	default boolean completionChat()
	{
		return true;
	}

	@ConfigItem(
		keyName = "completionPopup",
		name = "Pop-up when done",
		description = "Show \"... completed!\" above your character when you finish one of your goals or a"
			+ " suggestion from the panel (needs Automatic upload).",
		position = 5
	)
	default boolean completionPopup()
	{
		return true;
	}

	// Wording and closed-by-default follow UPLOAD_LIVE (constant expressions, so they work here).
	@ConfigSection(
		name = UPLOAD_LIVE ? "Automatic upload" : "Automatic upload (not live yet)",
		description = UPLOAD_LIVE
			? "Optional: keep your profile on the OSRS TaskMaster server so the website is always up to date."
			: "The OSRS TaskMaster upload server isn't running yet, so leave this off and use Copy my profile."
				+ " To try Automatic upload, start TaskMaster with Test Auto-Upload.bat instead (see TESTER-GUIDE.md).",
		position = 10,
		closedByDefault = !UPLOAD_LIVE
	)
	String uploadSection = "upload";

	@ConfigItem(
		keyName = "autoUpload",
		name = "Automatic upload",
		description = "Upload your profile to the OSRS TaskMaster server, so the website always shows your latest"
			+ " progress without copying and pasting. This sends your levels, quests, diaries, combat achievements"
			+ " and collection log (never your bank or gear). Off unless you switch it on."
			+ (UPLOAD_LIVE ? "" : " Not live yet: to try it, use Test Auto-Upload.bat, which doesn't need this setting."),
		section = uploadSection,
		position = 11
	)
	default boolean autoUpload()
	{
		return false;
	}

	@ConfigItem(
		keyName = "publicProfile",
		name = "Show my profile publicly",
		description = "Let anyone look up your suggestions by your name on the website."
			+ " Off: only people you give your link to can see it.",
		section = uploadSection,
		position = 12
	)
	default boolean publicProfile()
	{
		return false;
	}

	@ConfigItem(
		keyName = "uploadServer",
		name = "Upload server",
		description = "Where uploads go. Leave as it is unless you run your own copy of the OSRS TaskMaster service.",
		section = uploadSection,
		position = 13
	)
	default String uploadServer()
	{
		return DEFAULT_UPLOAD_SERVER;
	}
}
