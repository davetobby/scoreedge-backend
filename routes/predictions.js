// routes/predictions.js
const express = require('express');
const router = express.Router();
const { FreshCache } = require('../services/cache');
const dataSource = require('../services/sportsDataSource');
const { generateDailyPredictions } = require('../predictionsEngine');

// Predictions only need to regenerate once a day (fixtures for tomorrow don't
// change hour to hour), so a long cache window keeps you well within API limits.
const predictionsCache = new FreshCache({
  maxAgeMs: 6 * 60 * 60 * 1000, // 6 hours
  label: 'daily-predictions',
  refreshFn: async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fixtures = await dataSource.fetchFixtures({ date: tomorrow });

    // API-Football's /teams/statistics requires league + season alongside the
    // team id (unlike most endpoints), so pull those from each fixture rather
    // than just its team ids.
    const teamRefs = fixtures.flatMap((f) => [
      { teamId: f.homeTeamId, leagueId: f.leagueId, season: f.season },
      { teamId: f.awayTeamId, leagueId: f.leagueId, season: f.season },
    ]);
    const uniqueRefs = [...new Map(teamRefs.map((r) => [r.teamId, r])).values()];
    const teams = await Promise.all(uniqueRefs.map((r) => dataSource.fetchTeamStats(r)));
    const teamsById = Object.fromEntries(uniqueRefs.map((r, i) => [r.teamId, { id: r.teamId, name: '', ...teams[i] }]));

    return generateDailyPredictions(fixtures, teamsById);
  },
});

// GET /predictions/today?isVip=true
router.get('/today', async (req, res) => {
  try {
    const all = await predictionsCache.ensureFresh();
    const isVip = req.query.isVip === 'true';

    const free = all.filter((p) => p.tier === 'free');
    // VIP users see everything; free users get the free list plus a
    // blurred preview (match name + tier only, no real confidence number)
    const vip = isVip
      ? all.filter((p) => p.tier === 'vip')
      : all.filter((p) => p.tier === 'vip').map((p) => ({
          fixtureId: p.fixtureId,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          tier: 'vip',
          locked: true, // frontend applies the blur based on this flag
        }));

    res.json({ free, vip });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load predictions' });
  }
});

module.exports = router;
