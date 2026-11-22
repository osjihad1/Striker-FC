// Striker FC — server actions.
// Phases 01–09 are a client-side engine build (database, fixed-timestep loop
// and IndexedDB save system all live in the client, per the blueprint).
// Phase 10 adds the Cloud Save mirror: the Settings screen backs the player's
// SaveProfile JSON up to this server store and can restore it on any device.

import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const CLOUD_ROW_ID = "profile";

const cloudSaveResponse = z.object({
  json: z.string().nullable(),
  updatedAt: z.number().nullable(),
});

export const Actions = {
  getEngineInfo: defineAction({
    description: "Returns the Striker FC build phase and engine contract summary.",
    request: z.object({}),
    response: z.object({
      game: z.string(),
      phase: z.number(),
      fixedDt: z.number(),
      maxFrameDt: z.number(),
      hudSyncHz: z.number(),
    }),
    async handler() {
      return {
        game: "Striker FC",
        phase: 10,
        fixedDt: 1 / 60,
        maxFrameDt: 0.05,
        hudSyncHz: 20,
      };
    },
  }),

  getCloudSave: defineAction({
    description: "Returns the player's cloud-saved profile JSON and when it was backed up, or nulls when no backup exists.",
    request: z.object({}),
    response: cloudSaveResponse,
    async handler(ctx): Promise<z.infer<typeof cloudSaveResponse>> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.cloudSaves)
        .where(eq(schema.cloudSaves.id, CLOUD_ROW_ID));
      const row = rows[0];
      if (!row) return { json: null, updatedAt: null };
      return { json: row.profileJson, updatedAt: row.updatedAt };
    },
  }),

  putCloudSave: defineAction({
    description: "Backs up the player's SaveProfile JSON to the cloud save store, replacing any previous backup.",
    request: z.object({
      json: z.string().min(2).max(2_000_000),
    }),
    response: z.object({
      ok: z.literal(true),
      updatedAt: z.number(),
    }),
    async handler(ctx, args) {
      // Refuse anything that is not a JSON object before it reaches storage.
      let parsed: unknown;
      try {
        parsed = JSON.parse(args.json);
      } catch {
        throw new Error("Cloud save refused: the payload is not valid JSON.");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Cloud save refused: the payload is not a save profile object.");
      }
      const updatedAt = Date.now();
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.cloudSaves)
        .values({ id: CLOUD_ROW_ID, profileJson: args.json, updatedAt })
        .onConflictDoUpdate({
          target: schema.cloudSaves.id,
          set: { profileJson: args.json, updatedAt },
        });
      return { ok: true as const, updatedAt };
    },
  }),
} satisfies ActionsModule;
