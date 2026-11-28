package com.osrstaskmaster;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class SlayerTaskWatchTest
{
	@Test
	public void aHigherCountIsAFinishedTask()
	{
		SlayerTaskWatch w = new SlayerTaskWatch();
		w.baseline(24, 3);
		w.taskSeen("Abyssal demons", 150);
		SlayerTaskWatch.Done done = w.streakChanged(false, 25);
		assertEquals("Abyssal demons task", done.popupLabel());
		assertEquals("150 Abyssal demons (25 in a row)", done.chatText());
	}

	@Test
	public void loggingInIsNeverAFinishedTask()
	{
		SlayerTaskWatch w = new SlayerTaskWatch();
		w.taskSeen("Abyssal demons", 150);
		assertNull("the login's varbits arriving", w.streakChanged(false, 24));
		w.baseline(24, 0);
		assertNull("same count again", w.streakChanged(false, 24));
	}

	@Test
	public void aResetIsNotAFinishedTaskButTheNextOneCounts()
	{
		SlayerTaskWatch w = new SlayerTaskWatch();
		w.baseline(24, 0);
		assertNull("a task from Turael resets the count", w.streakChanged(false, 0));
		w.taskSeen("Cows", 20);
		assertEquals("20 Cows (1 in a row)", w.streakChanged(false, 1).chatText());
	}

	@Test
	public void wildernessTasksHaveTheirOwnCount()
	{
		SlayerTaskWatch w = new SlayerTaskWatch();
		w.baseline(24, 3);
		w.taskSeen("Revenants", 40);
		assertNull("the other count didn't move", w.streakChanged(false, 24));
		assertEquals("40 Revenants (4 in a row)", w.streakChanged(true, 4).chatText());
	}

	@Test
	public void aTaskThatWasntSeenStillCounts()
	{
		SlayerTaskWatch w = new SlayerTaskWatch();
		w.baseline(5, 0);
		SlayerTaskWatch.Done done = w.streakChanged(false, 6);
		assertEquals("Slayer task", done.popupLabel());
		assertEquals("your task (6 in a row)", done.chatText());

		w.taskSeen("Hellhounds", 0);
		assertEquals("no size", "Hellhounds (7 in a row)", w.streakChanged(false, 7).chatText());
		assertEquals("forgotten once announced", "Slayer task", w.streakChanged(false, 8).popupLabel());

		w.reset();
		assertNull(w.streakChanged(false, 9));
	}
}
