// server.js
require('dotenv').config(); // loads .env into process.env — must be the very first thing that runs

const express = require('express');
const cors = require('cors');

const matchesRouter = require('./routes/matches');
const teamsRouter = require('./routes/teams');
const predictionsRouter = require('./routes/predictions');
const analyticsRouter = require('./routes/analytics');
const dataSource = require('./services/sportsDataSource');
const { diffAndNotify } = require('./services/pushService');

const app = express();
app.use(cors());
app.use(express.json());

// --- Minimal DB stub so routes don't crash before you wire a real database ---
// Swap this for actual Postgres/Mongo/whatever once you set one up (Render
// has a free Postgres tier too — worth using the same host as your backend).
app.locals.db = {
  followedTeams: new Map(), // userId -> Set<teamId>
  pushTokens: new Map(), // userId -> pushToken
  notificationPrefs: new Map(), // `${userId}:${teamId}` -> prefs object

  async getFollowedTeamIds(userId) {
    return [...(this.followedTeams.get(userId) ?? [])];
  },
  async followTeam({ userId, teamId, pushToken }) {
    if (!this.followedTeams.has(userId)) this.followedTeams.set(userId, new Set());
    this.followedTeams.get(userId).add(teamId);
    if (pushToken) this.pushTokens.set(userId, pushToken);
  },
  async unfollowTeam({ userId, teamId }) {
    this.followedTeams.get(userId)?.delete(teamId);
  },
  async updateNotificationPrefs({ userId, teamId, prefs }) {
    this.notificationPrefs.set(`${userId}:${teamId}`, prefs);
  },
  async getFollowersForTeam(teamId) {
    const tokens = [];
    for (const [userId, teamIds] of this.followedTeams.entries()) {
      if (teamIds.has(teamId)) {
        const token = this.pushTokens.get(userId);
        if (token) tokens.push(token);
      }
    }
    return tokens;
  },
};

app.use('/matches', matchesRouter);
app.use('/teams', teamsRouter);
app.use('/predictions', predictionsRouter);
app.use('/analytics', analyticsRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// --- Notification polling job ---
// Same problem you solved in FeedPulse: Render's free tier sleeps and pauses
// setInterval. Two-part fix: keep setInterval as the primary driver while the
// app is warm, AND expose /internal/poll so an external cron pinger
// (cron-job.org, free) can trigger the same check even if Render went to sleep
// and only just woke back up to serve that request.
//
// BUDGET MATH — worth understanding, not just copying: fetchLiveMatches() is
// ONE request per poll (it returns all live matches globally), so the daily
// cost is simply (polls per day). At 100 requests/day total, shared with
// every other call your backend makes, polling every 60s (1,440 polls/day)
// would blow the entire budget on notifications alone within minutes.
// Every 10 minutes across a ~10hr daily match window is ~60 polls/day,
// leaving headroom for everything else. Trade-off: notifications lag real
// goals by up to ~10 minutes on this free tier. Tighten the interval once
// you're on a paid plan.
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes — tune against your real daily usage

async function pollAndNotify() {
  try {
    const liveMatches = await dataSource.fetchLiveMatches();
    await diffAndNotify(liveMatches, (teamId) => app.locals.db.getFollowersForTeam(teamId));
  } catch (err) {
    console.error('[pollAndNotify] failed:', err.message);
  }
}

app.get('/internal/poll', async (req, res) => {
  await pollAndNotify();
  res.json({ polled: true, time: new Date().toISOString() });
});

setInterval(pollAndNotify, POLL_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ScoreEdge backend running on port ${PORT}`));
