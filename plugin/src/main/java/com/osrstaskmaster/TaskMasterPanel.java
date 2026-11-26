package com.osrstaskmaster;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.GridLayout;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.PluginPanel;

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
	}

	private static final String HELP_MANUAL = "<html><body style='width:170px'>"
		+ "<b>How to use</b><br>"
		+ "1. Click <b>Copy my profile</b>.<br>"
		+ "2. Click <b>Open website</b> and paste it there (Ctrl+V).<br>"
		+ "Do this again whenever you want fresh suggestions.<br><br>"
		+ "<b>Skip the copy and paste:</b> switch on <b>Automatic upload</b> in this plugin's settings.<br><br>"
		+ "<b>For a complete profile</b><br>"
		+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once to record every obtained item.<br>"
		+ "&bull; Kill counts are picked up from chat as you play.<br><br>"
		+ "Your bank, inventory and gear are never read. Your profile stays on this PC until you "
		+ "paste it somewhere; the website keeps it in your browser only."
		+ "</body></html>";

	private static final String HELP_UPLOAD = "<html><body style='width:170px'>"
		+ "<b>Automatic upload is on</b><br>"
		+ "Your profile uploads on login and as you play. Click <b>Open website</b> to see your latest "
		+ "suggestions on any browser; your goals follow you too.<br><br>"
		+ "<b>Copy share link</b> gives a view-only link for friends. Others can find you by name only "
		+ "if <b>Show my profile publicly</b> is on.<br><br>"
		+ "<b>For a complete profile</b><br>"
		+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once.<br>"
		+ "&bull; Kill counts are picked up from chat as you play.<br><br>"
		+ "Uploads contain your levels, quests, diaries, combat achievements and collection log. "
		+ "Your bank, inventory and gear are never read."
		+ "</body></html>";

	private final JLabel status = new JLabel("Log in to create your profile.");
	private final JLabel help = new JLabel(HELP_MANUAL);
	private final JPanel uploadButtons = new JPanel(new GridLayout(0, 1, 0, 8));
	private final JButton deleteButton = new JButton("Delete my uploaded data");

	TaskMasterPanel(Actions actions)
	{
		setLayout(new BorderLayout());
		setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

		JPanel top = new JPanel(new GridLayout(0, 1, 0, 8));
		top.setBackground(ColorScheme.DARK_GRAY_COLOR);

		JButton site = new JButton("Open website");
		site.addActionListener(e -> actions.openWebsite());
		JButton copy = new JButton("Copy my profile");
		copy.setToolTipText("Updates your profile and copies it, ready to paste on the website");
		copy.addActionListener(e -> actions.copyProfile());
		top.add(site);
		top.add(copy);

		uploadButtons.setBackground(ColorScheme.DARK_GRAY_COLOR);
		JButton now = new JButton("Upload now");
		now.addActionListener(e -> actions.uploadNow());
		JButton share = new JButton("Copy share link");
		share.setToolTipText("A view-only link to your suggestions, for friends");
		share.addActionListener(e -> actions.copyShareLink());
		uploadButtons.add(now);
		uploadButtons.add(share);
		top.add(uploadButtons);
		top.add(status);

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

		JPanel bottomButtons = new JPanel(new GridLayout(0, 1, 0, 8));
		bottomButtons.setBackground(ColorScheme.DARK_GRAY_COLOR);
		bottomButtons.add(folder);
		bottomButtons.add(deleteButton);

		JPanel bottom = new JPanel(new BorderLayout());
		bottom.setBackground(ColorScheme.DARK_GRAY_COLOR);
		bottom.add(help, BorderLayout.NORTH);
		bottom.add(bottomButtons, BorderLayout.SOUTH);

		add(top, BorderLayout.NORTH);
		add(bottom, BorderLayout.CENTER);
		setUploadEnabled(false);
	}

	/** Show the upload buttons and help only while Automatic upload is on. */
	void setUploadEnabled(boolean on)
	{
		SwingUtilities.invokeLater(() ->
		{
			uploadButtons.setVisible(on);
			help.setText(on ? HELP_UPLOAD : HELP_MANUAL);
			revalidate();
			repaint();
		});
	}

	void setStatus(String text, boolean ok)
	{
		SwingUtilities.invokeLater(() ->
		{
			status.setText("<html><body style='width:170px'>" + escape(text) + "</body></html>");
			status.setForeground(ok ? new Color(0x8BC34A) : new Color(0xE57373));
		});
	}

	private static String escape(String s)
	{
		return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
	}
}
