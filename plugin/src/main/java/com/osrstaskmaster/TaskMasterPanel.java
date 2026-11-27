package com.osrstaskmaster;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.GridLayout;
import java.awt.Insets;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.image.BufferedImage;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Function;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JMenuItem;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JProgressBar;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.FontManager;
import net.runelite.client.ui.PluginPanel;

/**
 * The sidebar panel: Copy my profile, Open website and Show profile file buttons, plus a status
 * line. It holds no logic of its own; the buttons call back into {@link TaskMasterPlugin}.
 */
class TaskMasterPanel extends PluginPanel
{
	interface Actions
	{
		void copyProfile();
		void openWebsite();
		void openFolder();
		void uploadNow();
		void copyShareLink();
		void deleteUploaded();
		/** New links for this account: every old link (yours and shared ones) stops working. */
		void resetLinks();
		/** Sync: upload the profile now and fetch the website's latest list. */
		void syncPicks();
		/** Open the website on one suggestion. */
		void openPick(String pickId);
		/** Add one suggestion to your goals (right-click a row). */
		void makeGoal(Picks.Pick pick);
	}

	// Tier and category colours match the website (styles.css).
	private static final String[] TIER_LABELS = {"Quick wins", "Balanced", "Long haul", "Challenges"};
	private static final Color[] TIER_COLORS = {new Color(0xC4884F), new Color(0x7D86D4), new Color(0x8E2440), new Color(0xD9DDE3)};
	private static final Map<String, Color> CATEGORY_COLORS = new HashMap<>();
	private static final Map<String, String> CATEGORY_LABELS = new HashMap<>();

	static
	{
		String[][] cats = {
			{"levels", "Levels", "6FA8DC"}, {"quests", "Quests", "E0B04A"}, {"diaries", "Achievement diaries", "8BBF5A"},
			{"combat", "Combat achievements", "F0875E"}, {"clog", "Collection log", "B48CE0"}, {"pets", "Pets", "E85DD5"},
			{"goals", "Goals", "5FC7B5"},
		};
		for (String[] c : cats)
		{
			CATEGORY_LABELS.put(c[0], c[1]);
			CATEGORY_COLORS.put(c[0], new Color(Integer.parseInt(c[2], 16)));
		}
	}

	private static final String HELP_MANUAL = "<html><body style='width:145px'>"
		+ "<b>How to use</b><br>"
		+ "1. Click <b>Copy my profile</b>.<br>"
		+ "2. Click <b>Open website</b> and paste it there (Ctrl+V).<br>"
		+ "Do this again whenever you want fresh suggestions.<br><br>"
		+ "<b>Skip the copy and paste:</b> switch on <b>Automatic upload</b> in this plugin's settings. "
		+ "Your suggestions then show up right here too.<br><br>"
		+ "<b>For a complete profile</b><br>"
		+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once to record every obtained item.<br>"
		+ "&bull; Kill counts are picked up from chat as you play, and from a boss's collection log page when you open it.<br><br>"
		+ "Your bank, inventory and gear are never read. Your profile stays on this PC until you "
		+ "paste it somewhere; the website keeps it in your browser only."
		+ "</body></html>";

	private static final String HELP_UPLOAD = "<html><body style='width:145px'>"
		+ "<b>Automatic upload is on</b><br>"
		+ "Your profile uploads on login and as you play. The list above comes from the website: "
		+ "open it now and then to refresh it. Click a suggestion to open it there.<br><br>"
		+ "<b>Copy share link</b> gives a view-only link for friends. Others can find you by name only "
		+ "if <b>Show my profile publicly</b> is on.<br><br>"
		+ "<b>For a complete profile</b><br>"
		+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once.<br>"
		+ "&bull; Kill counts are picked up from chat as you play, and from a boss's collection log page when you open it.<br><br>"
		+ "Uploads contain your levels, quests, diaries, combat achievements and collection log. "
		+ "Your bank, inventory and gear are never read."
		+ "</body></html>";

