package com.osrstaskmaster.icons;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import javax.imageio.ImageIO;
import net.runelite.cache.IndexType;
import net.runelite.cache.ItemManager;
import net.runelite.cache.SpriteManager;
import net.runelite.cache.TextureManager;
import net.runelite.cache.definitions.ModelDefinition;
import net.runelite.cache.definitions.SpriteDefinition;
import net.runelite.cache.definitions.loaders.ModelLoader;
import net.runelite.cache.definitions.providers.ModelProvider;
import net.runelite.cache.fs.Archive;
import net.runelite.cache.fs.Index;
import net.runelite.cache.fs.Store;
import net.runelite.cache.item.ItemSpriteFactory;

/**
 * Exports the game icons OSRS TaskMaster's website shows, from the game cache RuneLite keeps on
 * this PC (%USERPROFILE%\.runelite\jagexcache\oldschool\LIVE). Nothing is downloaded: the cache
 * is only read. Run through scripts\Update-GameIcons.ps1 after a game update.
 *
 * Writes into the output folder (web/icons/game):
 *   sprites/<name>.png   interface sprites: the PvP skull, skill icons, category icons, CA tiers
 *   items/<id>.png       inventory-style icons of every collection log item (pets included)
 *   index.json           what was exported and when, read by the website
 *
 * Arguments: --cache <dir> --out <dir> --items <tests/fixtures/game-names.json>
 */
public final class ExportGameIcons
{
	/** Sprite archive ids (RuneLite's SpriteID / gameval names in comments) and the frame to use. */
	private static final Object[][] SPRITES = {
		// The skull shown above a skulled player: Wilderness badges and toggles.
		{"skull", 439, 0},                    // HEADICONS_PK
		// Skill icons (STATICONS / STATICONS2).
		{"skill-attack", 197, 0}, {"skill-strength", 198, 0}, {"skill-defence", 199, 0},
		{"skill-ranged", 200, 0}, {"skill-prayer", 201, 0}, {"skill-magic", 202, 0},
		{"skill-hitpoints", 203, 0}, {"skill-agility", 204, 0}, {"skill-herblore", 205, 0},
		{"skill-thieving", 206, 0}, {"skill-crafting", 207, 0}, {"skill-fletching", 208, 0},
		{"skill-mining", 209, 0}, {"skill-smithing", 210, 0}, {"skill-fishing", 211, 0},
		{"skill-cooking", 212, 0}, {"skill-firemaking", 213, 0}, {"skill-woodcutting", 214, 0},
		{"skill-runecraft", 215, 0}, {"skill-slayer", 216, 0}, {"skill-farming", 217, 0},
		{"skill-hunter", 220, 0}, {"skill-construction", 221, 0}, {"skill-sailing", 228, 0},
		{"skill-total", 222, 0},
		// Suggestion categories.
		{"cat-quests", 835, 0},               // quest list icon (blue)
		{"cat-diaries", 836, 0},              // achievement diary icon (green)
		{"cat-clog", 6390, 0},                // collections logged (hiscores)
		// Combat achievement tiers, small swords: Easy .. Grandmaster.
		{"ca-easy", 3399, 0}, {"ca-medium", 3400, 0}, {"ca-hard", 3401, 0},
		{"ca-elite", 3402, 0}, {"ca-master", 3403, 0}, {"ca-grandmaster", 3404, 0},
	};

