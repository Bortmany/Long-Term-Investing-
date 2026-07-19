// PURE consensus math for the Investment Committee (BUILD-PLAN.md Phase 5).
// No I/O, no AI calls, no randomness — the consensus number is always
// computed HERE from the six personas' own votes, never asked of the model
// (the synthesis call only ever explains the number this function already
// produced; it can't move it).
//
// PLAIN-ENGLISH INTERPRETATION OF THE FORMULA:
// Start neutral, at 50 (the exact middle of the 0-100 scale). Each of the
// committee's votes then nudges the score toward BUY (up) or SELL (down) —
// a HOLD vote nudges it nowhere. How far a single vote can nudge the score
// depends on two things: how many voters there are (so N confident,
// unanimous votes together can just barely walk the score from 50 all the
// way to an extreme of 0 or 100, never further) and how CONFIDENT that
// particular voter was (a vote made at 0% confidence contributes nothing at
// all; a vote at 100% confidence contributes its full share). In short: the
// more of the committee agrees, and the more confidently they agree, the
// further the score moves from neutral — a committee that is both split and
// unsure stays close to 50.
//
// The final score is clamped to 0-100 (defensive — the math above can't
// actually leave that range on its own, but a malformed confidence value
// from the model, e.g. an out-of-range number that slipped past validation,
// must never be allowed to push the displayed score out of bounds) and
// mapped to one of three verdict bands, exactly as BUILD-PLAN.md specifies:
// 0-34 SELL, 35-64 HOLD, 65-100 BUY.

export type ConsensusRecommendation = "BUY" | "HOLD" | "SELL";

export type ConsensusVote = {
  recommendation: ConsensusRecommendation;
  /** 0-100. Out-of-range values are clamped, never allowed to skew the score. */
  confidence: number;
};

export type ConsensusVerdict = "BUY" | "HOLD" | "SELL";

export type ConsensusResult = {
  /** 0-100, rounded to the nearest whole number. */
  score: number;
  verdict: ConsensusVerdict;
};

/** Which way a vote pushes the score: BUY up, SELL down, HOLD not at all. */
const VOTE_DIRECTION: Record<ConsensusRecommendation, number> = {
  BUY: 1,
  HOLD: 0,
  SELL: -1,
};

const START_SCORE = 50;
// Half the 0-100 range: the total distance a fully unanimous, fully
// confident committee can move the score away from the neutral start,
// split evenly across however many votes are cast.
const MAX_SWING = 50;

const SELL_BAND_MAX = 34;
const HOLD_BAND_MAX = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map a 0-100 consensus score to its verdict band (BUILD-PLAN.md Phase 5, exact boundaries). */
export function verdictForScore(score: number): ConsensusVerdict {
  if (score <= SELL_BAND_MAX) return "SELL";
  if (score <= HOLD_BAND_MAX) return "HOLD";
  return "BUY";
}

/**
 * Compute the committee's consensus score + verdict from its votes. Pure and
 * deterministic — same votes in, same result out, every time. An empty vote
 * list (should never happen in practice; the committee always casts six)
 * stays neutral rather than throwing, since "no information" is honestly a
 * HOLD at 50, not an error.
 */
export function computeConsensus(votes: ConsensusVote[]): ConsensusResult {
  if (votes.length === 0) {
    return { score: START_SCORE, verdict: verdictForScore(START_SCORE) };
  }

  const stepPerFullVote = MAX_SWING / votes.length;

  let score = START_SCORE;
  for (const vote of votes) {
    const confidence = clamp(vote.confidence, 0, 100);
    const direction = VOTE_DIRECTION[vote.recommendation];
    score += direction * (confidence / 100) * stepPerFullVote;
  }

  score = Math.round(clamp(score, 0, 100));
  return { score, verdict: verdictForScore(score) };
}
