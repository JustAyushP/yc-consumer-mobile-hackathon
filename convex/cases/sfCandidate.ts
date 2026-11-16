import type { SeedCase } from "./velvetLantern";

export const SF_CONTENT_REVISION = "sf-market-street-candidate-1";

export const SF_CASE_CANDIDATE: SeedCase = {
  key: "velvet-lantern",
  title: "Last Call on Market Street",
  setting: "Downtown San Francisco, November 1947",
  victim: "Victor Marlowe",
  logline: "At 1:58 AM, Victor Marlowe is found dead in the fictional Velvet Lantern near Market Street. A broken cabinet and open cash drawer suggest robbery, but the sealed takings remain. The building lost power from 1:47 to 1:53.",
  culpritKey: "s_margot",
  suspects: [
    {
      id: "s_vivian", name: "Vivian Cross", title: "Headline singer, Victor's former lover",
      bio: "Vivian plans to leave the lounge for a new engagement. She shared a toast with Victor before her first set.",
      interrogation: "I used the lipstick glass at 8:55 PM, before the first set. Sal served us. I wanted to leave the contract, not hurt Victor.",
      profile: "She fears being blamed for leaving. Her grief and manner are not proof of innocence or guilt; compare her account with the old glass.",
      records: "Her departure letter predates the murder. The engagement ends her lounge contract; there is no murder-related financial windfall in these records.",
    },
    {
      id: "s_leo", name: "Leo Marlowe", title: "Victor's younger brother",
      bio: "Leo owes gambling debts and argued with Victor about a loan at 11:10 PM.",
      interrogation: "I was angry. Check the travel record when it is available instead of deciding what my temper means. I will not ask you to treat my word as independent proof.",
      profile: "Debt and humiliation explain the argument, not a murder. His opportunity must be tested against independent travel records.",
      records: "Gambling debts are real. Victor's will leaves the lounge to a trust, not Leo. Any travel claim requires the separately authorized taxi record.",
    },
    {
      id: "s_silas", name: "Dr. Silas Grey", title: "Physician and lounge regular",
      bio: "Silas was at the bar that night. His profession gives him medical knowledge, not automatic responsibility for a poisoned drink.",
      interrogation: "Sal saw me at the bar, though he cannot account for every second. I did not see what went into Victor's drink. Let the laboratory establish what it contained.",
      profile: "He is careful about confidential records. Reluctance is not a confession, and professional knowledge alone cannot identify a killer.",
      records: "A licensed physician with no relevant adverse finding. Any case-specific prescription provenance must come from the authorized pharmacy record, not speculation about his patients.",
    },
    {
      id: "s_margot", name: "Margot Kell", title: "The lounge's bookkeeper",
      bio: "Margot keeps the closing accounts and brings Victor his nightcap. She initially says she left at one.",
      interrogation: "I left at one. As for the office clock, do not turn a routine evening into an accusation. Ask for the records if you doubt me.",
      profile: "She is protective of the accounts and worried about exposure. A controlled voice is not evidence; the note, ledger and timed records must do the work.",
      records: "Lives with her mother, Edna Kell. Her occupation and initials can be checked without seeing the still-withheld contents of Ledger B.",
    },
  ],
  clues: [
    {
      id: "e_coroner", name: "Coroner's Note", kind: "Document",
      summary: "Victor was found at 1:58 AM. The preliminary report cannot distinguish a natural collapse from poisoning without the drink analysis.",
      detail: "The fictional coroner gives a broad collapse window, 1:35–1:55 AM, not an exact minute or a dosing calculation. Read this alongside the laboratory examination of the nightcap.",
      unlock: { day: 1 },
    },
    {
      id: "e_glass", name: "Bourbon Glass and Scene Examination", kind: "Physical",
      summary: "The fictional lab identifies digitalis in Victor's bourbon. Sal records the closing tray at 1:20, delivered by Margot without his seeing its contents. Cabinet fragments lie over the spill; the sealed cash is untouched.",
      detail: "The fictional lab identifies digitalis contamination in the bourbon. The cabinet glass fell after the spill, supporting a staged robbery, not identifying its author. Sal's service note records Margot delivering the closing tray at 1:20; he did not see its contents. The timing does not establish a medically precise onset interval.",
      unlock: { day: 1 },
    },
    {
      id: "e_lipstick", name: "Second Glass", kind: "Physical",
      summary: "A separate wine glass bears Vivian's lipstick. Its residue dried earlier in the evening.",
      detail: "Vivian and Sal independently place this glass at their 8:55 PM toast. It is not the later bourbon glass. This removes the lipstick as evidence of the fatal serving, not every imaginable suspicion of Vivian.",
      unlock: { day: 1 },
    },
    {
      id: "e_taxi", name: "Taxi Receipt", kind: "Document",
      summary: "Leo's receipt records a 12:41 AM pickup and arrival across town at 1:05 AM. The driver's signed waiting-fare log confirms Leo remained in the cab there continuously from 1:05 to 2:00.",
      detail: "The driver records Leo waiting in the rear seat outside a closed lender's office; the lender never arrived. This continuous observation, not the arrival time alone, places Leo away during the 1:20 closing tray and the blackout. It excludes his serving that drink or staging the room then, not hypothetical earlier schemes.",
      unlock: { day: 2 },
    },
    {
      id: "e_note", name: "Desk Note", kind: "Document",
      summary: "Victor wrote: 'M.K. — Ledger B. My office, 9 AM. No more lies.'",
      detail: "The note was written that night. Compare M.K. with the existing staff and suspect names. The initials and occupation identify whom Victor planned to meet; the note alone does not prove what Ledger B contains.",
      unlock: { day: 2 },
    },
    {
      id: "e_ledger", name: "Ledger B", kind: "Document",
      summary: "A second set of accounts records $18,200 diverted over two years.",
      detail: "The reconciled entries match Margot's bookkeeping and the missing receipts. Combined with Victor's note, this establishes a specific threat of exposure, rather than merely someone's debts or temperament.",
      unlock: { insight: "i_mk" },
    },
    {
      id: "e_prescription", name: "Pharmacy Record", kind: "Document",
      summary: "A case-authorized pharmacy record identifies Edna Kell's digitalis prescription and an early refill collected by her daughter Margot.",
      detail: "The signed collection record is the provenance route. Silas prescribed the medication but did not witness its misuse. Access to a medicine alone is not proof of murder; combine this record with the drink, accounts and timeline. No real dose or preparation method is supplied.",
      unlock: { insight: "i_poison" },
    },
    {
      id: "e_cloak", name: "Cloakroom Ticket #47 and Timing Annex", kind: "Document",
      summary: "Margot's coat was collected at 1:58 AM despite her claimed departure at one. She later claimed to read 1:50 on the lit office clock; inspection and independently timed maintenance records show the mains-only clock was stopped and dark from 1:47 to 1:53.",
      detail: "The coat log retains its 1:58 stamp. In a later signed account Margot instead says she read 1:50 on the lit office clock while signing accounts. The maintenance record, independently timed by a battery clock, and Sal's watch place the accidental outage at 1:47–1:53. Inspection confirms the office clock is mains-only and was dark and stopped. Her claimed observation is impossible; it is not proof that nobody could move in the dark.",
      unlock: { day: 3 },
    },
  ],
  insights: [
    {
      id: "i_poison", label: "The nightcap contained poison", weight: 15,
      keywords: [["poison", "digitalis", "toxic", "drugged"], ["bourbon", "drink", "nightcap"]],
      hint: "Compare the preliminary report with the examination of Victor's drink. What does the laboratory establish?",
    },
    {
      id: "i_lipstick", label: "The second glass belongs to an earlier toast", weight: 10,
      keywords: [["lipstick", "vivian", "second glass"], ["earlier", "old", "hours", "dried", "before her first set", "before the first set", "8:55", "20:55"]],
      hint: "Separate the two glasses. Does a mark tell you who used a glass, when they used it, or both?",
    },
    {
      id: "i_leo", label: "The taxi record excludes Leo from the closing serving", weight: 10,
      keywords: [["leo", "brother"], ["taxi", "cab"], ["12:41", "00:41", "before", "away", "across town"]],
      hint: "Put the journey record beside the closing-service time. Which act does that journey rule out?",
    },
    {
      id: "i_ledger", label: "The second accounts expose diverted receipts", weight: 20,
      keywords: [["ledger", "books", "accounts"], ["embezzl", "skim", "divert", "stolen", "steal", "second set"]],
      hint: "Read the reconciled accounts rather than guessing from the title. What differs from the official books?",
    },
    {
      id: "i_mk", label: "The desk-note initials identify the bookkeeper", weight: 15,
      keywords: [["margot"], ["m.k", "mk", "initial", "bookkeep"]],
      hint: "Read the initials beside the staff names and jobs. Identity is a separate deduction from what the accounts contain.",
    },
    {
      id: "i_source", label: "The collection record connects the medicine to Margot", weight: 15,
      keywords: [["margot", "daughter"], ["mother", "edna"], ["digitalis", "prescription", "refill"]],
      hint: "Distinguish the prescriber, the patient and the person who collected the refill. Which record connects them?",
    },
    {
      id: "i_timeline", label: "Margot's departure account conflicts with timed records", weight: 15,
      keywords: [["margot", "kell", "bookkeeper"], ["coat", "cloak", "clock"], ["1:58", "01:58", "didnt leave", "stayed", "still there", "stopped", "impossible"]],
      hint: "Compare the departure claim with the stamped record. For the later clock claim, ask whether that clock could display a time during the outage.",
    },
  ],
  days: [
    {
      day: 1, title: "The Room Went Dark",
      briefing: "The room suggests a robbery, but the sealed cash remains. Separate what happened to Victor from what happened to the room. Examine the drink and the two glasses.",
      questions: [
        { id: "d1q1", prompt: "What does the examination establish about Victor's nightcap?", reference: "Digitalis poisoned the bourbon; the laboratory, not a guessed medical symptom, establishes this.", insights: ["i_poison"] },
        { id: "d1q2", prompt: "Does the lipstick glass place Vivian at the fatal serving?", reference: "No. Vivian's lipstick glass is from the earlier 8:55 toast, not the later bourbon.", insights: ["i_lipstick"] },
      ],
    },
    {
      day: 2, title: "The Missing Minutes",
      briefing: "Compare travel with closing service, then read Victor's note. Identify whom he meant before inferring what the withheld accounts contain.",
      questions: [
        { id: "d2q1", prompt: "Could Leo have served the closing drink? Use the travel record.", reference: "Leo's taxi left at 12:41. The driver's continuous waiting-fare record places him across town through 2:00, covering the closing drink and blackout.", insights: ["i_leo"] },
        { id: "d2q2", prompt: "Who is M.K.? Once Ledger B is released, what do its entries establish?", reference: "M.K. identifies Margot the bookkeeper. Ledger B is a second set of accounts recording skimmed receipts.", insights: ["i_mk", "i_ledger"] },
      ],
    },
    {
      day: 3, title: "The Final Account",
      briefing: "Compare the available provenance and timed records. The coat log and a later clock claim are different statements; test each against its source.",
      questions: [
        { id: "d3q1", prompt: "What connects the poison source to someone at the lounge? Use the authorized collection record.", reference: "Margot collected her mother Edna's digitalis prescription refill. That establishes access, not guilt by itself.", insights: ["i_source"] },
        { id: "d3q2", prompt: "Whose departure account conflicts with the records? What can the later clock claim actually prove?", reference: "Margot's coat was collected at 1:58. Her later 1:50 clock observation is impossible because the mains-only clock stopped during the outage.", insights: ["i_timeline"] },
      ],
    },
    {
      day: 4, title: "Closing Time",
      briefing: "Connect the accounts, the drink and the timeline. State the limits of each inference before the team makes an accusation through messages.",
      questions: [
        { id: "d4q1", prompt: "Who fits the documented motive, access and opportunity? Explain the evidence, not a personality judgment.", reference: "Margot: Ledger B records skimmed money and Victor planned confrontation; she collected her mother Edna's digitalis prescription; the coat log at 1:58 contradicts departure at one. The tray and staging evidence support opportunity, not a pharmacological timing guess.", insights: ["i_ledger", "i_source", "i_timeline"] },
      ],
    },
  ],
  reveal: [
    "Margot Kell killed Victor Marlowe. He had discovered Ledger B and intended to confront her at nine the next morning about the diverted receipts.",
    "She contaminated his closing drink using medicine obtained through her mother's prescription. The fictional laboratory establishes the poison; this account supplies no dose, preparation or precise medical onset calculation.",
    "After Victor collapsed, the accidental blackout gave her cover to break the cabinet and open the drawer. Glass over the spill and untouched cash expose the staged robbery, but do not alone identify who staged it.",
    "Her coat at 1:58 contradicts departure at one. Her later claim to read a lit mains-only clock at 1:50 cannot survive the independently timed power failure. The ledger, collection record and service evidence complete the case.",
    "Vivian's glass belongs to an earlier toast. Leo's confirmed taxi journey excludes the closing serving and blackout staging. Silas's medical knowledge does not identify the person who misused the medicine. The evidence, not their personalities, resolves the alternatives.",
  ],
};
