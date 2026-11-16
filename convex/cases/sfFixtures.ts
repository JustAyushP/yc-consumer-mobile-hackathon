export const SF_INSIGHT_FIXTURES = [
  { insight: "i_poison", positive: "The bourbon was poisoned with digitalis.", negative: "A poison was mentioned, but I have no evidence about a serving." },
  { insight: "i_lipstick", positive: "Vivian's lipstick glass was dried from the earlier toast.", negative: "Vivian used a glass." },
  { insight: "i_leo", positive: "Leo's taxi took him across town; the waiting-fare record keeps him there through 2:00, before and during closing service.", negative: "Leo was angry and needed money." },
  { insight: "i_ledger", positive: "Ledger B records embezzlement and skimmed receipts.", negative: "There is a ledger on the desk." },
  { insight: "i_mk", positive: "M.K. means Margot, the bookkeeper.", negative: "Margot" },
  { insight: "i_source", positive: "Margot collected her mother Edna's digitalis prescription.", negative: "Silas has knowledge of prescription medicine." },
  { insight: "i_timeline", positive: "Margot's coat was collected at 1:58, so she stayed.", negative: "Margot had a coat." },
] as const;

export const SF_QUESTION_NEGATIVES: Record<string, string> = {
  d1q1: "An unhappy customer seems suspicious.",
  d1q2: "Vivian used a glass.",
  d2q1: "Leo was angry and needed money.",
  d2q2: "Margot",
  d3q1: "Doctors know about medicine.",
  d3q2: "Margot had a coat.",
  d4q1: "Margot looks guilty to me.",
};

export const SF_BASELINE_DEFECTS = [
  { text: "Margot", insight: "i_mk", baselineMatches: true, candidateMatches: false, diagnosis: "Both legacy AND groups contain Margot; a bare name earns an identity deduction and opens Ledger B." },
  { text: "Margot didn't leave; compare the clock.", insight: "i_timeline", baselineMatches: false, candidateMatches: true, diagnosis: "Answer normalization removes apostrophes, but legacy keyword didn't leave retains one. Candidate uses didnt leave plus an evidence group." },
] as const;
