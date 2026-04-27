import { useState, useCallback } from 'react';
import axios from 'axios';

const MAP_ALIASES = {
  de_mirage:'Mirage', de_inferno:'Inferno', de_nuke:'Nuke', de_ancient:'Ancient',
  de_anubis:'Anubis', de_dust2:'Dust2', de_overpass:'Overpass', de_train:'Train', de_vertigo:'Vertigo',
};
const MAPS = ['Mirage','Inferno','Nuke','Ancient','Anubis','Dust2','Overpass','Train','Vertigo'];

function normalizeMap(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_]/g, '');
  if (MAP_ALIASES[key]) return MAP_ALIASES[key];
  for (const map of MAPS) {
    if (key.includes(map.toLowerCase())) return map;
  }
  return null;
}

// Fetch league-only match IDs for a player via the match-rounds endpoint
// Returns array of matchIds filtered to league/championship/tournament
async function fetchLeagueMatchIds(playerIds) {
  const cookie = typeof document !== 'undefined' ? document.cookie : '';
  const matchIdSets = [];
  for (const pid of playerIds.slice(0, 3)) {
    try {
      const resp = await fetch(
        `/api/match-rounds-proxy/${pid}?limit=200`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      const ids = new Set((data.items || []).map(m => m.matchId).filter(Boolean));
      if (ids.size > 0) matchIdSets.push(ids);
    } catch { /* skip */ }
  }
  if (matchIdSets.length === 0) return null; // signal to use server-side fallback
  // Intersect: only matches appearing in ≥2 players' histories
  const idCount = new Map();
  for (const s of matchIdSets) for (const id of s) idCount.set(id, (idCount.get(id) || 0) + 1);
  const shared = [...idCount.entries()].filter(([, c]) => c >= Math.min(2, matchIdSets.length)).map(([id]) => id);
  return shared.length > 0 ? shared : null;
}

async function fetchVetoForMatch(matchId, oppFactionKey) {
  const debugEntry = { matchId, oppFactionKey, status: null, httpStatus: null, bans: [], allDrops: [], error: null };
  try {
    const resp = await fetch(`/api/democracy/${matchId}`, { headers: { 'Accept': 'application/json' } });
    debugEntry.httpStatus = resp.status;
    if (!resp.ok) { debugEntry.status = 'http_error'; debugEntry.error = `HTTP ${resp.status}`; return { oppBans: [], debugEntry }; }
    const data = await resp.json();
    const tickets = data?.payload?.tickets ?? [];
    const mapTicket = tickets.find(t => t.entity_type === 'map');
    if (!mapTicket) { debugEntry.status = 'no_map_ticket'; debugEntry.error = `Tickets: ${tickets.map(t => t.entity_type).join(', ') || 'none'}`; return { oppBans: [], debugEntry }; }
    const oppBans = [];
    for (const e of (mapTicket.entities || [])) {
      if (e.status !== 'drop') continue;
      const map = normalizeMap(e.guid);
      debugEntry.allDrops.push({ guid: e.guid, map, selected_by: e.selected_by });
      if (map && e.selected_by === oppFactionKey) oppBans.push(map);
    }
    debugEntry.status = oppBans.length > 0 ? 'ok' : 'no_opp_bans';
    debugEntry.bans = oppBans;
    if (oppBans.length === 0 && debugEntry.allDrops.length > 0) {
      debugEntry.error = `oppFactionKey="${oppFactionKey}" not in [${[...new Set(debugEntry.allDrops.map(d => d.selected_by))].join(', ')}]`;
    }
    return { oppBans, debugEntry };
  } catch (err) {
    debugEntry.status = 'exception'; debugEntry.error = err.message;
    return { oppBans: [], debugEntry };
  }
}

// Fetch rich per-player stats from FACEIT internal stats API (requires browser cookies)
// Returns array of per-map entries: [{ matchId, map, teamId, players: [...] }]
async function fetchInternalStats(matchId) {
  try {
    const cookie = typeof document !== 'undefined' ? document.cookie : '';
    const resp = await fetch(`/api/stats-proxy/${matchId}`, {
      headers: { 'Accept': 'application/json', 'X-Faceit-Cookie': cookie },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    // data is an array of map entries, each with teams[].players[]
    if (!Array.isArray(data)) return null;
    return data;
  } catch { return null; }
}

export function useAnalyze() {
  const [status, setStatus]         = useState('idle');
  const [statusMsg, setMsg]         = useState('Ready. Enter match details above.');
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [debugLog, setDebugLog]     = useState(null);
  const [bansByMatchId, setBans]    = useState({});
  const [matchSummaries, setSummaries] = useState([]);

  const analyze = useCallback(async ({ matchInput, myTeam, excludeMaps, myPermaBans }) => {
    setStatus('loading');
    setError(null);
    setResult(null);
    setDebugLog(null);
    setProgress(0);

    try {
      setMsg('Fetching match room and history…');
      // Pre-fetch league match IDs from browser (has session cookie for match-rounds endpoint)
      // Pass these to setup so it can skip PUGs before even fetching match details
      let leagueMatchIds = null;
      try {
        // We'll get player IDs after setup, so just signal readiness for now
        // The actual pre-fetch happens after we know the opponent's player IDs
      } catch { /* non-critical */ }

      const { data: setup } = await axios.get('/api/setup', {
        params: { matchInput, myTeam },
        timeout: 90000,
      });

      const { opponent, matchSummaries, players, matchesFiltered, formGuide, myTeamStats, dataSource } = setup;

      // If using player history (ESEA), pre-filter to league matches only using browser cookies
      // This removes hub/PUG matches that slipped through the server-side filter
      let filteredSummaries = matchSummaries;
      if (dataSource === 'players' && players?.length > 0) {
        setMsg('Filtering to league matches…');
        const playerIds = players.map(p => p.pid).filter(Boolean);
        const leagueIds = await fetchLeagueMatchIds(playerIds);
        if (leagueIds && leagueIds.length > 0) {
          const leagueSet = new Set(leagueIds);
          filteredSummaries = matchSummaries.filter(m => leagueSet.has(m.matchId));
          console.log(`[leagueFilter] ${filteredSummaries.length}/${matchSummaries.length} match summaries after league filter`);
        }
      }

      const uniqueMatches = [...new Map(filteredSummaries.map(m => [m.matchId, m])).values()];
      const total = uniqueMatches.length;
      setProgress(15);

      if (matchesFiltered) console.log(`[core] ${matchesFiltered.afterCoreFilter}/${matchesFiltered.total} matches after core lineup filter`);

      // ── FETCH VETO DATA ──────────────────────────────────────────────────────
      setMsg(`Fetching veto history… 0/${total}`);
      const bansByMatchId = {};
      const debugEntries = [];
      const BATCH = 8;

      for (let i = 0; i < total; i += BATCH) {
        const batch = uniqueMatches.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(({ matchId, oppFactionKey }) => fetchVetoForMatch(matchId, oppFactionKey))
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const { oppBans, debugEntry } = r.value;
            bansByMatchId[debugEntry.matchId] = oppBans;
            debugEntries.push(debugEntry);
          }
        }
        const done = Math.min(i + BATCH, total);
        setProgress(15 + Math.round((done / total) * 40));
        setMsg(`Fetching veto history… ${done}/${total}`);
      }

      const summary = {
        total,
        ok:            debugEntries.filter(d => d.status === 'ok').length,
        no_map_ticket: debugEntries.filter(d => d.status === 'no_map_ticket').length,
        no_opp_bans:   debugEntries.filter(d => d.status === 'no_opp_bans').length,
        http_error:    debugEntries.filter(d => d.status === 'http_error').length,
        exception:     debugEntries.filter(d => d.status === 'exception').length,
        sample: debugEntries.slice(0, 5).map(d => ({
          matchId: d.matchId, status: d.status, oppFactionKey: d.oppFactionKey,
          httpStatus: d.httpStatus, allDrops: d.allDrops, bans: d.bans, error: d.error,
        })),
      };
      setDebugLog(summary);
      setBans(bansByMatchId);
      setSummaries(filteredSummaries);

      // ── FETCH INTERNAL PLAYER STATS ───────────────────────────────────────────
      // Use FACEIT internal stats API for rich per-player per-map data (KAST, entry%, etc.)
      // Only fetch for up to 30 matches — same cap as server-side stats fetch
      setMsg(`Fetching player stats… 0/${Math.min(total, 30)}`);
      const internalStatsByMatchId = {};
      const statsBatch = uniqueMatches.slice(0, 30);

      for (let i = 0; i < statsBatch.length; i += BATCH) {
        const batch = statsBatch.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(({ matchId }) => fetchInternalStats(matchId).then(data => ({ matchId, data })))
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.data) {
            internalStatsByMatchId[r.value.matchId] = r.value.data;
          }
        }
        const done = Math.min(i + BATCH, statsBatch.length);
        setProgress(55 + Math.round((done / statsBatch.length) * 30));
        setMsg(`Fetching player stats… ${done}/${statsBatch.length}`);
      }

      const internalStatsCount = Object.keys(internalStatsByMatchId).length;
      console.log(`[internalStats] fetched for ${internalStatsCount}/${statsBatch.length} matches`);

      // ── COMPUTE STATS ────────────────────────────────────────────────────────
      setMsg('Computing stats…');
      const { data: stats } = await axios.post('/api/stats', {
        matchSummaries: filteredSummaries,
        bansByMatchId,
        excludeMaps,
        myPermaBans,
      });

      // If we got internal stats, compute richer player data
      let finalPlayers = players || [];
      if (internalStatsCount > 0 && players?.length > 0) {
        try {
          const { data: richPlayers } = await axios.post('/api/player-stats', {
            internalStatsByMatchId,
            corePlayerIds: players.map(p => p.pid),
            oppTeamId: opponent.id,
          }, { timeout: 30000 });
          if (richPlayers?.players?.length > 0) {
            // Merge: keep role/sniperKR from setup (open API has sniper data),
            // take display stats (entryRate, clutch, flash, byMap etc) from internal API
            const setupByPid = Object.fromEntries((players || []).map(p => [p.pid, p]));
            finalPlayers = richPlayers.players.map(rich => {
              const setup = setupByPid[rich.pid] || {};
              return {
                ...rich,
                // Always preserve ALL stats from /api/setup (open API — reliable, correct averaging)
                // Internal API (/api/player-stats) provides byMap and enriched fields only
                role: setup.role || rich.role,
                trait: setup.trait || rich.trait,
                sniperKR: setup.sniperKR ?? rich.sniperKR,
                teamRole: setup.teamRole || rich.teamRole || null,
                matches: setup.matches ?? rich.matches,
                kd: setup.kd ?? rich.kd,
                adr: setup.adr ?? rich.adr,
                hs: setup.hs || rich.hs,
                hsRaw: setup.hsRaw ?? rich.hsRaw,
                winRate: setup.winRate ?? rich.winRate,
                entryRate: setup.entryRate ?? rich.entryRate,
                entrySR: setup.entrySR ?? rich.entrySR,
                firstKills: setup.firstKills ?? rich.firstKills,
                clutch1v1: setup.clutch1v1 ?? rich.clutch1v1,
                clutch1v2: setup.clutch1v2 ?? rich.clutch1v2,
                flashSR: setup.flashSR ?? rich.flashSR,
                utilDmg: setup.utilDmg ?? rich.utilDmg,
                assists: setup.assists ?? rich.assists,
                byMap: setup.byMap && Object.keys(setup.byMap).length > 0 ? setup.byMap : rich.byMap,
              };
            });
            console.log(`[playerStats] merged internal stats for ${finalPlayers.length} players`);
          }
        } catch (e) {
          console.warn('[playerStats] internal stats failed, using fallback:', e.message);
        }
      }

      const coreCount = matchesFiltered?.afterCoreFilter ?? total;
      const src = dataSource === 'players' ? ' via player history' : '';
      setMsg(`Done — ${coreCount} core matches analysed${src}.`);
      setResult({ opponent, stats, matchesAnalysed: coreCount, players: finalPlayers, matchesFiltered, formGuide: formGuide || [], myTeamStats: myTeamStats || null, matchSummaries: filteredSummaries });
      setStatus('done');
      setProgress(100);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unexpected error.');
      setMsg('Error — see below.');
      setStatus('error');
    }
  }, []);

  return { status, statusMsg, progress, result, error, debugLog, analyze, bansByMatchId, matchSummaries };
}