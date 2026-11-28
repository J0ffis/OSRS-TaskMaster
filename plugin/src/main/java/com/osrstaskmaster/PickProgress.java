package com.osrstaskmaster;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Tells which of the website's suggestions the player has finished since the website made them,
 * from the plugin's own latest profile, so the panel can drop them without waiting for the
 * website. Suggestion ids come from web/recommender.js ("quest:Dragon Slayer II",
 * "lvl:slayer:85", "ca:123", "clog:4151", ...), and so do route step keys ("skill:slayer:3258594",
 * "quest:Dream Mentor"). Kinds it can't judge count as not done.
 */
final class PickProgress
{
	private PickProgress()
	{
	}

	/** True if the profile shows this suggestion done. {@code profile} is the plugin's snapshot as JSON. */
	static boolean isDone(String pickId, JsonObject profile)
	{
		if (pickId == null || profile == null)
		{
			return false;
		}
		int colon = pickId.indexOf(':');
		if (colon < 0)
		{
			return false;
		}
		String kind = pickId.substring(0, colon);
		String rest = pickId.substring(colon + 1);
		try
		{
			switch (kind)
			{
				case "lvl":
				{
					String[] p = rest.split(":");
					JsonObject skill = obj(obj(profile, "skills"), p[0]);
					return skill != null && skill.get("level").getAsInt() >= Integer.parseInt(p[1]);
				}
				case "skill": // a route step: "skill:<skill>:<target XP>"
				case "xp":
				{
					String[] p = rest.split(":");
					JsonObject skill = obj(obj(profile, "skills"), p[0]);
					return skill != null && skill.get("xp").getAsLong() >= Long.parseLong(p[1]);
				}
				case "quest":
				{
					for (JsonElement q : arr(profile, "quests"))
					{
						JsonObject o = q.getAsJsonObject();
						if (rest.equals(str(o, "name")))
						{
							return "FINISHED".equals(str(o, "state"));
						}
					}
					return false;
				}
				case "diary":
				{
					int split = rest.lastIndexOf(':');
					JsonObject region = obj(obj(profile, "diaries"), rest.substring(0, split));
					JsonElement tier = region == null ? null : region.get(rest.substring(split + 1));
					return tier != null && tier.isJsonPrimitive() && tier.getAsBoolean();
				}
				case "ca":
				{
					int id = Integer.parseInt(rest);
					for (JsonElement t : arr(obj(profile, "combatAchievements"), "tasks"))
					{
						JsonObject o = t.getAsJsonObject();
						if (o.get("id").getAsInt() == id)
						{
							return o.has("done") && o.get("done").getAsBoolean();
						}
					}
					return false;
				}
				case "cabundle":
				{
					int bar = rest.lastIndexOf('|');
					String monster = rest.substring(0, bar);
					String tier = rest.substring(bar + 1);
					boolean any = false;
					for (JsonElement t : arr(obj(profile, "combatAchievements"), "tasks"))
					{
						JsonObject o = t.getAsJsonObject();
						if (monster.equals(str(o, "monster")) && tier.equals(str(o, "tier")))
						{
							any = true;
							if (!(o.has("done") && o.get("done").getAsBoolean()))
							{
								return false;
							}
						}
					}
					return any;
				}
				case "catier": // a goal of reaching a CA tier: "catier:Elite"
				{
					JsonObject ca = obj(profile, "combatAchievements");
					JsonObject thresholds = obj(ca, "thresholds");
					JsonElement need = thresholds == null ? null : thresholds.get(rest);
					return need != null && need.getAsInt() > 0 && ca.get("points").getAsInt() >= need.getAsInt();
				}
				case "clog":
				case "pet":
					return obtained(profile, Integer.parseInt(rest));
				case "clogpage":
				{
					JsonObject page = obj(obj(obj(profile, "collectionLog"), "pages"), rest);
					if (page == null)
					{
						return false;
					}
					JsonArray items = page.getAsJsonArray("items");
					if (items == null || items.size() == 0)
					{
						return false;
					}
					for (JsonElement i : items)
					{
						if (!obtained(profile, i.getAsJsonObject().get("id").getAsInt()))
						{
							return false;
						}
					}
					return true;
				}
				default:
					return false;
			}
		}
		catch (RuntimeException ex)
		{
			// An id or profile shape this version doesn't know: leave the suggestion in.
			return false;
		}
	}

	/** Obtained per the collection log: the item list, or a page entry with a quantity. */
	private static boolean obtained(JsonObject profile, int itemId)
	{
		JsonObject log = obj(profile, "collectionLog");
		JsonObject items = obj(log, "items");
		if (items != null && items.has(String.valueOf(itemId)) && items.get(String.valueOf(itemId)).getAsInt() > 0)
		{
			return true;
		}
		JsonObject pages = obj(log, "pages");
		if (pages == null)
		{
			return false;
		}
		for (String name : pages.keySet())
		{
			JsonArray list = pages.getAsJsonObject(name).getAsJsonArray("items");
			if (list == null)
			{
				continue;
			}
			for (JsonElement i : list)
			{
				JsonObject o = i.getAsJsonObject();
				if (o.get("id").getAsInt() == itemId && o.has("quantity") && o.get("quantity").getAsInt() > 0)
				{
					return true;
				}
			}
		}
		return false;
	}

	static JsonObject obj(JsonObject o, String key)
	{
		if (o == null)
		{
			return null;
		}
		JsonElement e = o.get(key);
		return e != null && e.isJsonObject() ? e.getAsJsonObject() : null;
	}

	static JsonArray arr(JsonObject o, String key)
	{
		JsonElement e = o == null ? null : o.get(key);
		return e != null && e.isJsonArray() ? e.getAsJsonArray() : new JsonArray();
	}

	static String str(JsonObject o, String key)
	{
		JsonElement e = o.get(key);
		return e != null && e.isJsonPrimitive() ? e.getAsString() : null;
	}
}
