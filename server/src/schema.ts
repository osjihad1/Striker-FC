// Striker FC — database schema.
// Phases 01–09 keep gameplay data client-side (seed database in the client
// bundle, SaveProfile in IndexedDB/LocalStorage per the blueprint).
// Phase 10 adds the one server table the game needs: the Cloud Save mirror —
// a single-row backup of the player's SaveProfile JSON, written and read only
// from Settings → Data & Safety, so a club can be restored on another device.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cloudSaves = sqliteTable("cloud_saves", {
  id: text("id").primaryKey(),
  profileJson: text("profile_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
