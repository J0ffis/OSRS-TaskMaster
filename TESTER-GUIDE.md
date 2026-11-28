# OSRS TaskMaster: getting started

OSRS TaskMaster suggests what to grind next, based on your levels, quests, diaries, combat
achievements, collection log and pets. It uses a RuneLite plugin that reads your own game client;
it never reads your bank, inventory or gear.

**You'll need:** a Windows PC, about 1 GB of free space, and 10–15 minutes the first time.

## Two ways to test, one download

The download has the same plugin either way. Which file you double-click decides how your
progress gets to the website:

| | **Copy and paste** | **Automatic upload** |
|---|---|---|
| Start with | **Start TaskMaster.bat** | **Test Auto-Upload.bat** |
| Getting your progress to the website | Click **Copy my profile** in RuneLite, press **Ctrl+V** on the website | Nothing to do: it uploads by itself as you play |
| Website | The live site, **https://j0ffis.github.io/OSRS-TaskMaster/** | A test copy on your PC, **http://127.0.0.1:8790/** |
| Where your profile goes | Your PC and your browser only | Also a small test server on your PC (nothing leaves your PC) |
| Extra setup the first time | Java | Java, plus Node.js and a few tools (about 85 MB more) |
| Black window | Stays open while RuneLite runs, and closes with it | The same, and it also runs the test server |

You can switch between them whenever you like: close RuneLite and start the other file. One
doesn't change the other's settings, and both have the same website features. Automatic upload
isn't live for everyone yet, which is why it only works through **Test Auto-Upload.bat** for now.

## 1. Download it

1. Go to **https://github.com/J0ffis/OSRS-TaskMaster**
2. Click the green **Code** button → **Download ZIP**. This one download has both ways of
   testing in it.
3. Find the ZIP in your Downloads folder, right-click it → **Extract All…** → **Extract**.
   Don't run anything from inside the ZIP itself; it has to be extracted first.

## 2. First start (both ways)

