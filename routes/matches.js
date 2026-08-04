// routes/matches.js
const express = require('express');
const router = express.Router();
const { FreshCache } = require('../services/cache');
const dataSource = require('../services/sportsDataSource');
const analytics = require('../services/analytics');

const liveCache = new FreshCache({
  maxAgeMs: 3 * 60 * 1000,
  refreshFn: dataSource.fetchLiveMatches,
  label: 'live-matches',
});

router.get('/live', async (req, res) => {
  try {
    const matches = await liveCache.ensureFresh();
    analytics.trackLiveScoreCheck(req.headers['x-device-id']);
    res.json({ matches });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load live matches' });
  }
});

router.get('/today', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const matches = await dataSource.fetchFixtures({ date });
    res.json({ matches });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load fixtures' });
  }
});

router.get('/followed', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const followedTeamIds = await req.app.locals.db.getFollowedTeamIds(userId);

    const [live, today] = await Promise.all([
      liveCache.ensureFresh(),
      dataSource.fetchFixtures({ date: new Date().toISOString().slice(0, 10) }),
    ]);

    const relevant = [...live, ...today].filter(
      (m) => followedTeamIds.includes(m.homeTeamId) || followedTeamIds.includes(m.awayTeamId)
    );
    res.json({ matches: relevant });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load followed matches' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const live = await liveCache.ensureFresh();
    let match = live.find((m) => String(m.id) === req.params.id);

    if (!match) {
      const today = new Date().toISOString().slice(0, 10);
      const todayMatches = await dataSource.fetchFixtures({ date: today });
      match = todayMatches.find((m) => String(m.id) === req.params.id);
    }
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const events = await dataSource.fetchMatchEvents(match.id);

    if (match.status === 'live') {
      analytics.trackLiveMatchDetailView(req.headers['x-device-id']);
    }

    res.json({ match: { ...match, events } });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load match' });
  }
});

module.exports = router;
