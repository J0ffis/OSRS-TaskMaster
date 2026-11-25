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

class TaskMasterPanel extends PluginPanel
{
	private final JLabel status = new JLabel("Not synced yet.");

	TaskMasterPanel(Runnable onSync)
	{
		setLayout(new BorderLayout());
		setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

		JPanel top = new JPanel(new GridLayout(0, 1, 0, 8));
		top.setBackground(ColorScheme.DARK_GRAY_COLOR);

		JButton sync = new JButton("Sync now");
		sync.addActionListener(e -> onSync.run());
		top.add(sync);
		top.add(status);

		JLabel help = new JLabel("<html><body style='width:170px'>"
			+ "<b>Tips for a complete profile</b><br>"
			+ "&bull; Open the <b>collection log</b> and click <b>Search</b> once to record every obtained item.<br>"
			+ "&bull; Kill counts are picked up from chat as you play.<br><br>"
			+ "Your bank, inventory and gear are never read. "
			+ "All data comes from your own client and goes only to the endpoint in this plugin's settings."
			+ "</body></html>");
		help.setForeground(Color.LIGHT_GRAY);
		help.setBorder(BorderFactory.createEmptyBorder(12, 0, 0, 0));

		add(top, BorderLayout.NORTH);
		add(help, BorderLayout.CENTER);
	}

	void setStatus(String text, boolean ok)
	{
		SwingUtilities.invokeLater(() ->
		{
			status.setText(text);
			status.setForeground(ok ? new Color(0x8BC34A) : new Color(0xE57373));
		});
	}
}
