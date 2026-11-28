// Where the OSRS TaskMaster upload service runs (the sync/ folder in this project).
// Pages opened from this PC (scripts\Start-LocalServer.ps1 or a local test) use the local dev service
// started with `npm run dev` in sync/; everywhere else uses the live one.
// (globalThis: the site tests load this module in Node, where there is no `location`.)
const LOCAL = ["127.0.0.1", "localhost"].includes(globalThis.location?.hostname);

export const SYNC_API = LOCAL ? "http://127.0.0.1:8789" : "https://osrs-taskmaster-sync.j0ffis.workers.dev";

// Whether to tell players about Automatic upload. The live service isn't deployed yet, so only the
// local test site (Test Auto-Upload.bat) mentions it. Set this to true once sync/ is deployed, and
// open the plugin's "Automatic upload" settings section again (TaskMasterConfig.java).
export const UPLOAD_LIVE = LOCAL;
