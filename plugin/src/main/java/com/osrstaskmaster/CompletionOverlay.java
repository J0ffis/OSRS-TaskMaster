package com.osrstaskmaster;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Composite;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.util.ArrayDeque;
import java.util.Deque;
import javax.inject.Inject;
import net.runelite.api.Client;
import net.runelite.api.Player;
import net.runelite.api.Point;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * The "X completed" pop-up: text above the player's head that rises and fades out, one at a time.
 * Drawn on the client thread, which is also where {@link #show} is called from.
 */
class CompletionOverlay extends Overlay
{
	static final long DURATION_MS = 3_000;
	private static final long FADE_IN_MS = 150;
	private static final long HOLD_MS = 1_200;
	private static final int RISE_PX = 45;
	/** Above the head, in the same units RuneLite uses for overhead text. */
	private static final int HEAD_OFFSET = 40;
	private static final int MAX_QUEUED = 5;
	private static final int MAX_CHARS = 48;
	static final Color GOAL_COLOR = new Color(0xFF981F);
	static final Color PICK_COLOR = new Color(0xFFFF00);
	static final Color SLAYER_COLOR = new Color(0xFF5050);

	private final Client client;
	private final Deque<Toast> queue = new ArrayDeque<>();
	private Toast current;
	private long startedAt;

	private static final class Toast
	{
		final String text;
		final Color color;

		Toast(String text, Color color)
		{
			this.text = text;
			this.color = color;
		}
	}

	@Inject
	CompletionOverlay(Client client)
	{
		this.client = client;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ABOVE_SCENE);
	}

	/** Queue "<label> completed!": goals in orange, suggestions in yellow, Slayer tasks in red. */
	void show(String label, Color color)
	{
		if (queue.size() >= MAX_QUEUED)
		{
			return; // the chat box still lists everything
		}
		queue.add(new Toast(text(label), color));
	}

	void clear()
	{
		queue.clear();
		current = null;
	}

	static String text(String label)
	{
		String l = label.length() > MAX_CHARS ? label.substring(0, MAX_CHARS - 3).trim() + "..." : label;
		return l + " completed!";
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		long now = System.currentTimeMillis();
		if (current != null && now - startedAt >= DURATION_MS)
		{
			current = null;
		}
		if (current == null)
		{
			current = queue.poll();
			startedAt = now;
			if (current == null)
			{
				return null;
			}
		}
		Player player = client.getLocalPlayer();
		if (player == null)
		{
			return null;
		}
		long t = now - startedAt;
		g.setFont(FontManager.getRunescapeBoldFont());
		Point at = player.getCanvasTextLocation(g, current.text, player.getLogicalHeight() + HEAD_OFFSET);
		if (at == null)
		{
			return null; // off screen: the time still runs out
		}
		int x = at.getX();
		int y = at.getY() - rise(t);
		Composite before = g.getComposite();
		g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha(t)));
		g.setColor(Color.BLACK);
		g.drawString(current.text, x + 1, y + 1);
		g.setColor(current.color);
		g.drawString(current.text, x, y);
		g.setComposite(before);
		return null;
	}

	/** How far the text has risen, in pixels, t ms after it appeared: quick at first, then slower. */
	static int rise(long t)
	{
		double f = Math.min(1, Math.max(0, t / (double) DURATION_MS));
		return (int) Math.round(RISE_PX * (1 - (1 - f) * (1 - f)));
	}

	/** Opacity t ms after it appeared: a short fade in, a hold, then a fade out. */
	static float alpha(long t)
	{
		if (t < 0 || t >= DURATION_MS)
		{
			return 0f;
		}
		if (t < FADE_IN_MS)
		{
			return t / (float) FADE_IN_MS;
		}
		if (t < FADE_IN_MS + HOLD_MS)
		{
			return 1f;
		}
		return 1f - (t - FADE_IN_MS - HOLD_MS) / (float) (DURATION_MS - FADE_IN_MS - HOLD_MS);
	}
}
