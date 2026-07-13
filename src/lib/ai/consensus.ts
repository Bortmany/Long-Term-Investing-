// Pure math for turning the committee's six persona votes into one verdict.
// No I/O, no model calls — deterministic and unit-tested on its own so the
// AI never has to be asked to compute (or agree with) a score.
//
// Formula: start at 50. For each vote, voteSign is +1 for BUY, 0 for HOLD,
// -1 for SELL. Add voteSign * (vote.confidence / 6) to the running score for
// every vote — the /6 reflects the app's fixed 6-persona committee: 6
// unanimous BUY votes at confidence 100 exactly saturate to 100; 6 unanimous
// SELL votes at confidence 100 exactly bottom out at 0. The final result is
// clamped to [0, 100] defensively, in case this is ever called with a
// different-sized vote list.

export type PersonaVote = {
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
};

function voteSign(recommendation: PersonaVote["recommendation"]): -1 | 0 | 1 {
  if (recommendation === "BUY") return 1;
  if (recommendation === "SELL") return -1;
  return 0;
}

export function computeConsensusScore(votes: PersonaVote[]): number {
  let score = 50;
  for (const vote of votes) {
    score += voteSign(vote.recommendation) * (vote.confidence / 6);
  }
  return Math.min(100, Math.max(0, score));
}

/** Score <= 34 -> SELL, score >= 65 -> BUY, otherwise (35-64 inclusive) -> HOLD. */
export function verdictForConsensusScore(score: number): "BUY" | "HOLD" | "SELL" {
  if (score <= 34) return "SELL";
  if (score >= 65) return "BUY";
  return "HOLD";
}
