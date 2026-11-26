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
| Kill counts | "Your X kill count is: N" chat messages |

**Never read:** your bank, inventory, equipment or anything about your wealth.

The latest profile is also saved on your PC in `.runelite/osrs-taskmaster/<name>.json`
(**Show profile file** in the panel), so you can load the file on the website instead of pasting.

## Automatic upload (optional)

Rather not copy and paste? Switch on **Automatic upload** in the plugin's settings. Your profile
then uploads on login and as you play, and **Open website** shows your latest suggestions on any
browser, with your goals.

- **Your next grinds** appears in the panel: your suggestions per tier (Quick wins, Balanced,
  Long haul, Challenge), with item and skill icons. Click one to open it on the website. The list
  comes from the website, so it refreshes whenever you open the website.
- Your profile is **private** by default: only people with your link can see it.
  **Copy share link** gives friends a view-only link.
- Switch on **Show my profile publicly** to let anyone look you up by name on the website.
- **Delete my uploaded data** removes your profile and goals from the server and switches
  uploads off.
- Uploads contain the same data as above (never your bank, inventory or gear). As with any
  website, the server can see your IP address while uploading; if you'd rather it didn't, keep
  using copy and paste, which never sends anything.

## Settings

- **Website**: the page opened by *Open website*.
- **Keep profile up to date**: refresh your profile on login and when your progress changes.
- **Automatic upload**, **Show my profile publicly**: see above. Both off by default.
- **Upload server**: leave as it is unless you run your own copy of the service.

## Support

Report problems or ideas at https://github.com/J0ffis/OSRS-TaskMaster/issues.
