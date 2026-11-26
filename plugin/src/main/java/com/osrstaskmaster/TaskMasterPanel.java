package com.osrstaskmaster;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.GridLayout;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.PluginPanel;

/**
 * The sidebar panel: Copy my profile, Open website and Show profile file buttons, plus a status
 * line. It holds no logic of its own; the buttons call back into {@link TaskMasterPlugin}.
 */
class TaskMasterPanel extends PluginPanel
{
	private final JLabel status = new JLabel("Log in to create your profile.");

	TaskMasterPanel(Runnable onCopy, Runnable onOpenWebsite, Runnable onOpenFolder)
	{
		setLayout(new BorderLayout());
		setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

		JPanel top = new JPanel(new GridLayout(0, 1, 0, 8));
		top.setBackground(ColorScheme.DARK_GRAY_COLOR);

		JButton copy = new JButton("Copy my profile");
		copy.setToolTipText("Updates your profile and copies it, ready to paste on the website");
		copy.addActionListener(e -> onCopy.run());
		JButton site = new JButton("Open website");
		site.addActionListener(e -> onOpenWebsite.run());
		JButton folder = new JButton("Show profile file");
		folder.setToolTipText("Open the folder with your saved profile file");
		folder.addActionListener(e -> onOpenFolder.run());

		top.add(copy);
		top.add(site);
		top.add(status);

		JLabel help = new JLabel("<html><body style='width:170px'>"
			+ "<b>How to use</b><br>"
			+ "1. Click <b>Copy my profile</b>.<br>"
			+ "2. Click <b>Open website</b> and paste it there (Ctrl+V).<br>"
			+ "Do this again whenever you want fresh suggestions.<br><br>"
			+ "<b>For a complete profile</b><br>"
			+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once to record every obtained item.<br>"
			+ "&bull; Kill counts are picked up from chat as you play.<br><br>"
			+ "Your bank, inventory and gear are never read. Your profile stays on this PC until you "
			+ "paste it somewhere; the website keeps it in your browser only."
			+ "</body></html>");
		help.setForeground(Color.LIGHT_GRAY);
		help.setBorder(BorderFactory.createEmptyBorder(12, 0, 8, 0));

		JPanel bottom = new JPanel(new BorderLayout());
		bottom.setBackground(ColorScheme.DARK_GRAY_COLOR);
		bottom.add(help, BorderLayout.NORTH);
		bottom.add(folder, BorderLayout.SOUTH);

		add(top, BorderLayout.NORTH);
		add(bottom, BorderLayout.CENTER);
	}

	void setStatus(String text, boolean ok)
	{
		SwingUtilities.invokeLater(() ->
		{
			status.setText("<html><body style='width:170px'>" + text + "</body></html>");
			status.setForeground(ok ? new Color(0x8BC34A) : new Color(0xE57373));
		});
	}
}
