import type { RavoDirective } from "../types";
import type { Character } from "./casting";

export type RecipientFact = {
  text: string;
  audience: "group" | "player";
  playerId?: string;
  unlocked: boolean;
};

export type CharacterContextInput = {
  recipientId: string;
  character: Character;
  publicIdentity: string;
  publicVoice: string;
  facts: readonly RecipientFact[];
};

export function buildCharacterContext(input: CharacterContextInput): string {
  const facts = input.facts.filter((fact) => fact.unlocked
    && (fact.audience === "group" || (fact.audience === "player" && fact.playerId === input.recipientId)));
  return [
    `Play ${input.character.name} (${input.character.agentKey}).`,
    input.publicIdentity,
    input.publicVoice,
    "Stay in character. Do not invent facts or reveal information not supplied for this recipient.",
    ...(facts.length ? ["Permitted knowledge:", ...facts.map((fact) => `- ${fact.text}`)] : []),
  ].join("\n");
}

export type PublicTeamEvent =
  | { kind: "talkedTo"; playerId: string; characterKey: string }
  | { kind: "creditedInsight"; insightKey: string }
  | { kind: "decision"; decisionKey: string };

export type PublicTeamCatalog = {
  playerNames: Readonly<Record<string, string>>;
  characterNames: Readonly<Record<string, string>>;
  creditedInsightLabels: Readonly<Record<string, string>>;
  decisionLabels: Readonly<Record<string, string>>;
};

function allowedValue(values: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) && typeof values[key] === "string" ? values[key] : undefined;
}

export function buildCrossPlayerContext(
  lineId: "1" | "2" | "3",
  recipientId: string,
  events: readonly PublicTeamEvent[],
  catalog: PublicTeamCatalog,
): string | undefined {
  if (lineId !== "1") return undefined;
  const lines: string[] = [];
  for (const event of events) {
    if (event.kind === "talkedTo") {
      const player = allowedValue(catalog.playerNames, event.playerId);
      const character = allowedValue(catalog.characterNames, event.characterKey);
      if (event.playerId !== recipientId && player && character) lines.push(`${player} spoke with ${character}.`);
    } else if (event.kind === "creditedInsight") {
      const label = allowedValue(catalog.creditedInsightLabels, event.insightKey);
      if (label) lines.push(`The team established: ${label}.`);
    } else if (event.kind === "decision") {
      const label = allowedValue(catalog.decisionLabels, event.decisionKey);
      if (label) lines.push(`The team decided: ${label}.`);
    }
    if (lines.length === 2) break;
  }
  return lines.length ? lines.join(" ") : undefined;
}

export function buildScriptedDirective(input: {
  lineId: "1" | "2" | "3";
  context: CharacterContextInput;
  teamEvents: readonly PublicTeamEvent[];
  publicTeamCatalog: PublicTeamCatalog;
}): RavoDirective {
  const crossPlayer = buildCrossPlayerContext(input.lineId, input.context.recipientId, input.teamEvents, input.publicTeamCatalog);
  return {
    character: { agentKey: input.context.character.agentKey, name: input.context.character.name },
    guidance: `${buildCharacterContext(input.context)}\nNudge the detective toward available evidence without giving anything away.`,
    tone: "noir",
    endTurn: false,
    ...(crossPlayer ? { crossPlayer } : {}),
  };
}
