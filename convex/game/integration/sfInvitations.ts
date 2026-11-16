const stages = [
  "the room and the available reports",
  "the two glasses and their sequence",
  "the argument and the available journey record",
  "the note and what its initials might mean",
  "the available accounts and the second set of records",
  "the available records of access and time",
  "the evidence together and the limits of each source",
] as const;

const lenses = {
  forensic: "Examine the physical evidence and distinguish observation from inference.",
  interrogator: "Compare the available statements and identify a question worth asking.",
  profiler: "Consider possible motives without treating suspicion as proof.",
  archivist: "Trace the available records and note what they do and do not establish.",
} as const;

export function sfInvitation(index: number, role: keyof typeof lenses, roleOrdinal: number) {
  const stage = stages[index - 1];
  if (!stage) throw new Error("Invalid SF segment");
  const comparison = roleOrdinal > 0
    ? "Independently check an alternative interpretation and offer it for comparison."
    : "Offer your observations for the team to compare when they are available.";
  return `Invitation: Consider ${stage}. ${lenses[role]} ${comparison}`;
}
