// routes/matches.js
const express = require('express');
const router = express.Router();
const { FreshCache } = require('../services/cache');
const dataSource = require('../services/sportsDataSource');
const analytics = require('../services/analytics');

// Live scores need to feel current, but API-Football's free tier caps you at
// ~100 requests/day total. This cache is separate from the notification
// poller in server.js — every screen load that hits /matches/live would
// otherwise trigger its own API call. A 3-minute cache means several users
// (or one user refreshing) share the same underlying API call instead of
// each one costing a fresh request.
const liveCache = new FreshCache({
  maxAgeMs: 3 * 60 * 1000,
  refreshFn: dataSource.fetchLiveMatches,
  label: 'live-matches',
});

// GET /matches/live
router.get('/live', async (req, res) => {
  try {
    const matches = await liveCache.ensureFresh();
    // req.deviceId is set by a lightweight header the RN app sends (see below) —
    // falls back to undefined, which just means this check won't count toward uniqueDevices.
    analytics.trackLiveScoreCheck(req.headers['x-device-id']);
    res.json({ matches });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load live matches' });
  }
});

// GET /matches/today
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const matches = await dataSource.fetchFixtures({ date: today });
    res.json({ matches });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load today\u2019s fixtures' });
  }
});

// GET /matches/followed?userId=123
// Cross-references the user's followed teams against live + today's fixtures.
router.get('/followed', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    // TODO: replace with a real DB lookup of this user's followed team IDs
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

// GET /matches/:id — full detail for the match detail screen.
// Events (who scored, cards, subs) are fetched here on-demand — this is the
// ONLY place fetchMatchEvents() gets called, deliberately, so opening 50
// different matches costs 50 requests but background polling never does.
router.get('/:id', async (req, res) => {
  try {
    const live = await liveCache.ensureFresh();
    let match = live.find((m) => String(m.id) === req.params.id);

    if (!match) {
      // Not currently live — could be a finished or upcoming match a user tapped from Home
      const today = new Date().toISOString().slice(0, 10);
      const todayMatches = await dataSource.fetchFixtures({ date: today });
      match = todayMatches.find((m) => String(m.id) === req.params.id);
    }
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const events = await dataSource.fetchMatchEvents(match.id);

    // This is the exact scenario from your viewing-center question: someone
    // checking a match's detail screen WHILE it's live. High counts here are
    // the strongest signal that faster (paid-tier) polling would be noticed.
    if (match.status === 'live') {
      analytics.trackLiveMatchDetailView(req.headers['x-device-id']);
    }

    res.json({ match: { ...match, events } });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load match' });
  }
});

module.exports = router;
