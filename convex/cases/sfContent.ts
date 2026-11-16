import type { RoleKey } from "../game/catalog";
import type { Infer } from "convex/values";
import type { graph } from "../game/story/model";
import type { CharacterContent } from "../ravo/characters/lifecycle";
import type { CastPlan } from "../ravo/director/casting";
import type { CharacterContextInput } from "../ravo/director/context";
import type { reviewedContentForCase } from "../ravo/director/content";
import type { Beat } from "../ravo/director/story";
import { SF_CASE_CANDIDATE, SF_CONTENT_REVISION } from "./sfCandidate";

export const SF_PUBLIC_FACTS = [
  "All people and the Velvet Lantern are fictional. The setting is downtown San Francisco in November 1947.",
  "Victor Marlowe was found at 1:58 AM beside a broken cabinet and open drawer; the sealed takings remained.",
  "An accidental building power failure lasted from 1:47 to 1:53 AM. Discovery time is not an exact time of death.",
  "Detectives investigate through private messages. The companion only displays authorized case material.",
] as const;

export const SF_DETECTIVE_EXAMPLES = [
  { name: "Maya Chen", role: "forensic" },
  { name: "Elias Reed", role: "interrogator" },
  { name: "Nora Shah", role: "profiler" },
] as const satisfies readonly { name: string; role: RoleKey }[];

export const SF_CAST_PLAN = {
  forensic: { "2": ["s_silas", "s_vivian"], "3": ["s_margot", "s_leo"] },
  interrogator: { "2": ["s_leo", "s_margot"], "3": ["s_vivian", "s_silas"] },
  profiler: { "2": ["s_margot", "s_vivian"], "3": ["s_leo", "s_silas"] },
  archivist: { "2": ["s_margot", "s_silas"], "3": ["s_leo", "s_vivian"] },
} as const satisfies CastPlan;

const entries = [
  {
    agentKey: "common", name: "Sal, the night bartender",
    publicIdentity: `You are Sal, bartender at the fictional Velvet Lantern. You witnessed service and the outage, not the murder. You may relay authorized case reports as reports, never as your own eyewitness knowledge. Public cast: ${SF_CASE_CANDIDATE.suspects.map((suspect) => `${suspect.name}, ${suspect.title}`).join("; ")}.`,
    publicVoice: "Brief, observant, dryly kind. Distinguish what you saw from what a permitted record says. Never invent missing evidence or guess a culprit.",
    clueKeys: SF_CASE_CANDIDATE.clues.map((clue) => clue.id),
  },
  {
    agentKey: "s_vivian", name: "Vivian Cross",
    publicIdentity: "You are Vivian Cross, the lounge's headline singer. You are planning a new engagement. You know your own early toast, not what entered the closing drink.",
    publicVoice: "Expressive but precise about the limits of memory. Private feelings are not evidence. Do not infer guilt from a name or a question.",
    clueKeys: ["e_lipstick"],
  },
  {
    agentKey: "s_leo", name: "Leo Marlowe",
    publicIdentity: "You are Leo Marlowe, Victor's brother. You argued about a loan. You can discuss your own movements when the trip record is authorized, not events after you left.",
    publicVoice: "Defensive without threatening the detective. Admit embarrassment, but anchor times to the authorized record rather than inventing an alibi.",
    clueKeys: ["e_taxi"],
  },
  {
    agentKey: "s_silas", name: "Dr. Silas Grey",
    publicIdentity: "You are Dr. Silas Grey, physician and lounge regular. Medical expertise is not eyewitness knowledge. Discuss only case-authorized reports, without inventing patient information.",
    publicVoice: "Measured and careful. No dosing or preparation advice, no exact physiological timing claims, and no accusation based solely on medicine access.",
    clueKeys: ["e_coroner", "e_glass", "e_prescription"],
  },
  {
    agentKey: "s_margot", name: "Margot Kell",
    publicIdentity: "You are Margot Kell, the lounge's bookkeeper. Discuss the authorized accounts and statements without supplying unprovided facts. Do not volunteer a solution or invent an explanation for a contradiction.",
    publicVoice: "Formal and economical. Acknowledge what a permitted document says; only an engine-authorized solved-result response may contain the final reveal.",
    clueKeys: ["e_note", "e_ledger", "e_cloak"],
  },
] satisfies (Pick<CharacterContextInput, "publicIdentity" | "publicVoice"> & {
  agentKey: string; name: string; clueKeys: string[];
})[];

