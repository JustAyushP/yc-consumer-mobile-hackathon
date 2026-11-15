import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { ROLES } from "./catalog";
import { groupPlayers, hintsLeft, requireViewer } from "./lib";

// The read-only app's API. Every public function in the backend lives here, and each one is scoped by viewerToken.

const NARRATION = ["day", "clue", "intro", "hint", "warning", "reveal"] as const;

/** Mints the personal link token Comms texts to a player. The app reads it from a deep link or ?t= on web. */
export const mintToken = internalMutation({
  args: { playerId: v.id("players"), ttlHours: v.optional(v.number()) },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { playerId, ttlHours }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Unknown detective");
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const expiresAt = Date.now() + (ttlHours ?? 24 * 14) * 3600 * 1000;
    await ctx.db.insert("viewerTokens", { token, playerId, groupId: player.groupId, expiresAt });
    return { token, expiresAt };
  },
});

/** Role card: who you are, your role, its skills and ability. */
export const me = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    return {
      name: player.name,
      lateJoiner: player.lateJoiner,
      role: player.roleKey ? { ...ROLES[player.roleKey], blurb: player.roleBlurb ?? null } : null,
      group: { name: group.name, joinCode: group.joinCode, status: group.status, day: group.day, progress: group.progress },
    };
  },
});

/** Case file: the case header and the suspects. */
export const caseFile = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    const kase = (await ctx.db.get(group.caseId))!;
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    return {
      title: kase.title,
      setting: kase.setting,
      victim: kase.victim,
      logline: kase.logline,
      suspects: suspects.map((s) => ({ key: s.key, name: s.name, title: s.title, bio: s.bio })),
    };
  },
});

/** Evidence board: unlocked clues, the team's deductions, and the viewer's own ability results. */
export const board = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const found = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const sessions = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", player._id)).collect();
    return {
      clues: unlocks.map((u) => {
        const c = clues.find((x) => x.key === u.clueKey)!;
        return { key: c.key, name: c.name, kind: c.kind, summary: c.summary, day: u.day };
      }),
      deductions: found.map((f) => ({ key: f.insightKey, label: insights.find((i) => i.key === f.insightKey)?.label ?? f.insightKey, day: f.day })),
      myFindings: sessions.filter((s) => s.abilityResult).map((s) => ({ day: s.day, target: s.abilityTarget!, result: s.abilityResult! })),
    };
  },
});

/** The story so far: RAVO's narration for the group (day intros, clue drops, intros, hints, warnings, reveal). Never player chat. */
export const story = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    const rows = await ctx.db.query("messages").withIndex("by_group", (q) => q.eq("groupId", group._id)).order("desc").take(300);
    return rows
      .filter((m) => (NARRATION as readonly string[]).includes(m.kind) && !m.agentKey)
      .reverse()
      .map((m) => ({ _id: m._id, kind: m.kind, body: m.body, at: m._creationTime }));
  },
});

/** Team progress and pace: the progress score, hints left, and each detective's role, status today, and marks. */
export const team = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    const players = await groupPlayers(ctx, group._id);
    const warnings = await ctx.db.query("warnings").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const today = await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", group._id).eq("day", group.day)).collect();
    return {
      day: group.day,
      progress: group.progress,
      hintsLeft: await hintsLeft(ctx, group),
      detectives: players.map((p) => ({
        name: p.name,
        roleTitle: p.roleKey ? ROLES[p.roleKey].title : null,
        lateJoiner: p.lateJoiner,
        doneToday: today.some((s) => s.playerId === p._id && s.completed),
        lagging: warnings.some((w) => w.playerId === p._id && w.kind === "lagging" && w.day === group.day),
        missedDays: warnings.filter((w) => w.playerId === p._id && w.kind === "missed").map((w) => w.day),
      })),
    };
  },
});

/** The day timeline: every case day with its title, and whether it is past, today, or ahead. */
export const timeline = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    const days = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect();
    return days.map((d) => ({
      day: d.day,
      title: d.day <= group.day ? d.title : null,
      state: d.day < group.day ? ("past" as const) : d.day === group.day ? ("today" as const) : ("ahead" as const),
    }));
  },
});

/** The full story, once the case is solved. */
export const reveal = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    if (group.status !== "solved") return null;
    const kase = (await ctx.db.get(group.caseId))!;
    const culprit = (await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((s) => s.key === kase.culpritKey);
    const solver = group.solvedBy ? await ctx.db.get(group.solvedBy) : null;
    return { culprit: culprit?.name ?? kase.culpritKey, story: kase.reveal, solvedBy: solver?.name ?? null, solvedDay: group.solvedDay ?? null };
  },
});
