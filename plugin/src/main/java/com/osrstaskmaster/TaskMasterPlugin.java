package com.osrstaskmaster;

import com.google.gson.Gson;
import com.google.inject.Provides;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
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
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.gameval.VarPlayerID;
import net.runelite.api.gameval.VarbitID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.game.ItemManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.util.Text;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

@Slf4j
@PluginDescriptor(
	name = "OSRS TaskMaster",
	description = "Sends your own account progress to your OSRS TaskMaster site so it can suggest what to grind next",
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
	@Inject private OkHttpClient httpClient;
	@Inject private Gson gson;
	@Inject private TaskMasterConfig config;
	@Inject private SnapshotCollector collector;
	@Inject private ProgressStore store;

	private TaskMasterPanel panel;
	private NavigationButton navButton;

	private long loadedAccount = -1;
	private int ticksUntilLoginSync = -1;
	private boolean dirty;
	private long lastSyncAt;
	private volatile boolean inFlight;

	@Provides
	TaskMasterConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(TaskMasterConfig.class);
	}

	@Inject private ConfigManager configManager;

	/** Move plugin settings saved under the previous name, then delete the old copies. */
	private void migrateLegacySettings()
	{
		for (String key : new String[]{"endpoint", "token", "autoSync", "minMinutesBetweenSyncs"})
		{
			String old = configManager.getConfiguration(TaskMasterConfig.LEGACY_GROUP, key);
			if (old == null)
			{
				continue;
			}
			if (configManager.getConfiguration(TaskMasterConfig.GROUP, key) == null || "token".equals(key) && config.token().isEmpty())
			{
				configManager.setConfiguration(TaskMasterConfig.GROUP, key, old);
			}
			configManager.unsetConfiguration(TaskMasterConfig.LEGACY_GROUP, key);
		}
	}

	@Override
	protected void startUp()
	{
		migrateLegacySettings();
		panel = new TaskMasterPanel(() -> clientThread.invokeLater(() -> sync(true)));
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
		if (ticksUntilLoginSync > 0 && --ticksUntilLoginSync == 0)
		{
			if (config.autoSync())
			{
				sync(false);
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

	private void readClogPage()
	{
		Widget header = client.getWidget(InterfaceID.Collection.HEADER_TEXT);
		Widget itemsWidget = client.getWidget(InterfaceID.Collection.ITEMS);
		if (header == null || itemsWidget == null)
		{
			return;
		}
		String title = header.getText();
		Widget[] headerKids = header.getDynamicChildren();
		if ((title == null || title.isEmpty()) && headerKids != null && headerKids.length > 0)
		{
			title = headerKids[0].getText();
		}
		title = title == null ? "" : Text.removeTags(title).trim();
		Widget[] items = itemsWidget.getDynamicChildren();
		if (title.isEmpty() || items == null || items.length == 0)
		{
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
			store.killCounts.put(m.group(1), Integer.parseInt(m.group(2).replace(",", "")));
			store.save();
			dirty = true;
		}
		else if (msg.startsWith("New item added to your collection log:"))
		{
			dirty = true;
		}
	}

	// ---- Sync ---------------------------------------------------------------------------

	/** Must run on the client thread. */
	private void sync(boolean manual)
	{
		if (client.getGameState() != GameState.LOGGED_IN || client.getLocalPlayer() == null)
		{
			panel.setStatus("Log in to sync.", false);
			return;
		}
		if (inFlight)
		{
			return;
		}
		Map<String, Object> snapshot = collector.collect();
		snapshot.put("collectionLog", collectionLog());
		snapshot.put("killCounts", store.killCounts);

		String body = gson.toJson(snapshot);
		String endpoint = config.endpoint().trim();
		Request.Builder rb;
		try
		{
			rb = new Request.Builder().url(endpoint).post(RequestBody.create(JSON, body));
		}
		catch (IllegalArgumentException ex)
		{
			panel.setStatus("Invalid sync endpoint in plugin settings.", false);
			return;
		}
		// Strip whitespace, quotes and invisible characters that sneak in when copying the token.
		String token = config.token().replaceAll("[^0-9A-Za-z]", "");
		if (!token.isEmpty())
		{
			rb.header("X-TaskMaster-Token", token);
		}

		dirty = false;
		lastSyncAt = System.currentTimeMillis();
		inFlight = true;
		panel.setStatus(manual ? "Syncing..." : "Auto-syncing...", true);
		httpClient.newCall(rb.build()).enqueue(new Callback()
		{
			@Override
			public void onFailure(Call call, IOException ex)
			{
				inFlight = false;
				dirty = true;
				panel.setStatus("Could not reach the OSRS TaskMaster server. Is it running?", false);
			}

			@Override
			public void onResponse(Call call, Response response)
			{
				inFlight = false;
				int code = response.code();
				response.close();
				if (code >= 200 && code < 300)
				{
					panel.setStatus("Synced " + new java.text.SimpleDateFormat("HH:mm").format(new java.util.Date()), true);
				}
				else if (code == 401)
				{
					panel.setStatus("Server rejected the sync token. Check plugin settings.", false);
				}
				else
				{
					dirty = true;
					panel.setStatus("Server error " + code, false);
				}
			}
		});
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

	private static BufferedImage icon()
	{
		BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setColor(new Color(0xE0B04A));
		g.fillRoundRect(1, 1, 14, 14, 4, 4);
		g.setColor(new Color(0x2B2116));
		g.fillRect(4, 9, 2, 4);
		g.fillRect(7, 6, 2, 7);
		g.fillRect(10, 3, 2, 10);
		g.dispose();
		return img;
	}
}