	private final Actions actions;
	private final JLabel status = new JLabel("Log in to create your profile.");
	private final JLabel help = new JLabel(HELP_MANUAL);
	private final JPanel uploadButtons = new JPanel(new GridLayout(0, 1, 0, 8));
	private final JButton deleteButton = new JButton("Delete my uploaded data");
	private final JButton resetButton = new JButton("Reset my links");

	// "Your next grinds": the website's picks.
	private final JPanel picksSection = new JPanel();
	private final JComboBox<String> tierBox = new JComboBox<>(TIER_LABELS);
	private final JPanel picksList = new JPanel();
	private final JLabel picksNote = new JLabel();
	private Picks picks;
	private long picksAt;
	/** Rows shown at a time; Refresh steps to the next ones. */
	private static final int PAGE_SIZE = 5;
	/** Which page of each tier is showing. */
	private final int[] page = new int[Picks.TIERS.length];
	private final JButton nextButton = new JButton("Refresh");
	/** Suggestions finished since the website made the list (from the plugin's own profile). */
	private java.util.function.Predicate<String> isDone = id -> false;
	private Function<String, BufferedImage> skillIcons = skill -> null;
	private BiConsumer<Integer, JLabel> itemIcons = (id, label) -> { };
	/** Interface sprites from the game: "skull" and one per category ("quests", "diaries", ...). */
	private Function<String, BufferedImage> sprites = name -> null;

	TaskMasterPanel(Actions actions)
	{
		this.actions = actions;
		setLayout(new BorderLayout());
		setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

		JPanel content = new JPanel();
		content.setLayout(new BoxLayout(content, BoxLayout.Y_AXIS));
		content.setBackground(ColorScheme.DARK_GRAY_COLOR);

		// A vertical stack, so each button keeps its own height (a grid made them all as tall as
		// the tallest row).
		JPanel top = new JPanel();
		top.setLayout(new BoxLayout(top, BoxLayout.Y_AXIS));
		top.setBackground(ColorScheme.DARK_GRAY_COLOR);
		JButton site = new JButton("Open website");
		site.addActionListener(e -> actions.openWebsite());
		JButton copy = new JButton("Copy my profile");
		copy.setToolTipText("Updates your profile and copies it, ready to paste on the website");
		copy.addActionListener(e -> actions.copyProfile());

		uploadButtons.setBackground(ColorScheme.DARK_GRAY_COLOR);
		JButton now = new JButton("Upload now");
		now.addActionListener(e -> actions.uploadNow());
		JButton share = new JButton("Copy share link");
		share.setToolTipText("A view-only link to your suggestions, for friends");
		share.addActionListener(e -> actions.copyShareLink());
		uploadButtons.add(now);
		uploadButtons.add(share);

		for (JComponent c : new JComponent[]{site, copy, uploadButtons, status})
		{
			c.setAlignmentX(LEFT_ALIGNMENT);
			if (c != status)
			{
				c.setMaximumSize(new Dimension(Integer.MAX_VALUE, c.getPreferredSize().height));
			}
			top.add(c);
			top.add(Box.createVerticalStrut(8));
		}

		buildPicksSection();

		help.setForeground(Color.LIGHT_GRAY);
		help.setBorder(BorderFactory.createEmptyBorder(12, 0, 8, 0));

		JButton folder = new JButton("Show profile file");
		folder.setToolTipText("Open the folder with your saved profile file");
		folder.addActionListener(e -> actions.openFolder());
		deleteButton.setToolTipText("Delete your profile and goals from the OSRS TaskMaster server and turn Automatic upload off");
		deleteButton.addActionListener(e ->
		{
			int answer = JOptionPane.showConfirmDialog(this,
				"Delete your uploaded profile and goals from the OSRS TaskMaster server?\n"
					+ "Automatic upload will be switched off and your links will stop working.\n"
					+ "This can't be undone.",
				"Delete uploaded data", JOptionPane.OK_CANCEL_OPTION, JOptionPane.WARNING_MESSAGE);
			if (answer == JOptionPane.OK_OPTION)
			{
				actions.deleteUploaded();
			}
		});
		resetButton.setToolTipText("Give your profile new links. Use this if your own link (the one Open website uses) was shared by mistake");
		resetButton.addActionListener(e ->
		{
			int answer = JOptionPane.showConfirmDialog(this,
				"Give your uploaded profile new links?\n"
					+ "Your goals and suggestions are kept, but every old link stops working:\n"
					+ "your own link and any share links you've given out.\n"
					+ "Use Open website and Copy share link again afterwards.",
				"Reset my links", JOptionPane.OK_CANCEL_OPTION, JOptionPane.QUESTION_MESSAGE);
			if (answer == JOptionPane.OK_OPTION)
			{
				actions.resetLinks();
			}
		});
		JPanel bottomButtons = new JPanel(new GridLayout(0, 1, 0, 8));
		bottomButtons.setBackground(ColorScheme.DARK_GRAY_COLOR);
		bottomButtons.add(folder);
		bottomButtons.add(resetButton);
		bottomButtons.add(deleteButton);

		for (JComponent c : new JComponent[]{top, picksSection, help, bottomButtons})
		{
			c.setAlignmentX(LEFT_ALIGNMENT);
			content.add(c);
		}
		add(content, BorderLayout.NORTH);
		setUploadEnabled(false);
	}