	public static void main(String[] args) throws IOException
	{
		Map<String, String> opt = new LinkedHashMap<>();
		for (int i = 0; i + 1 < args.length; i += 2)
		{
			opt.put(args[i], args[i + 1]);
		}
		File cacheDir = new File(require(opt, "--cache"));
		File out = new File(require(opt, "--out"));
		File itemsFile = new File(require(opt, "--items"));
		if (!new File(cacheDir, "main_file_cache.dat2").isFile())
		{
			throw new IOException("No game cache in " + cacheDir + ". Start RuneLite once so it downloads the cache.");
		}

		try (Store store = new Store(cacheDir))
		{
			store.load();
			SpriteManager sprites = new SpriteManager(store);
			sprites.load();

			File spriteDir = new File(out, "sprites");
			File itemDir = new File(out, "items");
			spriteDir.mkdirs();
			itemDir.mkdirs();

			Map<String, String> spriteIndex = new LinkedHashMap<>();
			List<String> missing = new ArrayList<>();
			for (Object[] s : SPRITES)
			{
				String name = (String) s[0];
				SpriteDefinition def = sprites.findSprite((Integer) s[1], (Integer) s[2]);
				if (def == null || def.getWidth() <= 0)
				{
					missing.add(name + " (sprite " + s[1] + ")");
					continue;
				}
				ImageIO.write(sprites.getSpriteImage(def), "png", new File(spriteDir, name + ".png"));
				spriteIndex.put(name, "sprites/" + name + ".png");
			}

			ItemManager items = new ItemManager(store);
			items.load();
			items.link();
			TextureManager textures = new TextureManager(store);
			textures.load();
			ModelProvider models = modelProvider(store);

			TreeSet<Integer> ids = collectionLogItemIds(itemsFile);
			List<Integer> written = new ArrayList<>();
			for (int id : ids)
			{
				if (items.getItem(id) == null)
				{
					missing.add("item " + id);
					continue;
				}
				// One item, the inventory's usual 1px outline and shadow, not noted.
				BufferedImage img = ItemSpriteFactory.createSprite(items, models, sprites, textures, id, 1, 1, 0x302020, false);
				if (img == null)
				{
					missing.add("item " + id);
					continue;
				}
				ImageIO.write(img, "png", new File(itemDir, id + ".png"));
				written.add(id);
			}

			JsonObject index = new JsonObject();
			index.addProperty("about", "Game images from the OSRS game cache on this PC (scripts/Update-GameIcons.ps1). © Jagex Ltd.");
			// No export date: re-running with an unchanged cache must leave this file unchanged.
			Index spriteIdx = store.getIndex(IndexType.SPRITES);
			index.addProperty("spriteIndexRevision", spriteIdx == null ? -1 : spriteIdx.getRevision());
			Gson gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
			index.add("sprites", gson.toJsonTree(spriteIndex));
			index.add("items", gson.toJsonTree(written));
			try (Writer w = Files.newBufferedWriter(new File(out, "index.json").toPath(), StandardCharsets.UTF_8))
			{
				// Item ids on one line: the list is long and only changes when the game adds items.
				String text = gson.toJson(index).replaceAll("\\[\\s*([\\d,\\s]+?)\\s*]", "[$1]").replaceAll(",\\s+(?=\\d)", ",");
				w.write(text + "\n");
			}

			System.out.println("Exported " + spriteIndex.size() + " sprites and " + written.size() + " item icons to " + out);
			if (!missing.isEmpty())
			{
				System.out.println("Not found in this cache (" + missing.size() + "): " + String.join(", ", missing));
			}
		}
	}

	private static String require(Map<String, String> opt, String key)
	{
		String v = opt.get(key);
		if (v == null)
		{
			throw new IllegalArgumentException("Missing " + key + " <path>");
		}
		return v;
	}

	/** Models are read straight from the cache's model index. */
	private static ModelProvider modelProvider(Store store)
	{
		Index index = store.getIndex(IndexType.MODELS);
		ModelLoader loader = new ModelLoader();
		return modelId ->
		{
			Archive archive = index.getArchive(modelId);
			if (archive == null)
			{
				return null;
			}
			byte[] data = archive.decompress(store.getStorage().loadArchive(archive));
			ModelDefinition model = loader.load(modelId, data);
			return model;
		};
	}

	/** Every collection log item id in tests/fixtures/game-names.json. */
	private static TreeSet<Integer> collectionLogItemIds(File file) throws IOException
	{
		TreeSet<Integer> ids = new TreeSet<>();
		try (Reader r = Files.newBufferedReader(file.toPath(), StandardCharsets.UTF_8))
		{
			JsonObject root = new Gson().fromJson(r, JsonObject.class);
			for (Map.Entry<String, JsonElement> page : root.getAsJsonObject("pages").entrySet())
			{
				for (JsonElement item : page.getValue().getAsJsonObject().getAsJsonArray("items"))
				{
					ids.add(item.getAsJsonObject().get("id").getAsInt());
				}
			}
		}
		return ids;
	}
}
