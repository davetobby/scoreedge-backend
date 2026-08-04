// pushService.js
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

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