export const SF_BEATS: (Omit<Beat, "effects"> & { minDay: number; effects: { kind: "flag"; key: string; value: boolean }[] })[] = [
  { key: "sf_arrival", act: 1, minDay: 1, requiredClues: ["e_coroner"], effects: [{ kind: "flag", key: "sf_arrived", value: true }] },
  { key: "sf_scene_read", act: 1, minDay: 1, requiredFlags: { sf_arrived: true }, requiredClues: ["e_glass", "e_lipstick"], requiredInsights: ["i_poison", "i_lipstick"], effects: [{ kind: "flag", key: "sf_scene_read", value: true }] },
  { key: "sf_accounts_read", act: 2, minDay: 2, requiredFlags: { sf_scene_read: true }, requiredClues: ["e_note", "e_ledger", "e_taxi"], requiredInsights: ["i_mk", "i_ledger", "i_leo"], effects: [{ kind: "flag", key: "sf_accounts_read", value: true }] },
  { key: "sf_timeline_read", act: 3, minDay: 3, requiredFlags: { sf_accounts_read: true }, requiredClues: ["e_prescription", "e_cloak"], requiredInsights: ["i_source", "i_timeline"], effects: [{ kind: "flag", key: "sf_timeline_read", value: true }] },
  { key: "sf_synthesis", act: 3, minDay: 4, requiredFlags: { sf_timeline_read: true }, requiredInsights: ["i_ledger", "i_source", "i_timeline"], effects: [{ kind: "flag", key: "sf_synthesis_ready", value: true }] },
];

export const SF_REVIEWED_CONTENT_CANDIDATE = {
  beats: SF_BEATS,
  characters: Object.fromEntries(entries.map(({ agentKey, publicIdentity, publicVoice, clueKeys }) => [agentKey, { publicIdentity, publicVoice, clueKeys }])),
  insightLabels: Object.fromEntries(SF_CASE_CANDIDATE.insights.map(({ id, label }) => [id, label])),
} satisfies ReturnType<typeof reviewedContentForCase>;

export const SF_REVIEWED_HINTS = SF_CASE_CANDIDATE.insights.map(({ id, hint }) => ({
  caseKey: SF_CASE_CANDIDATE.key, insightKey: id, body: hint,
}));

export const SF_STORY_GRAPH_CANDIDATE = {
  caseKey: SF_CASE_CANDIDATE.key,
  routes: [],
  beats: SF_BEATS.map((beat, index) => ({
    ...beat,
    requiredBeats: index === 0 ? [] : [SF_BEATS[index - 1].key],
    requiredInsights: [...(beat.requiredInsights ?? [])],
    requiredClues: [...(beat.requiredClues ?? [])],
    requiredFlags: { ...beat.requiredFlags },
  })),
  decisions: [],
} satisfies Infer<typeof graph>;

export const SF_CHARACTER_CONTENT_CANDIDATE = {
  caseKey: SF_CASE_CANDIDATE.key,
  revision: SF_CONTENT_REVISION,
  common: {
    ...entries[0],
    entry: { minAct: 1, minDay: 1, insights: [], clues: [], flags: {} },
    factKeys: entries[0].clueKeys.map((key) => `sf_report_${key}`),
  },
  characters: entries.slice(1).map((sheet) => ({
    ...sheet,
    entry: { minAct: 1, minDay: 1, insights: [], clues: [], flags: {} },
    factKeys: sheet.clueKeys.map((key) => `sf_report_${key}`),
  })),
  castPlan: SF_CAST_PLAN,
  facts: SF_CASE_CANDIDATE.clues.map((clue) => ({
    key: `sf_report_${clue.id}`,
    text: `Authorized case report — ${clue.name}: ${clue.summary}`,
    audience: "group" as const,
    clueKey: clue.id,
    requirements: {
      minAct: 1,
      minDay: "day" in clue.unlock ? clue.unlock.day : 1,
      insights: "insight" in clue.unlock ? [clue.unlock.insight] : [],
      clues: [clue.id],
      flags: {},
    },
  })),
} satisfies CharacterContent;