1. In the extracted folder, double-click **Start TaskMaster.bat** (or **Test Auto-Upload.bat**,
   see [Automatic upload](#4-automatic-upload-test-auto-uploadbat) below).
2. If Windows shows **"Windows protected your PC"**, click **More info** → **Run anyway**.
3. A black window opens and walks you through setup:
   - **Java:** if it asks to download Java, type **Y** and press Enter. This is a private copy
     (about 190 MB) that only TaskMaster uses. It doesn't install anything system-wide or need
     admin rights.
   - **Login:** if you have a **Jagex account** (you log in through the Jagex Launcher), follow
     the steps it shows once:
     1. Open the Start menu and search for **RuneLite (configure)**.
     2. In **Client arguments**, type `--insecure-write-credentials` and click **Save**.
     3. Open the **Jagex Launcher**, play RuneLite as normal until you're logged in, then close it.
     4. Open **RuneLite (configure)** again, clear **Client arguments**, and click **Save**.
     5. Go back to the black window and press **Enter**.

     If you log in with an email and password instead, type **S** and press Enter to skip this.
4. A separate copy of RuneLite starts. **The first start takes a few minutes** while it
   downloads; later starts are quicker. Setup is skipped from then on.

## 3. Copy and paste (Start TaskMaster.bat)

1. The website opens in your browser by itself, on a start page that says to copy and paste your
   profile.
2. Log in to the game in the RuneLite window that opened.
3. On RuneLite's right-hand sidebar, click the **OSRS TaskMaster** icon (a small gold square
   with bars).
4. Click **Copy my profile**. The panel says *Copied at 14:05. Open the website and press Ctrl+V.*
5. Go to the website and press **Ctrl+V**. Your suggestions appear straight away.

**What it looks like:** the panel has **Open website**, **Copy my profile** and, further down,
**Show profile file**, with a short *How to use* note. There's no suggestions list in the panel in
this mode. On the website, your name shows *Synced … ago*: that's when you last copied your
profile. For fresh suggestions later, click **Copy my profile** again, then on the website
**Update profile** → **Ctrl+V**.

Goals you add on the website are saved in that browser. Using a different browser or PC means
pasting your profile again.

**For a complete collection log:** open the collection log in game and click **Search** once.
Then click **Copy my profile** again and use **Update profile** on the website.

## 4. Automatic upload (Test Auto-Upload.bat)

If you want to test **Automatic upload**, start this way instead. Your progress then goes to
the website by itself, and the RuneLite panel shows your next grinds. Everything runs on your PC
only; nothing is sent anywhere else just yet.

1. Close RuneLite if it's open. Double-click **Test Auto-Upload.bat** in the extracted folder.
2. The first time, it asks to download **Node.js**: type **Y** and press Enter. Like Java, it's a
   private copy (about 35 MB) that doesn't install anything system-wide. It then installs a few
   more tools (about 50 MB), which takes a minute or two. Java and the Jagex login step work as in
   [First start](#2-first-start-both-ways).
3. It starts a small test server in the background (up to a minute the first time). The black
   window then shows *Upload service: http://127.0.0.1:8789* and *Website: http://127.0.0.1:8790/*.
   **Leave the black window open** while you test; closing RuneLite stops everything. If it can't
   start, the black window shows why: send a screenshot of it.
4. Log in to the game. Open the **OSRS TaskMaster** panel and click **Open website**. There's
   nothing to set up in RuneLite's settings, and the browser doesn't open until you click it.
5. Just play. Your progress uploads by itself, at most every 5 minutes as it changes, and the
   website picks it up when you switch back to it. **Your next grinds** in the panel fills in once
   you've opened the website; click **Sync** there to update it.

**What it looks like:** the panel's note says *Automatic upload is on*, and it has two more
buttons, **Upload now** and **Copy share link**, plus **Your next grinds** (your suggestions, a
tier at a time) and **Reset my links**. Once you pin a route on the website, **Your route** shows
above the suggestions. The website opens at `http://127.0.0.1:8790/#id=…`, and your name shows
*Uploaded … ago* and **Owner**. Links only work on this PC.

**Worth trying:** add and finish goals (finishing one in game, say a level, should show
"... completed!" above your character and a line in the chat box), **Not for me**, **Make it a goal** from the panel
(right-click a suggestion), **Copy share link** (open it in a private window: it's view only),
**See it as others do** on your own page, **Reset my links** (your old link should stop working)
and **Delete my uploaded data**. Note anything that seems wrong, slow or confusing, and roughly
when it happened.

Your test uploads are kept between runs on your PC (in the `sync\.wrangler` folder). To start
again with none, delete that folder.

## Getting a newer version

When you're told there's a new version, download the ZIP again and extract it over the old
folder (or into a new one). Java, Node.js and the login step aren't asked for again. With copy and
paste, website changes reach you straight away, since the live site is always the newest; with
**Test Auto-Upload.bat**, the website comes from your download, so it updates when you download
again.

## Tips

- **Quick wins / Balanced / Long haul / Mixed** choose how big a task you're after.
  **Shuffle** gives you new picks.
- The **Challenge** card under your picks is a long-term goal that takes weeks or months.
  **Take on this challenge** adds it to your goals; **Another challenge** shows a different one.
- In the **Diaries** tab, green tiers are done and yellow ones are in progress. Click a square to
  open that tier on the wiki.
- In the **Combat** tab, **Plan a tier** picks the bosses whose tasks get you to the next combat
  achievement reward tier, and adds them as goals with a route.
- **★ Showcase** under your name lets you show off a favourite item or pet, boss, quest and
  skill. Each is optional: only the ones you pick appear. You can also click **☆** next to
  anything in the **Skills**, **Quests**, **Collection log** and **Pets** tabs (click **★** again
  to remove it). A boss shows its kill count once the plugin has one: open that boss's
  collection log page in game, or get a kill. Pages with several bosses, such as **Dagannoth
  Kings**, add their counts up (hover over it to see each one).
- Click the **OSRS TaskMaster** logo at the top left to go back to the start page.
- Minigames, Wilderness and clue tasks are hidden until you switch them on under
  **Also include**. Wilderness tasks are marked **☠ Wilderness: PvP risk**: other players can
  attack you there, and you can lose what you carry.
- Hunting collection log slots? Turn on **Fastest logs first** under the category chips: log and
  pet cards then come quickest first, each with a rough time ("~12 h"), and Shuffle moves on to
  the next quickest. Switch off the other categories to see only log cards. With Automatic
  upload, the RuneLite panel's list then also offers **Collection log**: just your log and pet
  slots, quickest first.
- **Clear all** next to **Goals** removes every goal at once (it asks first, and it can't be
  undone).
- **Load sample data** on the start page shows a made-up account. Use **View the sample as** to
  switch between six of them: a main, Ironman, Hardcore, Ultimate, Group and Hardcore Group
  Ironman, each with its own levels and progress. A link like `.../#sample=hcim` opens a
  particular one.

## About the Jagex login step

The one-time login step saves your RuneLite login session in a file on your PC
(`%USERPROFILE%\.runelite\credentials.properties`), so this test version of RuneLite can log you
in without the Jagex Launcher. Treat that file like a password: don't share it or send it to
anyone. When you're done testing, delete it with **Forget TaskMaster login.bat**.

## Removing it

- Double-click **Forget TaskMaster login.bat** to delete the saved Jagex login.
- On the website: **Update profile** → **Remove this profile from this browser**.
- If you tried Automatic upload: **Delete my uploaded data** in the panel first (while
  **Test Auto-Upload.bat** is running).
- Delete the extracted folder, and optionally the Java copy at `%LOCALAPPDATA%\Programs\jdk17` and
  the Node.js copy at `%LOCALAPPDATA%\Programs\node`.

## Something went wrong?

Take a screenshot of the black window or the website and send it to whoever shared this with
you.
