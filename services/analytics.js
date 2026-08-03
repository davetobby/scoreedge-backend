// analytics.js
// Deliberately simple — no third-party analytics SDK, no extra cost. Just
// enough signal to answer one question: "are enough people checking live
// scores during actual live matches to justify $19/month?"
//
// NOTE: this is in-memory, so counts reset whenever Render restarts your
// server (common on the free tier). That's fine for now — check the numbers
// every few days via /analytics/summary rather than expecting a running
// total. If you want a true historical record, log these same events to a
// real database once you have one (see server.js's db stub).

const dailyStats = new Map(); // 'YYYY-MM-DD' -> { liveScoreChecks, liveMatchDetailViews, uniqueDevices: Set }

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateToday() {
  const key = todayKey();
  if (!dailyStats.has(key)) {
    dailyStats.set(key, { liveScoreChecks: 0, liveMatchDetailViews: 0, uniqueDevices: new Set() });
  }
  return dailyStats.get(key);
}

// Call whenever GET /matches/live is hit — a user actively checking what's live right now.
function trackLiveScoreCheck(deviceId) {
  const stats = getOrCreateToday();
  stats.liveScoreChecks += 1;
  if (deviceId) stats.uniqueDevices.add(deviceId);
}

// Call whenever GET /matches/:id is hit AND that match's status is 'live' —
// this is the exact moment that matters: someone checking a goal/score while
// it's actually happening, the scenario this whole tracking exercise is about.
function trackLiveMatchDetailView(deviceId) {
  const stats = getOrCreateToday();
  stats.liveMatchDetailViews += 1;
  if (deviceId) stats.uniqueDevices.add(deviceId);
}

function getSummary(days = 7) {
  const result = [];
  const keys = [...dailyStats.keys()].sort().slice(-days);
  for (const key of keys) {
    const s = dailyStats.get(key);
    result.push({
      date: key,
      liveScoreChecks: s.liveScoreChecks,
      liveMatchDetailViews: s.liveMatchDetailViews,
      uniqueDevices: s.uniqueDevices.size,
    });
  }
  return result;
}

module.exports = { trackLiveScoreCheck, trackLiveMatchDetailView, getSummary };
