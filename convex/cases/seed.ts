import { internalMutation } from "../_generated/server";
import { VELVET_LANTERN } from "./velvetLantern";

// Idempotent: `npx convex run cases/seed:seed`. Re-seeding a case replaces its content rows.
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const c = VELVET_LANTERN;
    const existing = await ctx.db.query("cases").withIndex("by_key", (q) => q.eq("key", c.key)).first();
    if (existing?.contentRevision !== undefined) throw new Error("Refusing to overwrite a versioned case");
    const caseFields = { key: c.key, title: c.title, setting: c.setting, victim: c.victim, logline: c.logline, culpritKey: c.culpritKey, reveal: c.reveal };
    const caseId = existing ? existing._id : await ctx.db.insert("cases", caseFields);
    if (existing) {
      await ctx.db.patch(caseId, caseFields);
      for (const table of ["suspects", "clues", "insights"] as const) {
        for (const row of await ctx.db.query(table).withIndex("by_case", (q) => q.eq("caseId", caseId)).collect()) await ctx.db.delete(row._id);
      }
      for (const table of ["days", "questions"] as const) {
        for (const row of await ctx.db.query(table).withIndex("by_case_day", (q) => q.eq("caseId", caseId)).collect()) await ctx.db.delete(row._id);
      }
    }
    for (const s of c.suspects) {
      await ctx.db.insert("suspects", { caseId, key: s.id, name: s.name, title: s.title, bio: s.bio, interrogation: s.interrogation, profile: s.profile, records: s.records });
    }
    for (const e of c.clues) {
      await ctx.db.insert("clues", { caseId, key: e.id, name: e.name, kind: e.kind, summary: e.summary, detail: e.detail, unlock: e.unlock });
    }
    for (const i of c.insights) {
      await ctx.db.insert("insights", { caseId, key: i.id, label: i.label, weight: i.weight, keywords: i.keywords, hint: i.hint });
    }
    for (const d of c.days) {
      await ctx.db.insert("days", { caseId, day: d.day, title: d.title, briefing: d.briefing });
      for (const q of d.questions) {
        await ctx.db.insert("questions", { caseId, day: d.day, key: q.id, prompt: q.prompt, reference: q.reference, insightKeys: q.insights });
      }
    }
    return caseId;
  },
});