export const SF_BEAT_TEMPLATES = {
  sf_arrival: "The city has gone quiet. The room has not. Start with what was disturbed, then ask what each record can actually establish.",
  sf_scene_read: "The drink and the old glass tell different stories. The cabinet fragments came after the spill; that establishes sequence, not the hand that broke it.",
  sf_accounts_read: "A quarrel and a threatened exposure are different motives. Keep the journey record beside the accounts; neither is a substitute for the other.",
  sf_timeline_read: "A precise time is useful only if the clock could show it. Compare the impossible observation with the coat record and the provenance already in the file.",
  sf_synthesis: "The records are ready to compare. Explain what each establishes and what it cannot establish alone before making an accusation.",
} satisfies Record<(typeof SF_BEATS)[number]["key"], string>;

export const SF_SAFE_LEADS = [
  { topic: "Compare the two glasses", clueKeys: ["e_glass", "e_lipstick"] },
  { topic: "Check the journey record", clueKeys: ["e_taxi"] },
  { topic: "Identify the note's addressee", clueKeys: ["e_note"] },
  { topic: "Reconcile the accounts", clueKeys: ["e_ledger"] },
  { topic: "Trace the authorized collection record", clueKeys: ["e_prescription"] },
  { topic: "Compare the timed statements", clueKeys: ["e_cloak"] },
] as const;

export const SF_CLUE_CRITICALITY = [
  { clueKey: "e_coroner", purpose: "Bound uncertainty; no symptom-based or exact-minute inference", scoredInsights: [], alternateRoute: "Sal relays the authorized report" },
  { clueKey: "e_glass", purpose: "Poison, closing service and non-scored staging sequence", scoredInsights: ["i_poison"], alternateRoute: "Sal relays the authorized lab/scene report; forensic ability adds detail" },
  { clueKey: "e_lipstick", purpose: "Separate early toast from fatal serving", scoredInsights: ["i_lipstick"], alternateRoute: "Sal relays the glass report; Vivian supplies her permitted account" },
  { clueKey: "e_taxi", purpose: "Exclude Leo's closing serving and blackout staging", scoredInsights: ["i_leo"], alternateRoute: "Sal relays the signed record; Leo discusses it" },
  { clueKey: "e_note", purpose: "Identify M.K. before releasing Ledger B", scoredInsights: ["i_mk"], alternateRoute: "Sal relays the note and existing public cast names" },
  { clueKey: "e_ledger", purpose: "Document financial motive after identity gate", scoredInsights: ["i_ledger"], alternateRoute: "Sal relays reconciled accounts; no rapport gate" },
  { clueKey: "e_prescription", purpose: "Document access after poison gate, not guilt alone", scoredInsights: ["i_source"], alternateRoute: "Sal relays the authorized record; Silas discusses its limits" },
  { clueKey: "e_cloak", purpose: "Contradict departure and later clock observation on Day 3", scoredInsights: ["i_timeline"], alternateRoute: "Sal relays coat log and timing annex; no private witness required" },
] as const;

export const SF_AUTHOR_ONLY_KNOWLEDGE = {
  common: "Sal knows service times, the early toast, the outage and discovery. He did not see dosing or staging and does not independently know the killer. Reports are attributed, not personal memory.",
  s_vivian: "Vivian conceals a planned departure, not a murder. Her letter is flavor only, not a new clue or unlock dependency.",
  s_leo: "Leo conceals humiliating debts. Confirmed travel excludes two specific acts, not every conceivable conspiracy.",
  s_silas: "Silas knows prescription practice but not misuse. Only the authorized case record may identify the patient and collector.",
  s_margot: "Margot knows she killed Victor and staged the robbery. Never inject that truth into a live active-case character prompt. Her confession belongs only in the authenticated solved-result flow.",
};

export const SF_SOLVED_TEMPLATE = SF_CASE_CANDIDATE.reveal.join("\n\n");
