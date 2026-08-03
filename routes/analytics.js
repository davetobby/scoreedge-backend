// routes/analytics.js
const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics');

// GET /analytics/summary?days=7&key=your_secret
// A basic shared-secret check — not real auth, but enough to keep this off
// public view. Set ANALYTICS_KEY in your .env; only you should know it.
router.get('/summary', (req, res) => {
  if (req.query.key !== process.env.ANALYTICS_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const days = Number(req.query.days) || 7;
  const summary = analytics.getSummary(days);

  const totals = summary.reduce(
    (acc, day) => ({
      liveScoreChecks: acc.liveScoreChecks + day.liveScoreChecks,
      liveMatchDetailViews: acc.liveMatchDetailViews + day.liveMatchDetailViews,
    }),
    { liveScoreChecks: 0, liveMatchDetailViews: 0 }
  );

  // A rough rule of thumb, not a hard rule: if people are checking live match
  // detail (the "is it happening right now" moment) more than ~50 times a day
  // on average, that's a real signal the 10-minute free-tier delay is being
  // felt often enough that $19/month for near-real-time speed is worth it.
  const avgDailyLiveViews = summary.length ? totals.liveMatchDetailViews / summary.length : 0;
  const upgradeSignal = avgDailyLiveViews >= 50
    ? 'strong — worth upgrading'
    : avgDailyLiveViews >= 15
    ? 'moderate — keep watching'
    : 'low — free tier is probably fine for now';

  res.json({ days: summary, totals, avgDailyLiveViews: Math.round(avgDailyLiveViews), upgradeSignal });
});

module.exports = router;
