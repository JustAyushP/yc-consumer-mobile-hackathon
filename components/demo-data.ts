export const demoCase = {
  title: "Last Call on Market Street",
  setting: "Downtown San Francisco · November 1947",
  premise: "At 1:58 AM, lounge owner Victor Marlowe is found dead beside an open cash drawer. A broken cabinet suggests a robbery. But the money is still there, and six minutes of darkness have left everyone with a different version of the night.",
  day: 1,
  days: 3,
  progress: 25,
  hintsRemaining: 2,
  hint: "Separate what happened to Victor from what happened to the room. Which disturbance came first?",
  detectives: [
    { name: "Maya Chen", role: "Forensic analyst", initials: "MC", specialty: "Read the physical sequence", pace: "Completed today", description: "Separate the cause of death from the staged scene." },
    { name: "Elias Reed", role: "Interrogation specialist", initials: "ER", specialty: "Reconstruct the missing minutes", pace: "Session in progress", description: "Compare witnesses' accounts of the blackout." },
    { name: "Nora Shah", role: "Profiler", initials: "NS", specialty: "Find the motive behind the story", pace: "Session ready", description: "Trace what each suspect stands to lose." },
  ],
  evidence: [
    { name: "The untouched envelope", kind: "Scene note", summary: "The cash drawer is open, but the night's takings remain in a sealed envelope." },
    { name: "Six minutes of darkness", kind: "Building notice", summary: "The lounge lost power from 1:47 to 1:53 AM. A battery-backed maintenance record preserves the interval." },
  ],
  suspects: [
    { name: "Vivian Cross", title: "The headline singer", bio: "Her final set ended before the blackout. She was planning to leave the lounge for a new engagement." },
    { name: "Leo Marlowe", title: "The owner's brother", bio: "He needed money. Several guests heard him arguing with Victor before midnight." },
    { name: "Dr. Silas Grey", title: "The club regular", bio: "A physician with a leather medical bag and a seat reserved at the bar." },
    { name: "Margot Kell", title: "The bookkeeper", bio: "She knows the lounge's routines better than anyone and prepared the closing accounts." },
  ],
  finding: "Cabinet fragments rest on top of the dried drink spill. The glass was broken after the drink fell, not during the struggle the room seems to suggest.",
} as const;
