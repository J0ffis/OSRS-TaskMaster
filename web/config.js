// Where the OSRS TaskMaster upload service runs (the sync/ folder in this project).
// Pages opened from this PC (scripts\Start-LocalServer.ps1 or a local test) use the local dev service
// started with `npm run dev` in sync/; everywhere else uses the live one.
// (globalThis: the site tests load this module in Node, where there is no `location`.)
const LOCAL = ["127.0.0.1", "localhost"].includes(globalThis.location?.hostname);

export const SYNC_API = LOCAL ? "http://127.0.0.1:8789" : "https://osrs-taskmaster-sync.j0ffis.workers.dev";

// The go-live switch for Automatic upload, shared with UPLOAD_LIVE in the plugin's
// TaskMasterConfig.java. Flip both with scripts\Set-UploadLive.ps1 (tests/upload-switch.test.mjs
// fails if they differ). While false, the live site doesn't mention Automatic upload; the local
// test site (Test Auto-Upload.bat) always does, since it has its own service.
export const LIVE = false;
export const UPLOAD_LIVE = LIVE || LOCAL;
