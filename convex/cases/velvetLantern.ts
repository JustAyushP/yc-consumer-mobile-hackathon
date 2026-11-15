// Seeded case content. Shape is the contract read by convex/cases/seed.ts; Builder 3 owns the content.

export type Suspect = {
  id: string;
  name: string;
  title: string;
  bio: string;
  interrogation: string;
  profile: string;
  records: string;
};

export type Clue = {
  id: string;
  name: string;
  kind: string;
  summary: string;
  detail: string;
  unlock: { day: number } | { insight: string };
};

export type Insight = {
  id: string;
  label: string;
  weight: number;
  keywords: string[][];
  hint: string;
};

export type Question = { id: string; prompt: string; reference: string; insights: string[] };

export type SeedCase = {
  key: string;
  title: string;
  setting: string;
  victim: string;
  logline: string;
  culpritKey: string;
  suspects: Suspect[];
  clues: Clue[];
  insights: Insight[];
  days: CaseDay[];
  reveal: string[];
};

export type CaseDay = { day: number; title: string; briefing: string; questions: Question[] };

export const VELVET_LANTERN: SeedCase = {
  key: "velvet-lantern",
  title: "Death at the Velvet Lantern",
  setting: "Chicago, November 1947",
  victim: "Victor Marlowe",
  logline:
    "Victor Marlowe, owner of the Velvet Lantern jazz club, was found dead at his desk at 2:10 AM. The coroner says heart failure. RAVO says the coroner is wrong.",
  culpritKey: "s_margot",
  suspects: [
    {
      id: "s_vivian",
      name: "Vivian Cross",
      title: "Headline singer, Victor's ex-lover",
      bio: "Sang the last set until 1:30. Left Victor for a trumpet player in the spring, and never stopped visiting his office.",
      interrogation:
        "\"Sure I had a drink with him. Nine o'clock, before my first set. We toasted to old times and I told him I was leaving for New York. After the last set I was in my dressing room with Sal until nearly two. Ask him.\"",
      profile:
        "Theatrical, but her grief is real. She talks about Victor in the present tense. She has nothing to gain from his death: her contract dies with him.",
      records: "No record. Contract with the Velvet Lantern ends on Victor's death. Booked for a New York residency in December.",
    },
    {
      id: "s_leo",
      name: "Leo Marlowe",
      title: "Victor's younger brother",
      bio: "Owes $4,000 to the Dellucci crew. Seen arguing with Victor at 11 PM: \"You'll get nothing from me.\"",
      interrogation:
        "\"Yeah, we fought. He wouldn't lend me a dime. I walked out at half past twelve and took a cab home. I didn't kill my brother. I needed him alive. Alive, he might have changed his mind.\"",
      profile:
        "Hot-headed, impulsive, ashamed. A man like Leo hits; he doesn't plan a quiet poisoning. And he's right: dead, Victor can't bail him out.",
      records: "Two arrests for illegal gambling. Gambling debts on the books of the Dellucci crew. Victor's will leaves the club to a trust, not to Leo.",
    },
    {
      id: "s_silas",
      name: "Dr. Silas Grey",
      title: "Physician and club regular",
      bio: "Drinks at the bar every Friday. Has a medical bag, and knows exactly what a heart drug can do.",
      interrogation:
        "\"Digitalis? Of course I prescribe it, half my patients have weak hearts. I was at the bar from ten until they found him. Ask Tommy, he poured every glass I had. I never set foot in that office.\"",
      profile:
        "Precise and nervous, the nerves of a man who knows he looks guilty, not one who is. He keeps glancing at the bartender for confirmation.",
      records:
        "Licensed physician, clean record. His prescription ledger shows digitalis for three patients this month, including Mrs. Edna Kell.",
    },
    {
      id: "s_margot",
      name: "Margot Kell",
      title: "The club's bookkeeper",
      bio: "Has kept Victor's books for nine years. Brings him his ledger and his nightly bourbon at closing. Says she went home at one.",
      interrogation:
        "\"I left at one o'clock, same as every Friday. Mother can't be alone after midnight. Victor was fine when I left. Tired, but fine.\" She smooths her gloves the whole time.",
      profile:
        "Controlled. Too controlled. She answers questions you haven't asked yet, and she never once says Victor's name with feeling. People who rehearse their alibis sound like this.",
      records:
        "Lives with her mother, Edna Kell, who has a heart condition. Margot's bank deposits jumped by $18,000 over two years on a bookkeeper's salary.",
    },
  ],
  clues: [
    {
      id: "e_coroner",
      name: "Coroner's Note",
      kind: "Document",
      summary: "Time of death between 1:45 and 2:05 AM. Preliminary cause: heart failure.",
      detail: "The lips are faintly blue and the pupils are oddly dilated. A healthy 46-year-old heart does not simply stop. Someone should test that bourbon.",
      unlock: { day: 1 },
    },
    {
      id: "e_glass",
      name: "Bourbon Glass",
      kind: "Physical",
      summary: "Victor's nightcap, half finished, on the desk beside the ledger tray.",
      detail: "Residue at the bottom: crushed tablet, with fragments of a pharmaceutical sugar coating. Digitalis, a prescription heart drug. Not plant foxglove: someone ground up pills.",
      unlock: { day: 1 },
    },
    {
      id: "e_lipstick",
      name: "Second Glass",
      kind: "Physical",
      summary: "A wine glass with a red lipstick print, on the side table.",
      detail: "The shade is 'Cherries in the Snow', Vivian's. The lipstick dried hours ago, and the wine residue has evaporated to a crust. This glass was used early in the evening, not near the time of death.",
      unlock: { day: 1 },
    },
    {
      id: "e_taxi",
      name: "Taxi Receipt",
      kind: "Document",
      summary: "Yellow Cab receipt from Leo Marlowe's coat: pickup outside the club, 12:41 AM.",
      detail: "The driver confirms the fare: Leo, drunk and cursing his brother, dropped in Bronzeville at 1:05 AM. He was across town when Victor drank.",
      unlock: { day: 2 },
    },
    {
      id: "e_note",
      name: "Desk Note",
      kind: "Document",
      summary: "In Victor's handwriting: \"M.K. — Ledger B. My office, 9 AM. No more lies.\"",
      detail: "Pressed hard enough to tear the paper. Written the night he died. Whoever M.K. is, Victor meant to confront them in the morning, and never got the chance.",
      unlock: { day: 2 },
    },
    {
      id: "e_ledger",
      name: "Ledger B",
      kind: "Document",
      summary: "A second set of books hidden behind the filing cabinet. $18,200 skimmed over two years.",
      detail: "Every entry is in the same neat hand as the club's official books. Only the club's bookkeeper could keep two sets of books this clean.",
      unlock: { insight: "i_mk" },
    },
    {
      id: "e_prescription",
      name: "Pharmacy Record",
      kind: "Document",
      summary: "Halsted Pharmacy: digitalis tablets filled on Dr. Grey's prescription for Mrs. Edna Kell, two days before the murder.",
      detail: "The refill was picked up early, and not by Mrs. Kell. The pharmacist remembers 'the daughter, the one with the gloves'.",
      unlock: { insight: "i_poison" },
    },
    {
      id: "e_cloak",
      name: "Cloakroom Ticket #47",
      kind: "Document",
      summary: "The coat check log: ticket #47, Margot Kell's grey wool coat, collected at 1:58 AM.",
      detail: "The coat girl remembers: Miss Kell was flushed and didn't wait for her change. 1:58 AM, right inside the window for the time of death.",
      unlock: { day: 3 },
    },
  ],
  insights: [
    {
      id: "i_poison",
      label: "Victor was poisoned with digitalis in his bourbon",
      weight: 15,
      keywords: [["poison", "digitalis", "drugged", "pills", "tablet", "foxglove", "toxic"]],
      hint: "Hearts like Victor's don't stop on their own. Look at what he was drinking, and ask the Forensic Analyst what's at the bottom of the glass.",
    },
    {
      id: "i_lipstick",
      label: "The lipstick glass is from earlier in the night, a red herring",
      weight: 10,
      keywords: [["lipstick", "vivian", "second glass"], ["earlier", "old", "hours", "before", "red herring", "nine", "innocent", "dried", "not her"]],
      hint: "Lipstick dries. Ask yourselves when that second glass was used, not just whose lips touched it.",
    },
    {
      id: "i_leo",
      label: "Leo left at 12:41 and couldn't have poured the drink",
      weight: 10,
      keywords: [["leo", "brother"], ["taxi", "cab", "12:41", "left", "alibi", "across town", "not him", "innocent"]],
      hint: "A man can't poison a drink from the back of a taxi. Check when Leo left and where he went.",
    },
    {
      id: "i_ledger",
      label: "Someone was embezzling: Ledger B is a second set of books",
      weight: 20,
      keywords: [["ledger", "books", "embezzl", "skim", "stealing", "steal", "money missing", "cooking"]],
      hint: "'Ledger B' isn't a typo. Clubs keep one set of books. Who would need a second?",
    },
    {
      id: "i_mk",
      label: "M.K. is Margot Kell, the bookkeeper",
      weight: 15,
      keywords: [["m.k", "mk", "margot", "kell", "bookkeeper"], ["margot", "kell", "bookkeeper", "initials"]],
      hint: "Initials on a desk note. Go down the list of suspects and read their names out loud.",
    },
    {
      id: "i_source",
      label: "The digitalis came from Margot's mother's prescription",
      weight: 15,
      keywords: [["mother", "edna", "prescription", "pharmacy", "refill"], ["margot", "kell", "daughter"]],
      hint: "Dr. Grey prescribes digitalis to three patients. One of them lives with a suspect.",
    },
    {
      id: "i_timeline",
      label: "Margot lied: her coat was collected at 1:58 AM",
      weight: 15,
      keywords: [["margot", "kell", "bookkeeper"], ["coat", "cloak", "1:58", "lied", "lying", "stayed", "didn't leave", "still there"]],
      hint: "Someone says they left at one. The coat check girl keeps better time than anyone in that club.",
    },
  ],
  days: [
    {
      day: 1,
      title: "The Body",
      briefing:
        "Victor Marlowe was found slumped over his desk at 2:10 AM. Four people had reason to be near him tonight. The coroner wants to call it natural causes and go home. Don't let him.",
      questions: [
        {
          id: "d1q1",
          prompt: "How did Victor Marlowe really die? Look past the coroner's first guess.",
          reference: "He was poisoned: a heart drug (digitalis) was put in his bourbon.",
          insights: ["i_poison"],
        },
        {
          id: "d1q2",
          prompt: "The second glass carries Vivian's lipstick. Does it put her in the office at the time of death? Why?",
          reference: "No. The lipstick and wine had dried for hours, so the glass is from earlier in the evening (her 9 PM toast). It's a red herring.",
          insights: ["i_lipstick"],
        },
      ],
    },
    {
      day: 2,
      title: "Family and Money",
      briefing:
        "A brother with debts. A note on the desk in Victor's own hand. Money is moving through this case like smoke through a jazz club. Follow it.",
      questions: [
        {
          id: "d2q1",
          prompt: "Leo argued with Victor about money at 11 PM. Could he have poured the fatal drink?",
          reference: "No. His taxi picked him up at 12:41 AM and he was across town before the 1:45 to 2:05 window.",
          insights: ["i_leo"],
        },
        {
          id: "d2q2",
          prompt: "Who is 'M.K.', and what is 'Ledger B'?",
          reference: "M.K. is Margot Kell, the bookkeeper. Ledger B is a secret second set of books she used to skim money.",
          insights: ["i_mk", "i_ledger"],
        },
      ],
    },
    {
      day: 3,
      title: "The Poison Trail",
      briefing:
        "Digitalis doesn't fall from the sky. Someone carried it into that office, and someone is lying about when they walked out.",
      questions: [
        {
          id: "d3q1",
          prompt: "Where did the poison come from?",
          reference: "From Margot's mother Edna Kell's digitalis prescription, refilled early and picked up by Margot.",
          insights: ["i_source"],
        },
        {
          id: "d3q2",
          prompt: "Whose account of the night doesn't hold up, and what proves it?",
          reference: "Margot's. She says she left at 1:00 but her coat was collected at 1:58 AM.",
          insights: ["i_timeline"],
        },
      ],
    },
    {
      day: 4,
      title: "Closing Time",
      briefing:
        "You have the motive, the means, and the clock. Put them in one sentence and say a name. When the team is sure, make the accusation.",
      questions: [
        {
          id: "d4q1",
          prompt: "Motive, means, opportunity. Who had all three?",
          reference: "Margot Kell: motive (Victor found Ledger B), means (her mother's digitalis), opportunity (she brought the nightcap and stayed until 1:58).",
          insights: ["i_ledger", "i_source", "i_timeline"],
        },
      ],
    },
  ],
  reveal: [
    "For nine years Margot Kell kept Victor Marlowe's books, and for two of them she kept a second set. Ledger B. Eighteen thousand two hundred dollars, skimmed a little at a time, enough to pay for her mother's doctors and then some.",
    "On Friday night Victor found it. He wrote her a note, M.K., Ledger B, my office, 9 AM, and he meant to finish her.",
    "Margot read the note when she brought him his ledger tray. Two days earlier she had picked up her mother's digitalis refill early. At 1:45 she poured Victor his nightly bourbon, the way she had a thousand times, and ground four tablets into it.",
    "She told everyone she left at one. But she waited to be sure, and the coat check girl stamped ticket #47 at 1:58 AM. Vivian's lipstick glass was hours old. Leo was in a taxi across town. Dr. Grey never left the bar.",
    "The Velvet Lantern is dark tonight. The detectives did their work. Case closed.",
  ],
};

