# OSRS TaskMaster: getting started

OSRS TaskMaster suggests what to grind next, based on your levels, quests, diaries, combat
achievements, collection log and pets. It uses a RuneLite plugin that reads your own game client;
it never reads your bank, inventory or gear. Your profile stays on your PC and in your browser,
and nothing is uploaded anywhere.

**You'll need:** a Windows PC, about 1 GB of free space, and 10–15 minutes the first time.

## 1. Download it

1. Download the test version:
   **https://github.com/J0ffis/OSRS-TaskMaster/archive/refs/heads/feature/auto-upload.zip**
   (it's the Automatic upload test build, so it isn't what the green **Code** button on the
   project page gives you).
2. Find the ZIP in your Downloads folder, right-click it → **Extract All…** → **Extract**.
   Don't run anything from inside the ZIP itself; it has to be extracted first.

## 2. Start it

1. In the extracted folder, double-click **Start TaskMaster.bat**.
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
4. The TaskMaster website opens in your browser, and a separate copy of RuneLite starts.
   **The first start takes a few minutes** while it downloads; later starts are quicker.

## 3. Get your suggestions

1. Log in to the game in the RuneLite window that opened.
2. On RuneLite's right-hand sidebar, click the **OSRS TaskMaster** icon (a small gold square
   with bars).
3. Click **Copy my profile**.
4. Go to the website (**https://j0ffis.github.io/OSRS-TaskMaster/**) and press **Ctrl+V**.
   Your suggestions appear straight away.

**For a complete collection log:** open the collection log in game and click **Search** once.
Then click **Copy my profile** again and use **Update profile** on the website.

## Trying Automatic upload (no copy and paste)

If you were asked to test **Automatic upload**, start it this way instead. Your progress then
goes to the website by itself, and the RuneLite panel shows your next grinds. Everything runs on
your PC only; nothing is sent anywhere else.

1. Close RuneLite if it's open. Double-click **Test Auto-Upload.bat** in the extracted folder.
2. The first time, it asks to download **Node.js**: type **Y** and press Enter. Like Java, it's a
   private copy (about 35 MB) that doesn't install anything system-wide. It then installs a few
   more tools, which takes a minute or two. Java and the Jagex login step work as in step 2 above.
3. It starts a small test server in the background (up to a minute the first time). Leave the
   black window open while you test; closing RuneLite stops everything. If it can't start, the
   black window shows why: send a screenshot of it.
4. Log in to the game. Open the **OSRS TaskMaster** panel and click **Open website**. There's
   nothing to set up in RuneLite's settings.
5. Just play. Your progress uploads by itself, at most every 5 minutes as it changes, and the
   website picks it up when you switch back to it. **Your next grinds** in the panel fills in once
   you've opened the website; click **Sync** there to update it.

**Worth trying:** add and finish goals, **Not for me**, **Make it a goal** from the panel,
**Copy share link** (open it in another browser: it's view only), **Reset my links** (your old
link should stop working) and **Delete my uploaded data**. Note anything that seems wrong, slow or
confusing, and roughly when it happened.

Your normal **Start TaskMaster.bat** isn't affected: it still uses copy and paste.

## Using it again later

- Double-click **Start TaskMaster.bat**. Setup is skipped from now on.
- Whenever you want fresh suggestions: **Copy my profile** in RuneLite, then on the website
  **Update profile** → **Ctrl+V**.
- Goals you add on the website are saved in that browser. Using a different browser or PC means
  pasting your profile again.

## Tips

- **Quick wins / Balanced / Long haul / Mixed** choose how big a task you're after.
  **Shuffle** gives you new picks.
- The **Challenge** card under your picks is a long-term goal that takes weeks or months.
  **Take on this challenge** adds it to your goals; **Another challenge** shows a different one.
- In the **Diaries** tab, green tiers are done and yellow ones are in progress. Click a square to
  open that tier on the wiki.
- Click the **OSRS TaskMaster** logo at the top left to go back to the start page.
- Minigames, Wilderness and clue tasks are hidden until you switch them on under
  **Also include**. Wilderness tasks are marked **☠ Wilderness: PvP risk**: other players can
  attack you there, and you can lose what you carry.
- Hunting collection log slots? Turn on **Fastest logs first** under the category chips: log and
  pet cards then come quickest first, each with a rough time ("~12 h"), and Shuffle moves on to
  the next quickest. Switch off the other categories to see only log cards.
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
- Delete the extracted folder, and optionally the Java copy at `%LOCALAPPDATA%\Programs\jdk17`.

## Something went wrong?

Take a screenshot of the black window or the website and send it to whoever shared this with
you.