	/**
	 * Where icons come from: skill icons by name, item icons that load into a label, and game
	 * interface sprites by name (null until the game has loaded them).
	 */
	void setIconSources(Function<String, BufferedImage> skillIcons, BiConsumer<Integer, JLabel> itemIcons,
		Function<String, BufferedImage> sprites)
	{
		this.skillIcons = skillIcons;
		this.itemIcons = itemIcons;
		this.sprites = sprites;
	}

	/** A sprite arrived from the game: redraw the list so it shows. */
	void iconsChanged()
	{
		SwingUtilities.invokeLater(this::renderPicks);
	}

	/** A game sprite scaled to fit a box, keeping its pixels sharp. Null if not loaded. */
	private ImageIcon spriteIcon(String name, int max)
	{
		BufferedImage img = sprites.apply(name);
		if (img == null)
		{
			return null;
		}
		double scale = Math.min(1.0, (double) max / Math.max(img.getWidth(), img.getHeight()));
		if (scale >= 1.0)
		{
			return new ImageIcon(img);
		}
		int w = Math.max(1, (int) Math.round(img.getWidth() * scale));
		int h = Math.max(1, (int) Math.round(img.getHeight() * scale));
		return new ImageIcon(img.getScaledInstance(w, h, java.awt.Image.SCALE_SMOOTH));
	}

	// ---- Your next grinds ------------------------------------------------------------------

	private void buildPicksSection()
	{
		picksSection.setLayout(new BoxLayout(picksSection, BoxLayout.Y_AXIS));
		picksSection.setBackground(ColorScheme.DARK_GRAY_COLOR);
		picksSection.setBorder(BorderFactory.createEmptyBorder(14, 0, 0, 0));

		JPanel head = new JPanel(new BorderLayout(6, 0));
		head.setBackground(ColorScheme.DARK_GRAY_COLOR);
		JLabel title = new JLabel("Your next grinds");
		title.setFont(FontManager.getRunescapeBoldFont());
		title.setForeground(Color.WHITE);
		// Refresh: show the next suggestions in this tier (no network). Sync: upload now and fetch
		// the website's latest list, dropping anything finished in game.
		nextButton.setToolTipText("Show different suggestions from this tier");
		nextButton.setMargin(new Insets(1, 6, 1, 6));
		nextButton.addActionListener(e ->
		{
			int t = Math.max(0, tierBox.getSelectedIndex());
			page[t]++;
			renderPicks();
		});
		JButton sync = new JButton("Sync");
		sync.setToolTipText("Upload your progress now and fetch the website's latest list. Finished tasks drop off.");
		sync.setMargin(new Insets(1, 6, 1, 6));
		sync.addActionListener(e -> actions.syncPicks());
		JPanel buttons = new JPanel(new GridLayout(1, 2, 4, 0));
		buttons.setOpaque(false);
		buttons.add(nextButton);
		buttons.add(sync);
		head.add(title, BorderLayout.CENTER);
		head.add(buttons, BorderLayout.EAST);

		tierBox.setToolTipText("Which tier of suggestions to show");
		tierBox.addActionListener(e -> renderPicks());

		picksList.setLayout(new BoxLayout(picksList, BoxLayout.Y_AXIS));
		picksList.setBackground(ColorScheme.DARK_GRAY_COLOR);

		picksNote.setForeground(Color.GRAY);
		picksNote.setFont(FontManager.getRunescapeSmallFont());

		for (JComponent c : new JComponent[]{head, tierBox, picksList, picksNote})
		{
			c.setAlignmentX(LEFT_ALIGNMENT);
			if (c == head || c == tierBox)
			{
				c.setMaximumSize(new Dimension(Integer.MAX_VALUE, c.getPreferredSize().height));
			}
			picksSection.add(c);
			picksSection.add(Box.createVerticalStrut(6));
		}
		picksSection.setVisible(false);
	}

