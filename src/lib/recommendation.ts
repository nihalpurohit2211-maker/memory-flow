import { Moment, Visit } from '../types';

export interface RecommendationResult {
  moment: Moment;
  reason: string;
}

export function pickTakeMeSomewhere(
  moments: Moment[],
  visits: Record<string, Visit>,
  recentVisitHistory: string[]
): RecommendationResult | null {
  if (!moments || moments.length === 0) {
    return null;
  }

  if (moments.length === 1) {
    return {
      moment: moments[0],
      reason: 'The single available moment in this collection.',
    };
  }

  const lastVisitedId = recentVisitHistory.length > 0 ? recentVisitHistory[recentVisitHistory.length - 1] : null;

  // Filter out immediate repeat when multiple options exist
  const candidates = moments.filter((m) => m.id !== lastVisitedId);
  const eligible = candidates.length > 0 ? candidates : moments;

  // Score moments: prefer lower visit count, penalize recency in history, add small deterministic-random factor
  const scored = eligible.map((moment) => {
    const visit = visits[moment.id];
    const visitCount = visit ? visit.visitCount : 0;

    // Inverse frequency score: 0 visits gets 1.0, 1 visit gets 0.5, etc.
    const coverageScore = 1 / (1 + visitCount);

    // Recency penalty: check index in recentVisitHistory
    const recencyIndex = recentVisitHistory.lastIndexOf(moment.id);
    const recencyPenalty = recencyIndex !== -1 ? (recencyIndex + 1) / recentVisitHistory.length * 0.4 : 0;

    // Small random exploration factor (0 to 0.15)
    const explorationJitter = Math.random() * 0.15;

    const totalScore = coverageScore - recencyPenalty + explorationJitter;

    let reason = 'Unexplored moment with fresh perspective';
    if (visitCount === 0) {
      reason = 'You have not explored this moment yet';
    } else if (visitCount < 3) {
      reason = 'Less-visited activity worth rediscovering';
    } else {
      reason = 'Rediscovered across the event timeline';
    }

    return { moment, score: totalScore, reason };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    moment: scored[0].moment,
    reason: scored[0].reason,
  };
}
