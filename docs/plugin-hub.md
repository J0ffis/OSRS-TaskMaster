# Publishing to the Plugin Hub

`plugin/` already has what the Hub needs: `runelite-plugin.properties`, `LICENSE`
(BSD-2-Clause), `icon.png` (48×72) and a player-facing `README.md`.

The Hub only builds plugins from their own repository, with the Gradle project at the root. So
when the plugin is stable:

1. Create an empty GitHub repository, for example `J0ffis/osrs-taskmaster-plugin`.
2. Copy `plugin/` into it with its history:
   ```powershell
   git subtree split --prefix plugin -b plugin-hub
   git push https://github.com/J0ffis/osrs-taskmaster-plugin.git plugin-hub:main
   ```
3. Fork `runelite/plugin-hub` and add a file `plugins/osrs-taskmaster` containing:
   ```
   repository=https://github.com/J0ffis/osrs-taskmaster-plugin.git
   commit=<full commit hash from step 2>
   ```
4. Open a pull request and answer the reviewers. Each later plugin update is a new pull request
   with a new commit hash.

## Before submitting

- Settle the website address (`DEFAULT_WEBSITE` in `TaskMasterConfig.java`).
- Decide whether to keep **Send to my own server**. It's the reason
  `runelite-plugin.properties` carries a `warning`. If the Hub version shouldn't send data
  anywhere, remove the setting and the warning together.
