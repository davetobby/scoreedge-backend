// predictionsEngine.js
// Weighted, explainable prediction model — no ML needed for v1.
// Every output includes the component scores so you can debug or justify a pick.

const WEIGHTS = {
  recentForm: 0.4,
  goalDifference: 0.25,
  venueWinRate: 0.2, // home win rate for home team, away win rate for away team
  headToHead: 0.15,
};

const HOME_ADVANTAGE_BOOST = 0.08; // small edge added to home team's raw score

// Converts a form string like "WWDLW" (most recent last) into a 0-1 score.
// Recent games weighted more heavily than older ones.
function formScore(formArray) {
  const points = { W: 3, D: 1, L: 0 };
  const weights = [1, 1.2, 1.4, 1.6, 1.8, 2]; // oldest to most recent
  let total = 0;
  let maxTotal = 0;
  formArray.forEach((result, i) => {
    const w = weights[i] ?? 1;
    total += points[result] * w;
    maxTotal += 3 * w;
  });
  return maxTotal === 0 ? 0.5 : total / maxTotal;
}

// Normalizes goal difference average into a 0-1 range using a simple bounded scale.
// Assumes typical avg goal diff ranges roughly -3 to +3 per game.
function goalDiffScore(avgGoalDiff) {
  const clamped = Math.max(-3, Math.min(3, avgGoalDiff));
  return (clamped + 3) / 6;
}

function rawTeamScore(team, venue, opponentId) {
  const form = formScore(team.recentForm);
  const goalDiff = goalDiffScore(team.avgGoalDifference);
  const venueRate = venue === 'home' ? team.homeWinRate : team.awayWinRate;
  const h2h = team.headToHead?.[opponentId]?.winRate ?? 0.5; // default neutral if no history

  const score =
    WEIGHTS.recentForm * form +
    WEIGHTS.goalDifference * goalDiff +
    WEIGHTS.venueWinRate * venueRate +
    WEIGHTS.headToHead * h2h;

  return {
    score,
    breakdown: { form, goalDiff, venueRate, h2h },
  };
}

// Converts two raw team scores into win/draw/loss percentages that sum to 100.
// Draw probability scales with how close the two scores are — closely matched
// teams draw more often than lopsided ones, which reflects real football data.
function toOutcomeProbabilities(homeRaw, awayRaw) {
  const gap = Math.abs(homeRaw - awayRaw);
  const drawPct = Math.max(0.15, 0.32 - gap * 0.4); // closer match → higher draw chance

  const remaining = 1 - drawPct;
  const homeShare = homeRaw / (homeRaw + awayRaw || 1);

  const homeWinPct = remaining * homeShare;
  const awayWinPct = remaining * (1 - homeShare);

  return {
    homeWinPct: Math.round(homeWinPct * 100),
    drawPct: Math.round(drawPct * 100),
    awayWinPct: Math.round(awayWinPct * 100),
  };
}

// Main entry point — call this per fixture.
function predictFixture(fixture, homeTeam, awayTeam) {
  const homeResult = rawTeamScore(homeTeam, 'home', awayTeam.id);
  const awayResult = rawTeamScore(awayTeam, 'away', homeTeam.id);

  const homeRawBoosted = homeResult.score + HOME_ADVANTAGE_BOOST;
  const probabilities = toOutcomeProbabilities(homeRawBoosted, awayResult.score);

  const topOutcome = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
  const confidence = topOutcome[1];

  return {
    fixtureId: fixture.id,
    homeTeam: fixture.home ?? homeTeam.name,
    awayTeam: fixture.away ?? awayTeam.name,
    ...probabilities,
    topPick: topOutcome[0], // 'homeWinPct' | 'drawPct' | 'awayWinPct'
    confidence,
    tier: confidence >= 60 ? 'vip' : confidence >= 50 ? 'free' : 'excluded',
    modelVersion: 'v1-weighted-form',
    generatedAt: new Date().toISOString(),
    // Keep breakdowns for your own debugging / tuning — strip before sending to client if desired
    _debug: { home: homeResult.breakdown, away: awayResult.breakdown },
  };
}

// Batch job — run daily against tomorrow's fixtures.
async function generateDailyPredictions(fixtures, teamsById) {
  const predictions = fixtures
    .map((fixture) => {
      const home = teamsById[fixture.homeTeamId];
      const away = teamsById[fixture.awayTeamId];
      if (!home || !away) return null;
      return predictFixture(fixture, home, away);
    })
    .filter(Boolean)
    .filter((p) => p.tier !== 'excluded'); // drop coin-flip matches, no useful signal

  return predictions;
}

module.exports = { predictFixture, generateDailyPredictions, formScore, goalDiffScore };
