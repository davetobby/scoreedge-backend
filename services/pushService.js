// pushService.js
const { Expo } = require('expo-server-sdk'); // npm install expo-server-sdk
const expo = new Expo();

// In-memory last-known state per match, so we can diff on each poll and only
// notify on genuinely NEW changes. Swap for a real DB table if you need this
// to survive a server restart without re-sending old notifications.
//
// NOTE: we diff on the SCORE, not on event lists. fetchLiveMatches() (see
// sportsDataSource.js) returns score + minute for every live match in one
// request — fetching full event detail (who scored) would mean one extra
// request PER live match PER poll, which blows through API-Football's
// 100/day free cap almost immediately. So background push notifications say
// "Arsenal 1-0 Chelsea" rather than "Saka scores, assist Odegaard" — the
// scorer's name only shows once the user opens that match's detail screen,
// which calls fetchMatchEvents() on demand for that one match.
const lastKnownState = new Map(); // matchId -> { homeScore, awayScore, status }

async function sendPush(pushTokens, title, body, data = {}) {
  const messages = pushTokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({ to: token, sound: 'default', title, body, data }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('[pushService] send failed:', err.message);
    }
  }
}

// getFollowersForTeam(teamId) => Promise<string[]> of push tokens — implement
// against your users table (users who follow this team + have notifyGoals etc true)
async function diffAndNotify(liveMatches, getFollowersForTeam) {
  for (const match of liveMatches) {
    const prev = lastKnownState.get(match.id);

    if (prev) {
      const homeScored = match.homeScore > prev.homeScore;
      const awayScored = match.awayScore > prev.awayScore;
      const justFinished = prev.status !== 'finished' && match.status === 'finished';
      const justKickedOff = prev.status === 'scheduled' && match.status === 'live';

      if (homeScored || awayScored) {
        const scoringTeamId = homeScored ? match.homeTeamId : match.awayTeamId;
        const tokens = await getFollowersForTeam(scoringTeamId);
        if (tokens?.length) {
          const title = `\u26BD GOAL — ${match.home} ${match.homeScore}-${match.awayScore} ${match.away}`;
          await sendPush(tokens, title, `${match.minute}'`, { matchId: match.id });
        }
      }

      if (justFinished || justKickedOff) {
        const bothTeamsTokens = await Promise.all(
          [match.homeTeamId, match.awayTeamId].map(getFollowersForTeam)
        );
        const tokens = [...new Set(bothTeamsTokens.flat())];
        if (tokens.length) {
          const title = justFinished
            ? `Full-time: ${match.home} ${match.homeScore}-${match.awayScore} ${match.away}`
            : `Kickoff: ${match.home} vs ${match.away}`;
          await sendPush(tokens, title, '', { matchId: match.id });
        }
      }
    }

    lastKnownState.set(match.id, {
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
    });
  }
}

module.exports = { diffAndNotify, sendPush };
