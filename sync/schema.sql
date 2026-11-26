-- OSRS TaskMaster sync service: one row per uploaded profile.
-- id          : public-safe profile id, derived from the player's secret upload key
-- edit_hash   : SHA-256 of the edit token (lets the website save goals); the token itself is never stored
-- account_tag : SHA-256 of the RuneLite account hash; only used to settle who may show a name publicly
-- name_key    : lower-case player name, for public lookups
CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,
  edit_hash   TEXT NOT NULL,
  account_tag TEXT,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  public      INTEGER NOT NULL DEFAULT 0,
  profile     TEXT NOT NULL,
  goals       TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS profiles_public_name ON profiles (name_key) WHERE public = 1;
