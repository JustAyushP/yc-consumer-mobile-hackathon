import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import { HINTS_PER_WEEK, WEEK_LENGTH } from "./catalog";

export async function loadPlayer(ctx: QueryCtx, playerId: Id<"players">) {
  const player = await ctx.db.get(playerId);
  if (!player) throw new Error("Unknown detective");
  const group = await ctx.db.get(player.groupId);
  if (!group) throw new Error("Unknown group");
  return { player, group };
}

/** Resolves the read-only app's viewer from the token in their texted link. Every public query goes through this. */
export async function requireViewer(ctx: QueryCtx, viewerToken: string) {
  const row = await ctx.db.query("viewerTokens").withIndex("by_token", (q) => q.eq("token", viewerToken)).first();
  if (!row || row.expiresAt < Date.now()) throw new Error("This link has expired. Text RAVO for a new one.");
  return await loadPlayer(ctx, row.playerId);
}

export async function groupPlayers(ctx: QueryCtx, groupId: Id<"groups">) {
  return await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
}

export function weekOf(day: number) {
  return Math.floor((Math.max(day, 1) - 1) / WEEK_LENGTH);
}

export async function hintsLeft(ctx: QueryCtx, group: Doc<"groups">) {
  const used = await ctx.db.query("hints").withIndex("by_group_week", (q) => q.eq("groupId", group._id).eq("week", weekOf(group.day))).collect();
  return HINTS_PER_WEEK - used.length;
}

export function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
