// routes/teams.js
const express = require('express');
const router = express.Router();
const dataSource = require('../services/sportsDataSource');

router.get('/search-all', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 3) return res.json({ teams: [], players: [], leagues: [] });

  try {
    const [teams, players, leagues] = await Promise.all([
      dataSource.searchTeams(q),
      dataSource.searchPlayers(q),
      dataSource.searchLeagues(q),
    ]);
    res.json({ teams, players, leagues });
  } catch (err) {
    res.status(502).json({ error: 'Search failed' });
  }
});

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ teams: [] });

  try {
    const teams = await dataSource.searchTeams(q);
    res.json({ teams });
  } catch (err) {
    res.status(502).json({ error: 'Search failed' });
  }
});

router.post('/:teamId/follow', async (req, res) => {
  const { teamId } = req.params;
  const { userId, pushToken } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    await req.app.locals.db.followTeam({ userId, teamId, pushToken });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to follow team' });
  }
});

router.delete('/:teamId/follow', async (req, res) => {
  const { teamId } = req.params;
  const { userId } = req.body;
  try {
    await req.app.locals.db.unfollowTeam({ userId, teamId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unfollow team' });
  }
});

router.patch('/:teamId/notification-prefs', async (req, res) => {
  const { teamId } = req.params;
  const { userId, ...prefs } = req.body;
  try {
    await req.app.locals.db.updateNotificationPrefs({ userId, teamId, prefs });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
