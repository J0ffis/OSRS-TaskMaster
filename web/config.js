// Where the OSRS TaskMaster upload service runs (the sync/ folder in this project).
// Pages opened from this PC (start-server.ps1 or a local test) use the local dev service
// started with `npm run dev` in sync/; everywhere else uses the live one.
const LOCAL = ["127.0.0.1", "localhost"].includes(location.hostname);

export const SYNC_API = LOCAL ? "http://127.0.0.1:8789" : "https://osrs-taskmaster-sync.j0ffis.workers.dev";
