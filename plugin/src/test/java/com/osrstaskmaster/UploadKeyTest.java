package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

/**
 * The plugin, the sync service (sync/src/index.js) and the website must derive the same
 * profile id and edit token from an upload key. Expected values come from the service's deriveIds().
 */
public class UploadKeyTest
{
	private static final String KEY = "TestKey_0123456789-abcdefghijklmnopqrstuvwxyz";

	@Test
	public void profileIdMatchesTheService()
	{
		assertEquals("SnzwYtpBOxX42FHVr3504k", TaskMasterPlugin.deriveId(KEY));
	}

	@Test
	public void editTokenMatchesTheService()
	{
		assertEquals("LFWnxFR5JOGW5lCj8gRWwfVTp8sfJ-g6", TaskMasterPlugin.deriveEditToken(KEY));
	}
}
