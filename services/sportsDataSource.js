// sportsDataSource.js
// Wired to API-Football v3 (api-sports.io / RapidAPI) — free tier: ~100 requests/day.
//
// IMPORTANT request-budget note: fetchLiveMatches() hits ONE endpoint
// (`/fixtures?live=all`) that returns EVERY live match worldwide in a single
// call — it does NOT cost one request per match. That's what makes polling
// affordable on a 100/day cap. Keep it that way: never loop and call
// fetchMatchEvents() for every live match on every poll, or you'll burn
// the daily budget in under an hour. Only fetch events for a specific match
// when a user actually opens that match's detail screen (on-demand, not
// background polling).

const { fetchWithTimeout } = require('./fetchWithTimeout');

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.SPORTS_API_KEY; // from dashboard.api-football.com

function headers() {
  return { 'x-apisports-key': API_KEY };
}

async function apiGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
  const res = await fetchWithTimeout(url, { headers: headers() }, 8000);
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`);
  const json = await res.json();
  // API-Football returns errors as a populated `errors` object even on HTTP 200
  // (e.g. rate limit exceeded) — surface that instead of silently returning [].
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json.response ?? [];
}

// Single call, covers every live match globally — this is the one your
// notification poller should hit on a schedule.
async function fetchLiveMatches() {
  const raw = await apiGet('/fixtures', { live: 'all' });
  return raw.map(normalizeFixture);
}

// date format: 'YYYY-MM-DD'
async function fetchFixtures({ date, teamId, leagueId, season } = {}) {
  const params = {};
  if (date) params.date = date;
  if (teamId) params.team = teamId;
  if (leagueId) params.league = leagueId;
  if (season) params.season = season;
  const raw = await apiGet('/fixtures', params);
  return raw.map(normalizeFixture);
}

// Only call this for a SINGLE match the user has opened — never in a loop.
async function fetchMatchEvents(fixtureId) {
  const raw = await apiGet('/fixtures/events', { fixture: fixtureId });
  return raw.map(normalizeEvent);
}

// API-Football requires league + season alongside team for stats (unlike
// most other endpoints) — so predictionsEngine's fixture loop needs to pass
// the fixture's own league/season through rather than just a teamId.
async function fetchTeamStats({ teamId, leagueId, season }) {
  const raw = await apiGet('/teams/statistics', { team: teamId, league: leagueId, season });
  return normalizeTeamStats(raw);
}

// Minimum 3 characters per API-Football's search requirement.
async function searchTeams(query) {
  if (query.length < 3) return [];
  const raw = await apiGet('/teams', { search: query });
  return raw.map((t) => ({ id: t.team.id, name: t.team.name, logo: t.team.logo }));
}

// --- Normalizers ---
// These match API-Football v3's actual documented response shape.
const STATUS_MAP = {
  NS: 'scheduled', TBD: 'scheduled',
  '1H': 'live', HT: 'live', '2H': 'live', ET: 'live', P: 'live', BT: 'live',
  FT: 'finished', AET: 'finished', PEN: 'finished',
  PST: 'postponed', CANC: 'cancelled', ABD: 'abandoned',
};

function normalizeFixture(m) {
  return {
    id: m.fixture.id,
    leagueId: m.league.id,
    league: m.league.name,
    season: m.league.season,
    homeTeamId: m.teams.home.id,
    awayTeamId: m.teams.away.id,
    home: m.teams.home.name,
    away: m.teams.away.name,
    homeScore: m.goals.home ?? 0,
    awayScore: m.goals.away ?? 0,
    minute: m.fixture.status.elapsed,
    status: STATUS_MAP[m.fixture.status.short] ?? 'scheduled',
    kickoff: m.fixture.date,
  };
}

// Event `type` values: 'Goal' | 'Card' | 'subst' | 'Var'
function normalizeEvent(e) {
  const typeMap = { Goal: 'goal', Card: e.detail === 'Red Card' ? 'red' : 'yellow', subst: 'sub', Var: 'var' };
  return {
    id: `${e.time.elapsed}-${e.player?.id ?? 'x'}-${e.type}`, // API-Football doesn't give events a stable id
    minute: e.time.elapsed,
    type: typeMap[e.type] ?? 'other',
    text: e.type === 'subst'
      ? `${e.player?.name ?? '?'} on, ${e.assist?.name ?? '?'} off`
      : `${e.player?.name ?? '?'}${e.assist?.name ? `, assist ${e.assist.name}` : ''}`,
  };
}

function normalizeTeamStats(raw) {
  return {
    recentForm: (raw.form ?? '').split('').slice(-6), // API returns e.g. "WWDLWL" as a string, most recent last
    avgGoalDifference:
      Number(raw.goals?.for?.average?.total ?? 0) - Number(raw.goals?.against?.average?.total ?? 0),
    homeWinRate: raw.fixtures?.played?.home ? raw.fixtures.wins.home / raw.fixtures.played.home : 0.5,
    awayWinRate: raw.fixtures?.played?.away ? raw.fixtures.wins.away / raw.fixtures.played.away : 0.5,
    headToHead: {}, // API-Football's h2h lives at a separate /fixtures/headtohead endpoint — add if needed
  };
}

module.exports = { fetchLiveMatches, fetchFixtures, fetchMatchEvents, fetchTeamStats, searchTeams };
