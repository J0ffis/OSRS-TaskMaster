package com.osrstaskmaster;

/**
 * Spots a finished Slayer task, for the "completed" chat line and pop-up. The game counts tasks
 * completed in a row (varbit SLAYER_TASKS_COMPLETED, and SLAYER_WILDERNESS_TASKS_COMPLETED for
 * Krystilia's), and a count goes up by one exactly when a task is finished: cancelling, skipping or
 * storing a task doesn't raise it. The counts only count after the login's varbits have settled
 * ({@link #baseline}), so logging in never looks like a finished task. Not thread-safe: use it from
 * the client thread.
 */
final class SlayerTaskWatch
{
	/** -1 until the login has settled. */
	private int streak = -1;
	private int wildStreak = -1;
	/** The latest task seen while it was being done; kept after the count reaches 0. */
	private String task;
	private int size;

	/** The counts once the login's varbits are in. */
	void baseline(int streak, int wildStreak)
	{
		this.streak = streak;
		this.wildStreak = wildStreak;
	}

	/** The task being done now (name may be null when it can't be read), with how many it was. */
	void taskSeen(String name, int size)
	{
		this.task = name;
		this.size = size;
	}

	/** A finished task: what it was (null when it wasn't seen), how many, and the count now. */
	static final class Done
	{
		final String task;
		final int size;
		final int inARow;

		Done(String task, int size, int inARow)
		{
			this.task = task;
			this.size = size;
			this.inARow = inARow;
		}

		/** For the pop-up: "Abyssal demons task", or "Slayer task". */
		String popupLabel()
		{
			return task == null ? "Slayer task" : task + " task";
		}

		/** For the chat line: "150 Abyssal demons (25 in a row)". */
		String chatText()
		{
			String what = task == null ? "your task" : (size > 0 ? size + " " + task : task);
			return what + " (" + inARow + " in a row)";
		}
	}

	/** A count changed: the task just finished, or null if none was. */
	Done streakChanged(boolean wilderness, int now)
	{
		int before = wilderness ? wildStreak : streak;
		if (before < 0)
		{
			return null; // still logging in
		}
		if (wilderness)
		{
			wildStreak = now;
		}
		else
		{
			streak = now;
		}
		if (now <= before)
		{
			return null; // a reset (a task from Turael) or no change
		}
		Done done = new Done(task, size, now);
		task = null;
		size = 0;
		return done;
	}

	/** Another account, or the plugin stopped: start over. */
	void reset()
	{
		streak = -1;
		wildStreak = -1;
		task = null;
		size = 0;
	}
}
