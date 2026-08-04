// routes/transfers.js
const express = require('express');
const router = express.Router();
const dataSource = require('../services/sportsDataSource');
const newsSource = require('../services/newsSource');
const { FreshCache } = require('../services/cache');

const BIG_CLUBS = [
  'Arsenal', 'Manchester City', 'Real Madrid', 'Barcelona',
  'Bayern Munich', 'Paris Saint Germain', 'Liverpool', 'Manchester United',
];

const teamIdCache = new FreshCache({
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  label: 'big-club-ids',
  refreshFn: async () => {
    const results = await Promise.all(BIG_CLUBS.map((name) => dataSource.searchTeams(name)));
    return results.map((matches) => matches[0]).filter(Boolean);
  },
});

const bigClubTransfersCache = new FreshCache({
  maxAgeMs: 24 * 60 * 60 * 1000,
  label: 'big-club-transfers',
  refreshFn: async () => {
    const teams = await teamIdCache.ensureFresh();
    const results = await Promise.all(
      teams.map(async (team) => {
        const transfers = await dataSource.fetchConfirmedTransfers(team.id);
        return transfers.map((t) => ({ ...t, club: team.name }));
      })
    );
    return results.flat().sort((a, b) => new Date(b.date) - new Date(a.date));
  },
});

router.get('/confirmed', async (req, res) => {
  try {
    const transfers = await bigClubTransfersCache.ensureFresh();
    res.json({ transfers: transfers ?? [] });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load confirmed transfers' });
  }
});

router.get('/rumors', async (req, res) => {
  try {
    const articles = await newsSource.fetchCategory('transfers');
    res.json({ articles });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load transfer news' });
  }
});

module.exports = router;