	/** New picks from the service; null means the website hasn't saved any yet. */
	void setPicks(Picks picks, long picksAt)
	{
		SwingUtilities.invokeLater(() ->
		{
			// A new list from the website starts every tier at its top suggestions again.
			if (picks == null || picksAt != this.picksAt)
			{
				java.util.Arrays.fill(page, 0);
			}
			this.picks = picks;
			this.picksAt = picksAt;
			renderPicks();
		});
	}

	/** How to tell a suggestion is finished; the list redraws with it. */
	void setDoneCheck(java.util.function.Predicate<String> isDone)
	{
		SwingUtilities.invokeLater(() ->
		{
			this.isDone = isDone;
			renderPicks();
		});
	}

	private void renderPicks()
	{
		picksList.removeAll();
		int tier = Math.max(0, tierBox.getSelectedIndex());
		nextButton.setVisible(false);
		if (picks == null)
		{
			picksList.add(note("Click Open website once: the website fills this list with your suggestions."));
			picksNote.setText("");
		}
		else
		{
			List<Picks.Pick> all = picks.tier(Picks.TIERS[tier]);
			List<Picks.Pick> open = new java.util.ArrayList<>();
			for (Picks.Pick p : all)
			{
				if (!isDone.test(p.id))
				{
					open.add(p);
				}
			}
			int finished = all.size() - open.size();
			int pages = Math.max(1, (open.size() + PAGE_SIZE - 1) / PAGE_SIZE);
			int current = Math.floorMod(page[tier], pages);
			page[tier] = current;
			nextButton.setVisible(open.size() > PAGE_SIZE);
			if (open.isEmpty())
			{
				picksList.add(note(all.isEmpty()
					? "No " + TIER_LABELS[tier].toLowerCase() + " right now. Try another tier."
					: "You've finished every " + TIER_LABELS[tier].toLowerCase() + " suggestion here. Open the website for new ones."));
			}
			int from = current * PAGE_SIZE;
			for (Picks.Pick p : open.subList(Math.min(from, open.size()), Math.min(from + PAGE_SIZE, open.size())))
			{
				picksList.add(row(p, TIER_COLORS[tier]));
				picksList.add(Box.createVerticalStrut(4));
			}
			String showing = open.size() > PAGE_SIZE
				? (from + 1) + "–" + Math.min(from + PAGE_SIZE, open.size()) + " of " + open.size() + " (Refresh for more). "
				: "";
			String done = finished > 0 ? finished + " finished since then. " : "";
			String filters = picks.filters == null || picks.filters.isEmpty() ? "" : " (" + picks.filters + ")";
			picksNote.setText("<html><body style='width:145px'>" + showing + done + "From the website, "
				+ (picksAt > 0 ? ago(picksAt) : "earlier") + esc(filters) + ". Open the website for a fresh list.</body></html>");
		}
		picksList.revalidate();
		picksList.repaint();
		picksSection.revalidate();
	}

	/** Longest description shown on a row; the tooltip shows the whole text. */
	private static final int DETAIL_MAX = 90;

