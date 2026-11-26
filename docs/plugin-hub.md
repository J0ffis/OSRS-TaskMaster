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

- Deploy the sync service (`sync/README.md`) and make sure `DEFAULT_UPLOAD_SERVER` and
  `DEFAULT_WEBSITE` in `TaskMasterConfig.java` are the live addresses.
- Automatic upload is the reason `runelite-plugin.properties` carries a `warning`: it's off by
  default, and the warning tells players what's sent if they switch it on.
