// sportsDataSource.js
// Wired to API-Football v3 (api-sports.io / RapidAPI) — free tier: ~100 requests/day.

const { fetchWithTimeout } = require('./fetchWithTimeout');

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.SPORTS_API_KEY;

function headers() {
  return { 'x-apisports-key': API_KEY };
}

async function apiGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}${query ? `?${query}` : ''}`;
  const res = await fetchWithTimeout(url, { headers: headers() }, 8000);
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json.response ?? [];
}

async function fetchLiveMatches() {
  const raw = await apiGet('/fixtures', { live: 'all' });
  return raw.map(normalizeFixture);
}

async function fetchFixtures({ date, teamId, leagueId, season } = {}) {
  const params = {};
  if (date) params.date = date;
  if (teamId) params.team = teamId;
  if (leagueId) params.league = leagueId;
  if (season) params.season = season;
  const raw = await apiGet('/fixtures', params);
  return raw.map(normalizeFixture);
}

async function fetchMatchEvents(fixtureId) {
  const raw = await apiGet('/fixtures/events', { fixture: fixtureId });
  return raw.map(normalizeEvent);
}

async function fetchTeamStats({ teamId, leagueId, season }) {
  const raw = await apiGet('/teams/statistics', { team: teamId, league: leagueId, season });
  return normalizeTeamStats(raw);
}

async function searchTeams(query) {
  if (query.length < 3) return [];
  const raw = await apiGet('/teams', { search: query });
  return raw.map((t) => ({ id: t.team.id, name: t.team.name, logo: t.team.logo }));
}

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

function normalizeEvent(e) {
  const typeMap = { Goal: 'goal', Card: e.detail === 'Red Card' ? 'red' : 'yellow', subst: 'sub', Var: 'var' };
  return {
    id: `${e.time.elapsed}-${e.player?.id ?? 'x'}-${e.type}`,
    minute: e.time.elapsed,
    type: typeMap[e.type] ?? 'other',
    text: e.type === 'subst'
      ? `${e.player?.name ?? '?'} on, ${e.assist?.name ?? '?'} off`
      : `${e.player?.name ?? '?'}${e.assist?.name ? `, assist ${e.assist.name}` : ''}`,
  };
}

function normalizeTeamStats(raw) {
  return {
    recentForm: (raw.form ?? '').split('').slice(-6),
    avgGoalDifference:
      Number(raw.goals?.for?.average?.total ?? 0) - Number(raw.goals?.against?.average?.total ?? 0),
    homeWinRate: raw.fixtures?.played?.home ? raw.fixtures.wins.home / raw.fixtures.played.home : 0.5,
    awayWinRate: raw.fixtures?.played?.away ? raw.fixtures.wins.away / raw.fixtures.played.away : 0.5,
    headToHead: {},
  };
}

async function fetchConfirmedTransfers(teamId) {
  const raw = await apiGet('/transfers', { team: teamId });
  return raw.map((t) => ({
    playerName: t.player?.name,
    fromTeam: t.transfers?.[0]?.teams?.out?.name,
    toTeam: t.transfers?.[0]?.teams?.in?.name,
    date: t.transfers?.[0]?.date,
    type: t.transfers?.[0]?.type,
  }));
}

async function searchPlayers(query) {
  if (query.length < 3) return [];
  const raw = await apiGet('/players', { search: query });
  return raw.map((p) => ({ id: p.player.id, name: p.player.name, photo: p.player.photo, team: p.statistics?.[0]?.team?.name }));
}

async function searchLeagues(query) {
  if (query.length < 3) return [];
  const raw = await apiGet('/leagues', { search: query });
  return raw.map((l) => ({ id: l.league.id, name: l.league.name, logo: l.league.logo, country: l.country?.name }));
}

module.exports = {
  fetchLiveMatches,
  fetchFixtures,
  fetchMatchEvents,
  fetchTeamStats,
  searchTeams,
  fetchConfirmedTransfers,
  searchPlayers,
  searchLeagues,
};
