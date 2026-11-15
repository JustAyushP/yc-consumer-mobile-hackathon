// Role catalog, survey, and game constants. Owned by the game lane (Builder 1).

export type RoleKey = "forensic" | "interrogator" | "profiler" | "archivist";

export type Role = {
  key: RoleKey;
  title: string;
  tagline: string;
  skills: string[];
  ability: { name: string; description: string; target: "clue" | "suspect" };
  glyph: string;
};

export const ROLES: Record<RoleKey, Role> = {
  forensic: {
    key: "forensic",
    title: "Forensic Analyst",
    tagline: "The dead talk. You just listen closer than anyone else.",
    skills: ["Trace evidence", "Toxicology", "Scene reconstruction"],
    ability: {
      name: "Deep Examination",
      description: "Once per day, put one piece of evidence under the lamp and learn what it is hiding.",
      target: "clue",
    },
    glyph: "◎",
  },
  interrogator: {
    key: "interrogator",
    title: "Interrogator",
    tagline: "Everyone lies. You know which lie matters.",
    skills: ["Pressure", "Rapport", "Catching contradictions"],
    ability: {
      name: "Hard Questioning",
      description: "Once per day, sit one suspect down under the bulb and get a statement.",
      target: "suspect",
    },
    glyph: "◈",
  },
  profiler: {
    key: "profiler",
    title: "Profiler",
    tagline: "You read people the way others read headlines.",
    skills: ["Behavioral analysis", "Motive mapping", "Tells and habits"],
    ability: {
      name: "Psych Read",
      description: "Once per day, get a psychological read on one suspect.",
      target: "suspect",
    },
    glyph: "◐",
  },
  archivist: {
    key: "archivist",
    title: "Archivist",
    tagline: "Paper never forgets. Neither do you.",
    skills: ["Records", "Paper trails", "Cross-referencing"],
    ability: {
      name: "Records Pull",
      description: "Once per day, pull every file the city has on one suspect.",
      target: "suspect",
    },
    glyph: "▤",
  },
};

export const CORE_ROLES: RoleKey[] = ["forensic", "interrogator", "profiler"];

export type SurveyQuestion = {
  id: string;
  prompt: string;
  options: { label: string; weights: Partial<Record<RoleKey, number>> }[];
};

export const SURVEY: SurveyQuestion[] = [
  {
    id: "first_look",
    prompt: "A body on the office floor. What do you look at first?",
    options: [
      { label: "The glass on the desk, the stains, the details", weights: { forensic: 3 } },
      { label: "The people standing in the doorway", weights: { interrogator: 3 } },
      { label: "Who would want this man dead", weights: { profiler: 3 } },
      { label: "The papers he was reading", weights: { archivist: 3 } },
    ],
  },
  {
    id: "friends_say",
    prompt: "Your friends say you're the one who…",
    options: [
      { label: "Notices the thing nobody else saw", weights: { forensic: 2, archivist: 1 } },
      { label: "Can get anyone to spill", weights: { interrogator: 3 } },
      { label: "Knows what you're feeling before you do", weights: { profiler: 3 } },
      { label: "Remembers every date and receipt", weights: { archivist: 3 } },
    ],
  },
  {
    id: "tool",
    prompt: "Pick one tool to take into the dark.",
    options: [
      { label: "A magnifying lens", weights: { forensic: 3 } },
      { label: "A hot cup of coffee for the suspect", weights: { interrogator: 2, profiler: 1 } },
      { label: "A notebook full of faces", weights: { profiler: 3 } },
      { label: "A key to the records room", weights: { archivist: 3 } },
    ],
  },
  {
    id: "pressure",
    prompt: "The clock is running. Under pressure you…",
    options: [
      { label: "Slow down and check everything twice", weights: { forensic: 2, archivist: 1 } },
      { label: "Push harder until something cracks", weights: { interrogator: 3 } },
      { label: "Go quiet and watch", weights: { profiler: 2, forensic: 1 } },
      { label: "Dig until the facts line up", weights: { archivist: 2, forensic: 1 } },
    ],
  },
];

export const WEEK_LENGTH = 7;
export const HINTS_PER_WEEK = 3;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
