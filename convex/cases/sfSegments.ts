import type { Infer } from "convex/values";
import { segmentDefinition } from "../game/integration/segmentModel";

const gate = (beats: string[] = [], insights: string[] = [], clues: string[] = []) => ({ beats, insights, clues, flags: {} });
const facts = (...keys: string[]) => keys.map((key) => `sf_report_${key}`);

export const SF_SEGMENTS: Infer<typeof segmentDefinition>[] = [
  { index: 1, accusationEligible: false, opening: "The drawer is open. The takings are still sealed. Start with what the room actually tells you.",
    high: "The room offers a robbery. The records ask a different question: what happened to the drink?", nextHook: "Compare the two glasses before deciding what either proves.",
    beatKeys: ["sf_arrival"], factKeys: facts("e_coroner", "e_glass"), questionKeys: ["d1q1"], abilityTargets: ["e_coroner", "e_glass", "s_silas"], entry: gate([], [], ["e_coroner"]), exit: gate(["sf_arrival"]) },
  { index: 2, accusationEligible: false, opening: "Two glasses stood in the same room. That does not put them in the same moment.",
    high: "The fragments fell after the spill. Someone wanted the room to tell its story in the wrong order.", nextHook: "An argument is easy to remember. A journey needs a record.",
    beatKeys: ["sf_scene_read"], factKeys: facts("e_coroner", "e_glass", "e_lipstick"), questionKeys: ["d1q1", "d1q2"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "s_silas", "s_vivian"], entry: gate(["sf_arrival"]), exit: gate(["sf_scene_read"]) },
  { index: 3, accusationEligible: false, opening: "An argument is easy to remember. A journey needs a record.",
    high: "The loudest quarrel has a journey attached to it. The quiet threat is still somewhere in the paperwork.", nextHook: "Read the note before deciding what its initials mean.",
    beatKeys: [], factKeys: facts("e_coroner", "e_glass", "e_lipstick", "e_taxi"), questionKeys: ["d1q1", "d1q2", "d2q1"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "e_taxi", "s_silas", "s_vivian", "s_leo"], entry: gate(["sf_scene_read"], [], ["e_taxi"]), exit: gate([], ["i_leo"], ["e_taxi"]) },
  { index: 4, accusationEligible: false, opening: "Two initials are an address, not a conviction.",
    high: "You know whom the note addressed. You do not yet know what its second set of books will say.", nextHook: "Compare the official accounts with the records when they are available.",
    beatKeys: [], factKeys: facts("e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note"), questionKeys: ["d1q1", "d1q2", "d2q1", "d2q2"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "s_silas", "s_vivian", "s_leo"], entry: gate([], ["i_leo"], ["e_note"]), exit: gate([], ["i_mk"], ["e_note"]) },
  { index: 5, accusationEligible: false, opening: "Now compare what the official accounts say with what the second set records.",
    high: "Morning would have brought a reckoning. The accounts explain why someone feared it; they do not yet explain the drink.", nextHook: "A record of access and a record of time answer different questions.",
    beatKeys: ["sf_accounts_read"], factKeys: facts("e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger"), questionKeys: ["d1q1", "d1q2", "d2q1", "d2q2"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger", "s_silas", "s_vivian", "s_leo"], entry: gate([], ["i_mk"], ["e_ledger"]), exit: gate(["sf_accounts_read"]) },
  { index: 6, accusationEligible: false, opening: "A record of access and a record of time answer different questions. Keep them separate until the evidence connects them.",
    high: "The clock could not show what the statement claims. The coat record still stands. Explain the whole sequence, not just one lie.", nextHook: "Bring the sources together and state what each leaves open.",
    beatKeys: ["sf_timeline_read"], factKeys: facts("e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger", "e_prescription", "e_cloak"), questionKeys: ["d1q1", "d1q2", "d2q1", "d2q2", "d3q1", "d3q2"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger", "e_prescription", "e_cloak", "s_silas", "s_vivian", "s_leo", "s_margot"], entry: gate(["sf_accounts_read"], [], ["e_prescription", "e_cloak"]), exit: gate(["sf_timeline_read"]) },
  { index: 7, accusationEligible: true, opening: "Bring the sources together. Name what each proves, and what each leaves open.",
    high: "The records are ready to compare. Explain the evidence and its limits before making an accusation.",
    beatKeys: ["sf_synthesis"], factKeys: facts("e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger", "e_prescription", "e_cloak"), questionKeys: ["d1q1", "d1q2", "d2q1", "d2q2", "d3q1", "d3q2", "d4q1"], abilityTargets: ["e_coroner", "e_glass", "e_lipstick", "e_taxi", "e_note", "e_ledger", "e_prescription", "e_cloak", "s_silas", "s_vivian", "s_leo", "s_margot"], entry: gate(["sf_timeline_read"]), exit: gate(["sf_synthesis"]) },
];
