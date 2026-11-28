package com.osrstaskmaster;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.awt.image.BufferedImage;
import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.concurrent.ScheduledExecutorService;
import javax.swing.SwingUtilities;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.EnumComposition;
import net.runelite.api.StructComposition;
import net.runelite.api.GameState;
import net.runelite.api.ItemComposition;
import net.runelite.api.events.ChatMessage;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
import net.runelite.api.events.ScriptPostFired;
import net.runelite.api.events.ScriptPreFired;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.game.ItemManager;
import net.runelite.client.game.SkillIconManager;
import net.runelite.client.game.SpriteManager;
import net.runelite.api.Skill;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.RuneLite;
import net.runelite.client.util.ImageUtil;
import net.runelite.client.util.LinkBrowser;
import net.runelite.client.util.Text;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Entry point of the OSRS TaskMaster plugin.
 *
 * <p>Builds a snapshot of the player's progress ({@link SnapshotCollector}), adds what can only be
 * seen at certain moments (collection log items, kill counts from chat; kept in
 * {@link ProgressStore}), and hands it to the player: copied to the clipboard, saved to
 * {@code .runelite/osrs-taskmaster/<name>.json} and, only if the player switches on Automatic
 * upload, sent to the upload service (sync/). Never reads the bank, inventory or equipment.
 */
@Slf4j
@PluginDescriptor(
	name = "OSRS TaskMaster",
	description = "Suggests what to grind next from your own progress, on the OSRS TaskMaster website",
	tags = {"goals", "planner", "collection", "combat achievements", "diary", "quests"}
)
public class TaskMasterPlugin extends Plugin
{
	private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
	/** Fired once per obtained item when the collection log search is opened: args = [_, itemId, quantity]. */
	private static final int SCRIPT_CLOG_ITEM = 4100;
	/** Fired when a collection log page draws its item grid. */
	private static final int SCRIPT_CLOG_DRAW_LIST = 2731;
	private static final String[] CLOG_TABS = {"Bosses", "Raids", "Clues", "Minigames", "Other"};
	// Collection log layout in the game cache: tabs enum -> tab struct -> pages enum -> page struct -> items enum.
	private static final int CLOG_TABS_ENUM = 2102;
	private static final int PARAM_CLOG_TAB_PAGES = 683;
	private static final int PARAM_CLOG_PAGE_NAME = 689;
	private static final int PARAM_CLOG_PAGE_ITEMS = 690;
	private static final Pattern KC_PATTERN = Pattern.compile(
		"Your (?:completed )?(.+?) (?:kill|chest|completion|harvest|success|lap|subdued) count is:? ([\\d,]+)");

	@Inject private Client client;
	@Inject private ClientThread clientThread;
	@Inject private ClientToolbar clientToolbar;
	@Inject private ItemManager itemManager;
	@Inject private SkillIconManager skillIconManager;
	@Inject private SpriteManager spriteManager;
	@Inject private OkHttpClient httpClient;
	@Inject private Gson gson;
	@Inject private TaskMasterConfig config;
	@Inject private SnapshotCollector collector;
	@Inject private ProgressStore store;
	@Inject private ScheduledExecutorService executor;

	private TaskMasterPanel panel;
	private NavigationButton navButton;

	private long loadedAccount = -1;
	private int ticksUntilLoginSync = -1;
	private boolean dirty;
	private long lastSyncAt;
	private volatile boolean inFlight;

	// Set by "Test Auto-Upload.bat" for that run of RuneLite only (see build.gradle's run task): the
	// local test service and website, with Automatic upload on, without changing saved settings, so
	// Start TaskMaster.bat and a normal RuneLite never upload to the test service, or the test to
	// the live one.
	private static final String LAUNCH_UPLOAD_SERVER = System.getProperty("osrstaskmaster.uploadServer", "").trim();
	private static final String LAUNCH_WEBSITE = System.getProperty("osrstaskmaster.website", "").trim();
	/** On for a test run until the tester switches Automatic upload off or deletes their data. */
	private volatile boolean launchUpload = !LAUNCH_UPLOAD_SERVER.isEmpty();