	/**
	 * The description to show under a row's title (e.g. "Royal Titans: Kill the Royal Titans
	 * while..."), or null when it adds nothing.
	 */
	static String shortDetail(Picks.Pick p)
	{
		String d = p.detail == null ? "" : p.detail.trim();
		if (d.isEmpty() || d.equalsIgnoreCase(p.title))
		{
			return null;
		}
		if (d.length() > DETAIL_MAX)
		{
			int cut = d.lastIndexOf(' ', DETAIL_MAX - 1);
			d = d.substring(0, cut > 40 ? cut : DETAIL_MAX - 1) + "…";
		}
		return d;
	}

	private JComponent row(Picks.Pick p, Color tierColor)
	{
		JPanel row = new JPanel(new BorderLayout(8, 0));
		row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
		row.setBorder(BorderFactory.createCompoundBorder(
			BorderFactory.createMatteBorder(0, 3, 0, 0, tierColor),
			BorderFactory.createEmptyBorder(6, 6, 6, 6)));
		row.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
		boolean isGoal = goalPicks.contains(p.id);
		row.setToolTipText("<html><body style='width:220px'>" + esc(p.detail) + "<br><i>Click to open on the website"
			+ (p.goal != null && !isGoal ? ". Right-click to make it a goal." : "") + "</i></body></html>");

		JLabel icon = new JLabel();
		icon.setPreferredSize(new Dimension(32, 32));
		icon.setHorizontalAlignment(SwingConstants.CENTER);
		icon.setVerticalAlignment(SwingConstants.TOP);
		if (p.icon != null && p.icon.item != null)
		{
			itemIcons.accept(p.icon.item, icon);
		}
		else if (p.icon != null && p.icon.skill != null && skillIcons.apply(p.icon.skill) != null)
		{
			icon.setIcon(new ImageIcon(skillIcons.apply(p.icon.skill)));
		}
		else if (spriteIcon(p.category, 28) != null)
		{
			// The game's own icon for the category: quest list, diary, CA sword, collection log.
			icon.setIcon(spriteIcon(p.category, 28));
		}
		else
		{
			// No game icon yet: a diamond in the category's colour.
			icon.setText("◆");
			icon.setFont(icon.getFont().deriveFont(18f));
			icon.setForeground(CATEGORY_COLORS.getOrDefault(p.category, Color.GRAY));
		}

		JPanel text = new JPanel();
		text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
		text.setOpaque(false);
		// Wilderness rows: the game's PvP skull (the ☠ character until the sprite has loaded).
		ImageIcon skull = p.wilderness ? spriteIcon("skull", 12) : null;
		JLabel cat = new JLabel((p.wilderness ? (skull != null ? "" : "☠ ") + "Wilderness · " : "") + CATEGORY_LABELS.getOrDefault(p.category, "")
			+ (isGoal ? " · Goal ✓" : ""));
		if (skull != null)
		{
			cat.setIcon(skull);
			cat.setIconTextGap(4);
		}
		cat.setFont(FontManager.getRunescapeSmallFont());
		cat.setForeground(p.wilderness ? new Color(0xFF8A7A) : CATEGORY_COLORS.getOrDefault(p.category, Color.GRAY));
		JLabel title = new JLabel("<html><body style='width:104px'>" + esc(p.title) + "</body></html>");
		title.setForeground(Color.WHITE);
		cat.setAlignmentX(LEFT_ALIGNMENT);
		title.setAlignmentX(LEFT_ALIGNMENT);
		text.add(cat);
		text.add(title);
		// What the task actually asks (a CA's requirement, XP to go, where an item drops), so the
		// row makes sense without opening the website. Long ones are cut; the tooltip has it all.
		String detail = shortDetail(p);
		if (detail != null)
		{
			JLabel desc = new JLabel("<html><body style='width:104px'>" + esc(detail) + "</body></html>");
			desc.setFont(FontManager.getRunescapeSmallFont());
			desc.setForeground(new Color(0xA8A8A8));
			desc.setAlignmentX(LEFT_ALIGNMENT);
			text.add(Box.createVerticalStrut(2));
			text.add(desc);
		}
		if (p.progress != null && p.progress > 0)
		{
			JProgressBar bar = new JProgressBar(0, 1000);
			bar.setValue((int) Math.round(p.progress * 1000));
			bar.setPreferredSize(new Dimension(130, 4));
			bar.setMaximumSize(new Dimension(Integer.MAX_VALUE, 4));
			bar.setForeground(tierColor);
			bar.setBackground(ColorScheme.DARK_GRAY_COLOR);
			bar.setBorderPainted(false);
			bar.setAlignmentX(LEFT_ALIGNMENT);
			text.add(Box.createVerticalStrut(4));
			text.add(bar);
		}

		row.add(icon, BorderLayout.WEST);
		row.add(text, BorderLayout.CENTER);
		row.setAlignmentX(LEFT_ALIGNMENT);
		row.setMaximumSize(new Dimension(Integer.MAX_VALUE, row.getPreferredSize().height));
		row.addMouseListener(new MouseAdapter()
		{
			@Override
			public void mouseClicked(MouseEvent e)
			{
				if (SwingUtilities.isRightMouseButton(e))
				{
					rowMenu(p, isGoal).show(row, e.getX(), e.getY());
				}
				else
				{
					actions.openPick(p.id);
				}
			}

			@Override
			public void mouseEntered(MouseEvent e)
			{
				row.setBackground(ColorScheme.DARK_GRAY_HOVER_COLOR);
			}

			@Override
			public void mouseExited(MouseEvent e)
			{
				row.setBackground(ColorScheme.DARKER_GRAY_COLOR);
			}
		});
		return row;
	}

