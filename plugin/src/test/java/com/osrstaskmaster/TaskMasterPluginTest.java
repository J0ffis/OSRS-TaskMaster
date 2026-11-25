package com.osrstaskmaster;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Dev launcher: starts RuneLite with this plugin side-loaded. Run via `gradlew run`. */
public class TaskMasterPluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(TaskMasterPlugin.class);
		RuneLite.main(args);
	}
}
