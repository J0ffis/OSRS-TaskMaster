# OSRS TaskMaster

Not sure what to grind next? OSRS TaskMaster looks at your own account and suggests what to do,
from quick wins you can finish tonight to long hauls for the month ahead. Suggestions draw on your
levels, quests, achievement diaries, combat achievements, collection log, pets and your own goals.

## How to use it

1. Log in and open the **OSRS TaskMaster** panel on RuneLite's sidebar.
2. Click **Copy my profile**.
3. Click **Open website** and press **Ctrl+V** on the page.

For a complete collection log, open the collection log in game and click **Search** once, then
copy your profile again.

With copy and paste, the website keeps your profile and goals in your browser only. Nothing is
uploaded.

## What it reads

| Data | Where it comes from |
|---|---|
| Levels and XP | Your skills |
| Quests and quest points | Quest states |
| Achievement diaries | Diary completion |
| Combat achievements | Points, reward tiers and completed tasks |
| Collection log | Totals, the page layout from the game cache, and obtained items when you click Search |
| Pets | The collection log's "All Pets" page |
| Kill counts | "Your X kill count is: N" chat messages, and the kill count shown at the top of a boss's collection log page when you open it |

**Never read:** your bank, inventory, equipment or anything about your wealth.

The latest profile is also saved on your PC in `.runelite/osrs-taskmaster/<name>.json`
(**Show profile file** in the panel), so you can load the file on the website instead of pasting.

## Automatic upload (optional, not live yet)

> **Not live yet.** The upload server isn't running for everyone yet, so leave this setting off
> and use copy and paste. Testers can try it with `Test Auto-Upload.bat` from the project
> download, which runs a test server on their own PC and switches this on for that run only
> (see the [tester guide](../TESTER-GUIDE.md#4-automatic-upload-test-auto-uploadbat)).

Rather not copy and paste? Switch on **Automatic upload** in the plugin's settings. Your profile
then uploads on login and as you play, and **Open website** shows your latest suggestions on any
browser, with your goals.

- **Your next grinds** appears in the panel: your suggestions per tier (Quick wins, Balanced,
  Long haul, Challenge), with item and skill icons. Click one to open it on the website;
  right-click it and choose **Make it a goal** to add it to your goals (the row then says
  "Goal ✓", and the website shows it next time it loads).
  **Refresh** shows different suggestions from the same tier (5 at a time, up to 15).
  **Sync** uploads your progress now and fetches the website's latest list; anything you've
  finished in game drops off straight away ("Get any missing …" rows once you log one of them).
  Bars and counts on log, combat achievement, level and goal rows follow your progress too.
  The list itself is made by the website, so opening the website gives you a fresh one; the
  panel picks it up within 5 minutes.
  With **Fastest logs first** switched on on the website, collection log and pet rows come
  quickest first and show a rough time ("Collection log · ~12 h"); Refresh steps on to the next
  quickest. The list also gets a **Collection log** choice: log and pet rows only, from every
  tier, quickest first. It goes away when you switch Fastest logs first off.
- **Your route** appears above it once you pin a route with the website's route planner: the
  next 4 steps in order (the first marked **Next**), how many are done, and what each step is for.
  Steps you finish in game (a level reached, a quest done) drop off at once; click a step to open
  the route on the website, where you change or unpin it.
- **Completed!** When you finish one of your goals, or a suggestion or route step from the
  panel, "85 Slayer completed!" rises above your character and the chat box says
  *TaskMaster: Goal completed: 85 Slayer* (or *Suggestion completed*). Only things you finish
  while playing count, each once. A few goal kinds aren't checked in game (pets and items
  you named, "any missing piece", goals you tick by hand).
- Your profile is **private** by default: only people with your link can see it.
  **Copy share link** (here or on the website) gives friends a view-only link: they see your
  suggestions and goals but can't change anything.
- **Open website** uses your own link, which can change your goals. If you shared it by mistake,
  **Reset my links** gives you new links and stops every old one working; your goals are kept.
- Switch on **Show my profile publicly** to let anyone look you up by name on the website.
- **Delete my uploaded data** removes your profile and goals from the server and switches
  uploads off.
- Uploads contain the same data as above (never your bank, inventory or gear). As with any
  website, the server can see your IP address while uploading; if you'd rather it didn't, keep
  using copy and paste, which never sends anything.

## Settings

- **Website**: the page opened by *Open website*.
- **Keep profile up to date**: refresh your profile on login and when your progress changes.
- **Chat message when done**, **Pop-up when done**: the *Completed!* alerts above. Both on by
  default; they need Automatic upload, because that's how the plugin gets your goals.
- **Automatic upload**, **Show my profile publicly**: see above. Both off by default, in a
  section that stays closed until Automatic upload is live.
- **Upload server**: leave as it is unless you run your own copy of the service.

## Support

Report problems or ideas at https://github.com/J0ffis/OSRS-TaskMaster/issues.
