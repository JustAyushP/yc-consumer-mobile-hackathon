import type { RoleKey } from "../../game/catalog";

export type Character = { agentKey: string; name: string };
export type CastPlan = Partial<Record<RoleKey, { "2"?: readonly string[]; "3"?: readonly string[] }>>;

export function planCast(input: {
  lineId: "1" | "2" | "3";
  role: RoleKey;
  roleOrdinal: number;
  commonCharacter: Character;
  characters: readonly Character[];
  castPlan: CastPlan;
}): Character | undefined {
  if (input.lineId !== "1" && input.lineId !== "2" && input.lineId !== "3") throw new Error("Invalid line");
  if (input.lineId === "1") return { agentKey: input.commonCharacter.agentKey, name: input.commonCharacter.name };
  if (!Number.isSafeInteger(input.roleOrdinal) || input.roleOrdinal < 0) throw new Error("Invalid role ordinal");
  const options = input.castPlan[input.role]?.[input.lineId];
  if (!options?.length) return undefined;
  const key = options[input.roleOrdinal % options.length];
  const character = input.characters.find((candidate) => candidate.agentKey === key);
  return character ? { agentKey: character.agentKey, name: character.name } : undefined;
}