	@Provides
	TaskMasterConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(TaskMasterConfig.class);
	}

	@Inject private ConfigManager configManager;

	@Override
	protected void startUp()
	{
		panel = new TaskMasterPanel(new TaskMasterPanel.Actions()
		{
			@Override public void copyProfile() { clientThread.invokeLater(TaskMasterPlugin.this::copyProfile); }
			@Override public void openWebsite() { clientThread.invokeLater(TaskMasterPlugin.this::openWebsite); }
			@Override public void openFolder() { openExportFolder(); }
			@Override public void uploadNow() { clientThread.invokeLater(() -> sync(true)); }
			@Override public void copyShareLink() { clientThread.invokeLater(TaskMasterPlugin.this::copyShareLink); }
			@Override public void deleteUploaded() { clientThread.invokeLater(TaskMasterPlugin.this::deleteUploadedData); }
			@Override public void resetLinks() { clientThread.invokeLater(TaskMasterPlugin.this::resetLinks); }
			@Override public void syncPicks() { clientThread.invokeLater(TaskMasterPlugin.this::syncPicks); }
			@Override public void openPick(String pickId) { clientThread.invokeLater(() -> openWebsiteOn(pickId)); }
			@Override public void makeGoal(Picks.Pick pick) { clientThread.invokeLater(() -> TaskMasterPlugin.this.makeGoal(pick)); }
		});
		// Item icons load in the background and appear in the label when ready (safe from any thread).
		panel.setIconSources(this::skillIcon, (itemId, label) -> itemManager.getImage(itemId).addTo(label), gameSprites::get);
		loadGameSprites();
		panel.setUploadEnabled(autoUpload());
		navButton = NavigationButton.builder()
			.tooltip("OSRS TaskMaster")
			.icon(icon())
			.priority(9)
			.panel(panel)
			.build();
		clientToolbar.addNavigation(navButton);
		if (client.getGameState() == GameState.LOGGED_IN)
		{
			clientThread.invokeLater(this::onLogin);
		}
	}

	@Override
	protected void shutDown()
	{
		clientToolbar.removeNavigation(navButton);
		loadedAccount = -1;
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged e)
	{
		if (e.getGameState() == GameState.LOGGED_IN)
		{
			onLogin();
		}
	}

	private void onLogin()
	{
		long account = client.getAccountHash();
		if (account != loadedAccount)
		{
			loadedAccount = account;
			store.load();
			// Varps arrive over the first few ticks after login; wait before the first snapshot.
			ticksUntilLoginSync = 8;
		}
	}

	@Subscribe
	public void onGameTick(GameTick t)
	{
		readSlayerRewards();
		// A collection log page whose kill counts weren't drawn yet when it was read: once more.
		if (clogRetryTitle != null)
		{
			String title = clogRetryTitle;
			clogRetryTitle = null;
			if (title.equals(clogTitle()) && readClogKillCounts(title) > 0)
			{
				store.save();
				dirty = true;
			}
		}
		if (ticksUntilLoginSync > 0 && --ticksUntilLoginSync == 0)
		{
			if (config.autoSync())
			{
				sync(false);
			}
			if (autoUpload())
			{
				fetchPicks();
			}
			return;
		}
		long minGap = config.minMinutesBetweenSyncs() * 60_000L;
		if (dirty && config.autoSync() && System.currentTimeMillis() - lastSyncAt >= minGap)
		{
			sync(false);
		}
	}

	// Bank, inventory and equipment are deliberately never read: no wealth data leaves the client.

	// ---- Collection log -----------------------------------------------------------------

	@Subscribe
	public void onScriptPreFired(ScriptPreFired e)
	{
		if (e.getScriptId() != SCRIPT_CLOG_ITEM || e.getScriptEvent() == null)
		{
			return;
		}
		Object[] args = e.getScriptEvent().getArguments();
		if (args == null || args.length < 3 || !(args[1] instanceof Integer) || !(args[2] instanceof Integer))
		{
			return;
		}
		int itemId = (Integer) args[1];
		int qty = (Integer) args[2];
		if (itemId > 0 && qty > 0)
		{
			store.clogItems.put(itemId, qty);
			dirty = true;
		}
	}

	@Subscribe
	public void onScriptPostFired(ScriptPostFired e)
	{
		if (e.getScriptId() != SCRIPT_CLOG_DRAW_LIST)
		{
			return;
		}
		// Read the page that is now on screen.
		clientThread.invokeLater(this::readClogPage);
	}

	/** The page whose kill counts to read again next tick, if they weren't drawn yet. */
	private String clogRetryTitle;

	/** The open page's title: the header's title text, or the header container's first line. */
	private String clogTitle()
	{
		for (int id : new int[]{InterfaceID.Collection.HEADER_TEXT, InterfaceID.Collection.HEADER})
		{
			Widget w = client.getWidget(id);
			if (w == null)
			{
				continue;
			}
			String t = w.getText();
			Widget[] kids = w.getDynamicChildren();
			if ((t == null || Text.removeTags(t).trim().isEmpty()) && kids != null && kids.length > 0)
			{
				t = kids[0].getText();
			}
			t = t == null ? "" : Text.removeTags(t).replace(' ', ' ').trim();
			if (!t.isEmpty())
			{
				return t;
			}
		}
		return "";
	}

	private void readClogPage()
	{
		String title = clogTitle();
		if (title.isEmpty())
		{
			log.info("OSRS TaskMaster: a collection log page was drawn, but its title wasn't found");
			return;
		}
		// Kill counts first: they don't depend on reading the item tiles below.
		boolean found = readClogKillCounts(title) > 0;
		// The header may be filled in after the item list: try once more next tick.
		clogRetryTitle = found ? null : title;
		Widget[] items = null;
		for (int id : new int[]{InterfaceID.Collection.ITEMS, InterfaceID.Collection.ITEMS_CONTENTS})
		{
			Widget w = client.getWidget(id);
			Widget[] kids = w == null ? null : w.getDynamicChildren();
			if (kids != null && kids.length > 0)
			{
				items = kids;
				break;
			}
		}
		if (items == null)
		{
			if (found)
			{
				store.save();
				dirty = true;
			}
			return;
		}
		int tabIdx = client.getVarbitValue(VarbitID.COLLECTION_LAST_TAB);
		ProgressStore.Page page = new ProgressStore.Page();
		page.tab = tabIdx >= 0 && tabIdx < CLOG_TABS.length ? CLOG_TABS[tabIdx] : "Unknown";
		for (Widget w : items)
		{
			int id = w.getItemId();
			if (id <= 0)
			{
				continue;
			}
			page.items.add(id);
			boolean obtained = w.getOpacity() == 0;
			if (obtained)
			{
				store.clogItems.put(id, Math.max(1, w.getItemQuantity()));
			}
			else
			{
				store.clogItems.putIfAbsent(id, 0);
			}
		}
		store.clogPages.put(title, page);
		store.save();
		dirty = true;
	}

	/**
	 * The page header's kill count lines ("Zulrah kills: 87"), so bosses killed before the plugin
	 * was installed get a count without waiting for the next kill message. The lines are children
	 * of the header container (Collection.HEADER: title, "Obtained: x/y", then the counts), not of
	 * its title text (HEADER_TEXT), so both are read, with every kind of child.
	 */
	private int readClogKillCounts(String title)
	{
		List<String> texts = new ArrayList<>();
		for (int id : new int[]{InterfaceID.Collection.HEADER, InterfaceID.Collection.HEADER_TEXT})
		{
			collectTexts(client.getWidget(id), texts, 3);
		}
		List<Map.Entry<String, Integer>> found = ClogKillCounts.parseAll(texts, title);
		List<Map.Entry<String, Integer>> changed = new ArrayList<>();
		for (Map.Entry<String, Integer> kc : found)
		{
			if (ClogKillCounts.merge(store.killCounts, kc.getKey(), kc.getValue()))
			{
				changed.add(kc);
			}
		}
		// The game draws a page several times: log only counts that changed. A page with none at all
		// (most non-boss pages) logs its header texts at debug level, for diagnosing new layouts.
		if (!changed.isEmpty())
		{
			log.info("OSRS TaskMaster: kill counts from the '{}' collection log page: {}", title, changed);
		}
		else if (found.isEmpty() && log.isDebugEnabled())
		{
			List<String> shown = new ArrayList<>();
			for (String t : texts)
			{
				if (t != null && !t.trim().isEmpty())
				{
					shown.add(Text.removeTags(t).replace(' ', ' ').trim());
				}
			}
			log.debug("OSRS TaskMaster: no kill counts in the '{}' collection log header {}", title, shown);
		}
		return found.size();
	}

	/** A widget's text and its children's (every kind), down to `depth` levels. */
	private static void collectTexts(Widget w, List<String> out, int depth)
	{
		if (w == null || depth < 0)
		{
			return;
		}
		out.add(w.getText());
		for (Widget[] kids : new Widget[][]{w.getDynamicChildren(), w.getStaticChildren(), w.getNestedChildren()})
		{
			if (kids != null)
			{
				for (Widget k : kids)
				{
					collectTexts(k, out, depth - 1);
				}
			}
		}
	}

	// ---- Kill counts --------------------------------------------------------------------

	@Subscribe
	public void onChatMessage(ChatMessage e)
	{
		if (e.getType() != ChatMessageType.GAMEMESSAGE && e.getType() != ChatMessageType.SPAM)
		{
			return;
		}
		String msg = Text.removeTags(e.getMessage());
		Matcher m = KC_PATTERN.matcher(msg);
		if (m.find())
		{
			// The chat message is always the latest count; merge only keeps one entry per boss
			// whatever the capitalisation (a collection log page may have added it first).
			int count = Integer.parseInt(m.group(2).replace(",", ""));
			ClogKillCounts.merge(store.killCounts, m.group(1), count);
			store.save();
			dirty = true;
		}
		else if (msg.startsWith("New item added to your collection log:"))
		{
			dirty = true;
		}
	}

	// ---- Slayer task ----------------------------------------------------------------------

	@Subscribe
	public void onVarbitChanged(VarbitChanged e)
	{
		// New task, a kill on the current one, or a task stored/swapped: the throttle in
		// onGameTick keeps this from syncing on every kill.
		int varp = e.getVarpId();
		if (varp == VarPlayerID.SLAYER_COUNT || varp == VarPlayerID.SLAYER_TARGET
			|| varp == VarPlayerID.SLAYER_AREA || varp == VarPlayerID.SLAYER_STORED_VARP)
		{
			dirty = true;
		}
	}

	private static final Pattern ASSIGNMENT = Pattern.compile("(\\d[\\d,]*)\\s*x\\s+(.+)");
	private List<String> lastRewardTexts;

	/**
	 * The stored task's creature and amount never reach the client as varps; the game only shows
	 * them on the Tasks tab of the Slayer rewards interface. While it's open, remember them.
	 */
	private void readSlayerRewards()
	{
		if (client.getWidget(InterfaceID.SLAYER_REWARDS, 0) == null)
		{
			return;
		}
		java.util.Set<String> seen = new java.util.LinkedHashSet<>();
		for (int c = 0; c < 256; c++)
		{
			collectTexts(client.getWidget(InterfaceID.SLAYER_REWARDS, c), seen, 0);
		}
		List<String> texts = new ArrayList<>(seen);
		if (texts.equals(lastRewardTexts))
		{
			return;
		}
		lastRewardTexts = texts;

		int storedVarp = client.getVarpValue(VarPlayerID.SLAYER_STORED_VARP);
		if (storedVarp == 0)
		{
			return;
		}
		// The Tasks tab lists assignments as "37 x Rockslugs", the current one first and the stored
		// one after it, with no label telling them apart. Drop the line matching the current task.
		// Skip the current task's line by its creature name: the kill count can be out of step with
		// the screen for a moment, which once let the current task be saved as the stored one.
		String current = collector.currentSlayerTaskName();
		for (String text : texts)
		{
			Matcher m = ASSIGNMENT.matcher(text);
			if (!m.matches())
			{
				continue;
			}
			int amount = Integer.parseInt(m.group(1).replace(",", ""));
			if (current == null ? client.getVarpValue(VarPlayerID.SLAYER_COUNT) > 0 : m.group(2).trim().equalsIgnoreCase(current))
			{
				// Current task (or one we can't tell apart from it yet): not the stored one.
				continue;
			}
			ProgressStore.StoredTask st = new ProgressStore.StoredTask();
			st.name = m.group(2).trim();
			st.amount = amount;
			st.varp = storedVarp;
			store.storedSlayer = st;
			store.save();
			dirty = true;
			log.info("OSRS TaskMaster: stored Slayer task is {} x {}", st.amount, st.name);
			return;
		}
	}

	private static void collectTexts(Widget w, java.util.Set<String> out, int depth)
	{
		if (w == null || w.isHidden() || depth > 6)
		{
			return;
		}
		String t = w.getText();
		if (t != null)
		{
			// The game draws many spaces as non-breaking ones.
			t = Text.removeTags(t.replace("<br>", " ")).replace(' ', ' ').trim();
			if (!t.isEmpty())
			{
				out.add(t);
			}
		}
		for (Widget[] kids : new Widget[][]{w.getDynamicChildren(), w.getNestedChildren()})
		{
			if (kids != null)
			{
				for (Widget k : kids)
				{
					collectTexts(k, out, depth + 1);
				}
			}
		}
	}

	// ---- Profile export ------------------------------------------------------------------

	/** The profile, or null if not logged in. Must run on the client thread. */
	private Map<String, Object> snapshot()
	{
		if (client.getGameState() != GameState.LOGGED_IN || client.getLocalPlayer() == null)
		{
			return null;
		}
		Map<String, Object> snapshot = collector.collect();
		snapshot.put("collectionLog", collectionLog());
		snapshot.put("killCounts", store.killCounts);
		return snapshot;
	}

	private File exportDir()
	{
		return new File(RuneLite.RUNELITE_DIR, "osrs-taskmaster");
	}

	/** Saves the profile to .runelite/osrs-taskmaster/<name>.json, off the client thread. */
	private void writeExport(String json)
	{
		String name = client.getLocalPlayer().getName();
		String file = (name == null ? "profile" : name.replaceAll("[^A-Za-z0-9 _-]", "_")) + ".json";
		executor.execute(() ->
		{
			try
			{
				File dir = exportDir();
				Files.createDirectories(dir.toPath());
				Files.write(new File(dir, file).toPath(), json.getBytes(StandardCharsets.UTF_8));
			}
			catch (IOException ex)
			{
				log.warn("OSRS TaskMaster: could not save the profile file", ex);
			}
		});
	}

	/** "Copy my profile": update the file, copy the profile for pasting on the website. Client thread. */
	private void copyProfile()
	{
		Map<String, Object> snap = snapshot();
		if (snap == null)
		{
			panel.setStatus("Log in first, then copy your profile.", false);
			return;
		}
		String json = gson.toJson(snap);
		writeExport(json);
		SwingUtilities.invokeLater(() ->
		{
			try
			{
				Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(json), null);
				panel.setStatus("Copied at " + now() + ". Open the website and press Ctrl+V.", true);
			}
			catch (IllegalStateException ex)
			{
				panel.setStatus("Couldn't use the clipboard. Use Show profile file and load that file on the website instead.", false);
			}
		});
	}

	private void openExportFolder()
	{
		executor.execute(() ->
		{
			try
			{
				File dir = exportDir();
				Files.createDirectories(dir.toPath());
				LinkBrowser.open(dir.getAbsolutePath());
			}
			catch (IOException ex)
			{
				panel.setStatus("Couldn't open " + exportDir(), false);
			}
		});
	}

	private static String now()
	{
		return new java.text.SimpleDateFormat("HH:mm").format(new java.util.Date());
	}

	/** Automatic update: refresh the profile file, and upload it if Automatic upload is on. Client thread. */
	private void sync(boolean manual)
	{
		Map<String, Object> snap = snapshot();
		if (snap == null)
		{
			return;
		}
		dirty = false;
		lastSyncAt = System.currentTimeMillis();
		writeExport(gson.toJson(snap));
		// The panel drops suggestions this profile shows finished, without waiting for the website.
		com.google.gson.JsonObject profile = gson.toJsonTree(snap).getAsJsonObject();
		panel.setDoneCheck(id -> PickProgress.isDone(id, profile));
		if (autoUpload())
		{
			upload(snap, manual);
		}
		else
		{
			panel.setStatus("Profile up to date (" + now() + "). Click Copy my profile to use it on the website.", true);
		}
	}

	// ---- Automatic upload ----------------------------------------------------------------
	//
	// Each OSRS account gets its own secret upload key, kept in that account's RuneLite profile.
	// The server and the website derive the same two values from it (see sync/src/index.js):
	//   profile id  : read-only link, safe to share
	//   edit token  : lets the website save goals; only in the link the panel opens for you

	private static final String KEY_UPLOAD = "uploadKey";

	/** This account's upload key, created on first use. Needs a logged-in account. */
	private String uploadKey(boolean create)
	{
		String key = configManager.getRSProfileConfiguration(TaskMasterConfig.GROUP, KEY_UPLOAD);
		if ((key == null || key.isEmpty()) && create)
		{
			byte[] bytes = new byte[32];
			new SecureRandom().nextBytes(bytes);
			key = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
			configManager.setRSProfileConfiguration(TaskMasterConfig.GROUP, KEY_UPLOAD, key);
		}
		return key == null || key.isEmpty() ? null : key;
	}

	static String deriveId(String key)
	{
		return sha256B64url("tm-id:" + key).substring(0, 22);
	}

	static String deriveEditToken(String key)
	{
		return sha256B64url("tm-edit:" + key).substring(0, 32);
	}

	private static String sha256B64url(String text)
	{
		try
		{
			byte[] d = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(d);
		}
		catch (NoSuchAlgorithmException e)
		{
			throw new IllegalStateException(e);
		}
	}

	private String serverUrl()
	{
		String server = LAUNCH_UPLOAD_SERVER.isEmpty() ? config.uploadServer() : LAUNCH_UPLOAD_SERVER;
		return server.trim().replaceAll("/+$", "");
	}

	/** Automatic upload: switched on in settings, or for this run by Test Auto-Upload.bat. */
	private boolean autoUpload()
	{
		return config.autoUpload() || launchUpload;
	}

	private String websiteUrl()
	{
		return LAUNCH_WEBSITE.isEmpty() ? config.websiteUrl().trim() : LAUNCH_WEBSITE;
	}

	private void upload(Map<String, Object> snap, boolean manual)
	{
		if (inFlight)
		{
			dirty = true;
			return;
		}
		String key = uploadKey(true);
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("profile", snap);
		body.put("public", config.publicProfile());
		// Lets the server keep a public name with the account that owns it. Sent only as a hash input;
		// the server stores a hash of it, never the value itself.
		body.put("account", String.valueOf(client.getAccountHash()));
		Request request;
		try
		{
			request = new Request.Builder()
				.url(serverUrl() + "/v1/profile")
				.header("Authorization", "Bearer " + key)
				.put(RequestBody.create(JSON, gson.toJson(body)))
				.build();
		}
		catch (IllegalArgumentException ex)
		{
			panel.setStatus("The Upload server address in the plugin settings isn't valid.", false);
			return;
		}
		inFlight = true;
		panel.setStatus(manual ? "Uploading..." : "Auto-uploading...", true);
		httpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				inFlight = false;
				dirty = true;
				// Name the address: a wrong or not-yet-running Upload server setting is the usual cause.
				panel.setStatus("Couldn't reach the upload server (" + serverUrl() + "). Your profile is saved on this PC and will upload later.", false);
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				inFlight = false;
				try (Response r = response)
				{
					String text = r.body() == null ? "" : r.body().string();
					Map<?, ?> reply = parse(text);
					if (r.isSuccessful())
					{
						Object note = reply.get("note");
						boolean isPublic = Boolean.TRUE.equals(reply.get("public"));
						panel.setStatus(note instanceof String ? (String) note
							: "Uploaded at " + now() + (isPublic ? " (public)." : " (private: only your link can see it)."), note == null);
						fetchPicks();
					}
					else
					{
						if (r.code() >= 500 || r.code() == 429)
						{
							dirty = true;
						}
						Object err = reply.get("error");
						panel.setStatus("Upload failed: " + (err instanceof String ? err : "server error " + r.code()), false);
					}
				}
				catch (IOException ex)
				{
					dirty = true;
					panel.setStatus("Upload failed while reading the server's reply.", false);
				}
			}
		});
	}

	private Map<?, ?> parse(String json)
	{
		try
		{
			Map<?, ?> m = gson.fromJson(json, Map.class);
			return m == null ? Collections.emptyMap() : m;
		}
		catch (RuntimeException ex)
		{
			return Collections.emptyMap();
		}
	}

	/** Open website: with Automatic upload on, opens your own live profile (with goal editing). */
	private void openWebsite()
	{
		openWebsiteOn(null);
	}

	/** Open the website, on one suggestion if given (a row in the panel's list). */
	private void openWebsiteOn(String pickId)
	{
		String site = websiteUrl();
		String key = autoUpload() ? uploadKey(false) : null;
		if (key == null)
		{
			LinkBrowser.browse(site);
			return;
		}
		// Everything after # stays in the browser: it's never sent to the website's host.
		String link = site + "#id=" + deriveId(key) + "&edit=" + deriveEditToken(key);
		if (pickId != null)
		{
			try
			{
				link += "&focus=" + java.net.URLEncoder.encode(pickId, "UTF-8").replace("+", "%20");
			}
			catch (java.io.UnsupportedEncodingException e)
			{
				throw new IllegalStateException(e);
			}
		}
		LinkBrowser.browse(link);
	}

	// ---- Your next grinds: the website's picks, shown in the panel ------------------------

	/**
	 * The panel's Sync button: refresh the profile and upload it now (the upload then fetches the
	 * website's latest list), so finished tasks drop off. Not logged in: just fetch the list.
	 */
	private void syncPicks()
	{
		if (client.getGameState() == GameState.LOGGED_IN && autoUpload())
		{
			sync(true);
		}
		else
		{
			fetchPicks();
		}
	}

	/** Fetch the suggestions the website last saved for this account. Client thread. */
	private void fetchPicks()
	{
		String key = autoUpload() ? uploadKey(false) : null;
		if (key == null)
		{
			return;
		}
		Request request;
		try
		{
			request = new Request.Builder().url(serverUrl() + "/v1/picks/" + deriveId(key)).get().build();
		}
		catch (IllegalArgumentException ex)
		{
			return;
		}
		httpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				// Keep showing the last list; the status line already reports upload problems.
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				try (Response r = response)
				{
					if (r.code() == 404)
					{
						panel.setPicks(null, 0); // nothing uploaded yet
						return;
					}
					if (!r.isSuccessful() || r.body() == null)
					{
						return;
					}
					Picks.Reply reply = gson.fromJson(r.body().string(), Picks.Reply.class);
					if (reply != null)
					{
						panel.setPicks(reply.picks, reply.picksAt == null ? 0 : reply.picksAt);
					}
				}
				catch (IOException | RuntimeException ex)
				{
					log.debug("OSRS TaskMaster: couldn't read picks", ex);
				}
			}
		});
	}

	// Game interface sprites for the panel, read live from the game's own files, so they always
	// match the game: the PvP skull for Wilderness rows and an icon per suggestion category.
	private static final Object[][] PANEL_SPRITES = {
		{"skull", net.runelite.api.gameval.SpriteID.HEADICONS_PK},
		{"quests", net.runelite.api.gameval.SpriteID.AchievementDiaryIcons.BLUE_QUESTS},
		{"diaries", net.runelite.api.gameval.SpriteID.AchievementDiaryIcons.GREEN_ACHIEVEMENT_DIARIES},
		{"combat", net.runelite.api.gameval.SpriteID.CaTierSwordsSmall._3},
		{"clog", 6390}, // hiscores "collections logged"
		{"pets", 6390},
	};
	private final Map<String, BufferedImage> gameSprites = new java.util.concurrent.ConcurrentHashMap<>();

	private void loadGameSprites()
	{
		for (Object[] s : PANEL_SPRITES)
		{
			String name = (String) s[0];
			spriteManager.getSpriteAsync((Integer) s[1], 0, img ->
			{
				if (img != null)
				{
					gameSprites.put(name, img);
					panel.iconsChanged();
				}
			});
		}
	}

	private BufferedImage skillIcon(String skill)
	{
		try
		{
			return skillIconManager.getSkillImage(Skill.valueOf(skill.toUpperCase()), true);
		}
		catch (IllegalArgumentException ex)
		{
			return null; // a skill this client doesn't know
		}
	}

	/**
	 * Make it a goal (right-click a row in Your next grinds): the service adds the goal the website
	 * saved with that suggestion, so it's exactly what the website's own button would add. Needs
	 * the edit token, which this plugin derives from the upload key like the owner's link does.
	 */
	private void makeGoal(Picks.Pick pick)
	{
		String key = autoUpload() ? uploadKey(false) : null;
		if (key == null)
		{
			panel.setStatus("Turn on Automatic upload in the plugin settings and log in first.", false);
			return;
		}
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("pick", pick.id);
		Request request;
		try
		{
			request = new Request.Builder()
				.url(serverUrl() + "/v1/goals/" + deriveId(key))
				.header("X-Edit-Token", deriveEditToken(key))
				.post(RequestBody.create(JSON, gson.toJson(body)))
				.build();
		}
		catch (IllegalArgumentException ex)
		{
			panel.setStatus("The Upload server address in the plugin settings isn't valid.", false);
			return;
		}
		panel.setStatus("Adding goal...", true);
		httpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				panel.setStatus("Couldn't reach the upload server (" + serverUrl() + "), so the goal wasn't added.", false);
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				try (Response r = response)
				{
					Map<?, ?> reply = parse(r.body() == null ? "" : r.body().string());
					if (r.isSuccessful())
					{
						boolean added = Boolean.TRUE.equals(reply.get("added"));
						panel.goalAdded(pick.id);
						panel.setStatus((added ? "New goal: " : "Already a goal: ") + pick.title
							+ (added ? ". It shows on the website next time it loads." : "."), true);
					}
					else
					{
						Object err = reply.get("error");
						panel.setStatus("Couldn't add the goal: " + (err instanceof String ? err : "server error " + r.code()), false);
					}
				}
				catch (IOException ex)
				{
					panel.setStatus("Couldn't add the goal: the server's reply didn't arrive.", false);
				}
			}
		});
	}

	/** Copy share link: a read-only link to your uploaded profile. */
	private void copyShareLink()
	{
		String key = uploadKey(false);
		if (!autoUpload() || key == null)
		{
			panel.setStatus("Turn on Automatic upload in the plugin settings and log in first.", false);
			return;
		}
		String link = websiteUrl() + "#id=" + deriveId(key);
		SwingUtilities.invokeLater(() ->
		{
			Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(link), null);
			panel.setStatus("Share link copied. Anyone with it can view your suggestions, but not change your goals.", true);
		});
	}

	/**
	 * Reset my links: the server moves the profile, goals and picks to a new key, so every old
	 * link stops working (how a leaked owner link is revoked). The new key is only kept once the
	 * server has confirmed. Uploads wait meanwhile, so none can recreate the old profile.
	 */
	private void resetLinks()
	{
		String oldKey = uploadKey(false);
		if (!autoUpload() || oldKey == null)
		{
			panel.setStatus("Nothing has been uploaded for this account, so there are no links to reset.", true);
			return;
		}
		if (inFlight)
		{
			panel.setStatus("An upload is in progress. Try Reset my links again in a moment.", false);
			return;
		}
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		String newKey = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("newKey", newKey);
		Request request;
		try
		{
			request = new Request.Builder()
				.url(serverUrl() + "/v1/profile/rotate")
				.header("Authorization", "Bearer " + oldKey)
				.post(RequestBody.create(JSON, gson.toJson(body)))
				.build();
		}
		catch (IllegalArgumentException ex)
		{
			panel.setStatus("The Upload server address in the plugin settings isn't valid.", false);
			return;
		}
		inFlight = true;
		panel.setStatus("Resetting your links...", true);
		httpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				inFlight = false;
				panel.setStatus("Couldn't reach the upload server, so your links weren't changed. Try again later.", false);
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				try (Response r = response)
				{
					if (r.isSuccessful() || r.code() == 404)
					{
						// 404: nothing on the server yet, so a new key alone gives new links.
						configManager.setRSProfileConfiguration(TaskMasterConfig.GROUP, KEY_UPLOAD, newKey);
						panel.setStatus("Your links were reset. Old links no longer work; use Open website and Copy share link for the new ones.", true);
						fetchPicks();
					}
					else
					{
						panel.setStatus("The server couldn't reset your links (error " + r.code() + "). Nothing was changed.", false);
					}
				}
				finally
				{
					inFlight = false;
				}
			}
		});
	}

	/** Delete uploaded data: removes it from the server, turns uploads off and retires the key. */
	private void deleteUploadedData()
	{
		String key = uploadKey(false);
		if (key == null)
		{
			panel.setStatus("Nothing has been uploaded for this account.", true);
			return;
		}
		Request request;
		try
		{
			request = new Request.Builder().url(serverUrl() + "/v1/profile").header("Authorization", "Bearer " + key).delete().build();
		}
		catch (IllegalArgumentException ex)
		{
			panel.setStatus("The Upload server address in the plugin settings isn't valid.", false);
			return;
		}
		// An upload still on its way could arrive after the delete and recreate the profile under a
		// key this plugin is about to forget (so it could never be deleted from here). Wait for it,
		// and hold new uploads back until the delete is done.
		if (inFlight)
		{
			panel.setStatus("An upload is in progress. Try Delete uploaded data again in a moment.", false);
			return;
		}
		inFlight = true;
		httpClient.newCall(request).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				inFlight = false;
				panel.setStatus("Couldn't reach the upload server, so nothing was deleted. Try again later.", false);
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				try
				{
					response.close();
					if (!response.isSuccessful())
					{
						panel.setStatus("The server couldn't delete your data (error " + response.code() + "). Try again later.", false);
						return;
					}
					// A new key next time means old links stop working, even if uploads are switched back on.
					launchUpload = false;
					configManager.setConfiguration(TaskMasterConfig.GROUP, "autoUpload", false);
					configManager.unsetRSProfileConfiguration(TaskMasterConfig.GROUP, KEY_UPLOAD);
					panel.setStatus("Your uploaded profile and goals were deleted, and Automatic upload is off.", true);
				}
				finally
				{
					// Only now: uploads are off and the key is gone, so none can recreate the profile.
					inFlight = false;
				}
			}
		});
	}

	@Subscribe
	public void onConfigChanged(ConfigChanged e)
	{
		if (!TaskMasterConfig.GROUP.equals(e.getGroup()))
		{
			return;
		}
		if ("autoUpload".equals(e.getKey()) || "publicProfile".equals(e.getKey()))
		{
			if ("autoUpload".equals(e.getKey()))
			{
				// Switching it in settings during a test run: the tester's choice wins from now on.
				launchUpload = false;
			}
			panel.setUploadEnabled(autoUpload());
			// Upload straight away so the website reflects the change.
			if (autoUpload())
			{
				clientThread.invokeLater(() -> sync(true));
			}
		}
	}

	private Map<String, Object> collectionLog()
	{
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("obtained", client.getVarpValue(VarPlayerID.COLLECTION_COUNT));
		out.put("total", client.getVarpValue(VarPlayerID.COLLECTION_COUNT_MAX));
		Map<String, Object> cats = new LinkedHashMap<>();
		cats.put("Bosses", pair(VarPlayerID.COLLECTION_COUNT_BOSSES, VarPlayerID.COLLECTION_COUNT_BOSSES_MAX));
		cats.put("Raids", pair(VarPlayerID.COLLECTION_COUNT_RAIDS, VarPlayerID.COLLECTION_COUNT_RAIDS_MAX));
		cats.put("Clues", pair(VarPlayerID.COLLECTION_COUNT_CLUES, VarPlayerID.COLLECTION_COUNT_CLUES_MAX));
		cats.put("Minigames", pair(VarPlayerID.COLLECTION_COUNT_MINIGAMES, VarPlayerID.COLLECTION_COUNT_MINIGAMES_MAX));
		cats.put("Other", pair(VarPlayerID.COLLECTION_COUNT_OTHER, VarPlayerID.COLLECTION_COUNT_OTHER_MAX));
		out.put("categories", cats);

		// Prefer the full layout from the cache; fall back to pages seen on screen.
		Map<String, ProgressStore.Page> layout = new LinkedHashMap<>(clogLayout());
		store.clogPages.forEach(layout::putIfAbsent);

		// The collection log search sometimes reports an owned item under a variant id (e.g. a
		// Dossier as 30805 while the page lists 30803). Owned ids that aren't on any page are
		// matched to page slots by name instead.
		java.util.Set<Integer> layoutIds = new java.util.HashSet<>();
		layout.values().forEach(pg -> layoutIds.addAll(pg.items));
		Map<String, Integer> unmatchedByName = new java.util.HashMap<>();
		store.clogItems.forEach((id, qty) ->
		{
			if (qty > 0 && !layoutIds.contains(id))
			{
				ItemComposition c = itemManager.getItemComposition(id);
				if (c != null)
				{
					unmatchedByName.merge(c.getName().toLowerCase(), qty, Math::max);
				}
			}
		});

		Map<String, Object> pages = new LinkedHashMap<>();
		for (Map.Entry<String, ProgressStore.Page> p : layout.entrySet())
		{
			Map<String, Object> page = new LinkedHashMap<>();
			page.put("tab", p.getValue().tab);
			List<Map<String, Object>> items = new ArrayList<>();
			for (int id : p.getValue().items)
			{
				Map<String, Object> it = new LinkedHashMap<>();
				it.put("id", id);
				ItemComposition comp = itemManager.getItemComposition(id);
				String name = comp == null ? String.valueOf(id) : comp.getName();
				it.put("name", name);
				int qty = store.clogItems.getOrDefault(id, 0);
				if (qty <= 0)
				{
					qty = unmatchedByName.getOrDefault(name.toLowerCase(), 0);
				}
				it.put("quantity", qty);
				items.add(it);
			}
			page.put("items", items);
			pages.put(p.getKey(), page);
		}
		out.put("pages", pages);
		Map<String, Integer> obtained = new LinkedHashMap<>();
		store.clogItems.forEach((k, v) -> { if (v > 0) obtained.put(String.valueOf(k), v); });
		out.put("items", obtained);
		return out;
	}

	private Map<String, ProgressStore.Page> clogLayoutCache;

	/** Every collection log page and its items, read from the game cache once per session. */
	private Map<String, ProgressStore.Page> clogLayout()
	{
		if (clogLayoutCache != null && !clogLayoutCache.isEmpty())
		{
			return clogLayoutCache;
		}
		Map<String, ProgressStore.Page> out = new LinkedHashMap<>();
		int itemSlots = 0;
		try
		{
			EnumComposition tabs = client.getEnum(CLOG_TABS_ENUM);
			int[] tabStructs = tabs == null ? new int[0] : tabs.getIntVals();
			for (int t = 0; t < tabStructs.length; t++)
			{
				StructComposition tab = client.getStructComposition(tabStructs[t]);
				EnumComposition pageEnum = tab == null ? null : client.getEnum(tab.getIntValue(PARAM_CLOG_TAB_PAGES));
				if (pageEnum == null)
				{
					continue;
				}
				for (int pageStructId : pageEnum.getIntVals())
				{
					StructComposition ps = client.getStructComposition(pageStructId);
					if (ps == null)
					{
						continue;
					}
					String name = ps.getStringValue(PARAM_CLOG_PAGE_NAME);
					EnumComposition itemEnum = client.getEnum(ps.getIntValue(PARAM_CLOG_PAGE_ITEMS));
					if (name == null || name.isEmpty() || itemEnum == null)
					{
						continue;
					}
					ProgressStore.Page page = new ProgressStore.Page();
					page.tab = t < CLOG_TABS.length ? CLOG_TABS[t] : "Other";
					for (int itemId : itemEnum.getIntVals())
					{
						page.items.add(itemId);
					}
					itemSlots += page.items.size();
					out.put(name, page);
				}
			}
		}
		catch (Exception ex)
		{
			log.warn("OSRS TaskMaster: could not read the collection log layout from cache", ex);
		}
		log.info("OSRS TaskMaster: read {} collection log pages ({} item slots) from cache", out.size(), itemSlots);
		clogLayoutCache = out;
		return out;
	}

	private Map<String, Integer> pair(int obtainedVarp, int maxVarp)
	{
		Map<String, Integer> m = new LinkedHashMap<>();
		m.put("obtained", client.getVarpValue(obtainedVarp));
		m.put("total", client.getVarpValue(maxVarp));
		return m;
	}

	/** Sidebar icon: the task scroll, 16x16 (same design as icon.png and the website's icon.svg). */
	private static BufferedImage icon()
	{
		return ImageUtil.loadImageResource(TaskMasterPlugin.class, "panel_icon.png");
	}
}
