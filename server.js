// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const matchesRouter = require('./routes/matches');
const teamsRouter = require('./routes/teams');
const predictionsRouter = require('./routes/predictions');
const analyticsRouter = require('./routes/analytics');
const newsRouter = require('./routes/news');
const transfersRouter = require('./routes/transfers');
const dataSource = require('./services/sportsDataSource');
const { diffAndNotify } = require('./services/pushService');

const app = express();
app.use(cors());
app.use(express.json());

app.locals.db = {
  followedTeams: new Map(),
  pushTokens: new Map(),
  notificationPrefs: new Map(),

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
app.use('/news', newsRouter);
app.use('/transfers', transfersRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const POLL_INTERVAL_MS = 10 * 60 * 1000;

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