	/** A row's right-click menu: Make it a goal, Open on the website. */
	private JPopupMenu rowMenu(Picks.Pick p, boolean isGoal)
	{
		JPopupMenu menu = new JPopupMenu();
		JMenuItem goal = new JMenuItem(isGoal ? "Already one of your goals" : "Make it a goal");
		goal.setEnabled(p.goal != null && !isGoal);
		if (p.goal == null)
		{
			goal.setToolTipText("This kind of suggestion can't be a goal");
		}
		goal.addActionListener(e -> actions.makeGoal(p));
		JMenuItem open = new JMenuItem("Open on the website");
		open.addActionListener(e -> actions.openPick(p.id));
		menu.add(goal);
		menu.add(open);
		return menu;
	}

	/** Suggestions made into goals from this panel; their rows say so until the list changes. */
	private final java.util.Set<String> goalPicks = new java.util.HashSet<>();

	/** A suggestion was added to your goals (or already was one). */
	void goalAdded(String pickId)
	{
		SwingUtilities.invokeLater(() ->
		{
			goalPicks.add(pickId);
			renderPicks();
		});
	}

	private static JLabel note(String text)
	{
		JLabel l = new JLabel("<html><body style='width:145px'>" + esc(text) + "</body></html>");
		l.setForeground(Color.LIGHT_GRAY);
		l.setAlignmentX(LEFT_ALIGNMENT);
		return l;
	}

	private static String ago(long at)
	{
		long min = Math.max(0, (System.currentTimeMillis() - at) / 60_000);
		if (min < 1)
		{
			return "just now";
		}
		if (min < 60)
		{
			return min + " min ago";
		}
		if (min < 48 * 60)
		{
			return (min / 60) + " h ago";
		}
		return (min / (24 * 60)) + " days ago";
	}

	// ---- Status and mode -------------------------------------------------------------------

	/** Show the upload buttons, the picks list and the upload help only while Automatic upload is on. */
	void setUploadEnabled(boolean on)
	{
		SwingUtilities.invokeLater(() ->
		{
			uploadButtons.setVisible(on);
			picksSection.setVisible(on);
			resetButton.setVisible(on);
			help.setText(on ? HELP_UPLOAD : HELP_MANUAL);
			if (on)
			{
				renderPicks();
			}
			revalidate();
			repaint();
		});
	}

	void setStatus(String text, boolean ok)
	{
		SwingUtilities.invokeLater(() ->
		{
			status.setText("<html><body style='width:145px'>" + esc(text) + "</body></html>");
			status.setForeground(ok ? new Color(0x8BC34A) : new Color(0xE57373));
		});
	}

	private static String esc(String s)
	{
		// Game names (quests especially) use non-breaking spaces, which would stop long titles wrapping.
		return s == null ? "" : s.replace(' ', ' ').replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
	}
}
