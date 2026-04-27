try { require('dotenv').config(); } catch (_) {} // optional — Railway injects env vars directly
const https = require('https');
const Redis = require('ioredis');

// ── Redis cache ─────────────────────────────────────────────────────────
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true, connectTimeout: 5000 })
  : null;

if (redis) {
  redis.connect().then(() => console.log('[redis] connected')).catch(e => console.log('[redis] connection failed:', e.message));
  redis.on('error', () => {}); // suppress noisy errors
}

async function rGet(key) {
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function rSet(key, data, ttlSeconds) {
  if (!redis) return;
  try { await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds); } catch {}
}
require('events').EventEmitter.defaultMaxListeners = 50;
const express = require('express');
const cors = require('cors');
const axios = require('axios');


const app = express();
app.set('trust proxy', 1); // Railway runs behind a proxy
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : process.env.RAILWAY_PUBLIC_DOMAIN
      ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`]
      : ['http://localhost:5173', 'http://localhost:3001'],
  methods: ['GET', 'POST'],
  credentials: false,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Security hardening ──────────────────────────────────────────────────
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet({
  contentSecurityPolicy: false, // CSP handled by frontend
  crossOriginEmbedderPolicy: false,
}));

// Global rate limit: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
});
app.use('/api/', globalLimiter);

// Stricter limit on analysis endpoint: 10 per minute
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Analysis rate limit reached. Please wait before retrying.' },
});
app.use('/api/setup', analysisLimiter);
app.use('/api/player-stats', analysisLimiter);



const PORT = process.env.PORT || 3001;
const FACEIT_API_KEY    = process.env.FACEIT_API_KEY;
const FACEIT_BASE = 'https://open.faceit.com/data/v4';

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20 });
const faceitClient = axios.create({ baseURL: FACEIT_BASE, httpsAgent, timeout: 15000 });

const ACTIVE_MAP_POOL = ['Mirage', 'Inferno', 'Dust2', 'Nuke', 'Ancient', 'Anubis', 'Overpass'];
const MAPS = ['Mirage','Inferno','Nuke','Ancient','Anubis','Dust2','Overpass','Train','Vertigo'];
const MAP_ALIASES = {
  de_mirage:'Mirage', de_inferno:'Inferno', de_nuke:'Nuke', de_ancient:'Ancient',
  de_anubis:'Anubis', de_dust2:'Dust2', de_overpass:'Overpass', de_train:'Train', de_vertigo:'Vertigo',
  mirage:'Mirage', inferno:'Inferno', nuke:'Nuke', ancient:'Ancient',
  anubis:'Anubis', dust2:'Dust2', overpass:'Overpass', train:'Train', vertigo:'Vertigo',
};

const HISTORY_LIMIT = 200;
const MATCH_LIMIT   = 200;

function normalizeMap(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_]/g, '');
  if (MAP_ALIASES[key]) return MAP_ALIASES[key];
  for (const map of MAPS) {
    if (key.includes(map.toLowerCase().replace(/\s/g, ''))) return map;
  }
  return null;
}

function extractRoomId(input) {
  const m = input.match(/room\/(1-[a-f0-9-]+)/i);
  if (m) return m[1];
  if (/^1-[a-f0-9-]+$/i.test(input.trim())) return input.trim();
  return null;
}

async function faceit(path, attempt = 0) {
  try {
    return await faceitClient.get(path, {
      headers: { Authorization: `Bearer ${FACEIT_API_KEY}` },
    });
  } catch (err) {
    if (err.response?.status === 429 && attempt < 3) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      return faceit(path, attempt + 1);
    }
    throw err;
  }
}

function confidence(n) {
  if (n >= 20) return 1.00;
  if (n >= 10) return 0.85;
  if (n >= 5)  return 0.65;
  return 0.40;
}

function adjWinRate(wins, games) {
  if (!games) return 0;
  return (wins / games) * confidence(games);
}



function buildRecommendation(playCounts, winCounts, banCounts, excludeMaps, activePool, myPermaBans) {
  const isExcluded = m => excludeMaps.some(ex => m.toLowerCase().includes(ex));
  const pool = activePool.filter(m => !isExcluded(m));
  const permaSet = new Set((myPermaBans || []).map(m => m.trim()).filter(Boolean));

  const stats = pool.map(map => {
    const games = playCounts[map] || 0;
    const wins  = winCounts[map]  || 0;
    const wr    = games ? wins / games : 0;
    const bans  = banCounts[map] || 0;
    const isPerma = permaSet.has(map);
    return { map, games, wins, losses: games - wins, wr, bans, isPerma };
  });

  const permaMaps = stats.filter(s => s.isPerma);
  const nonPerma  = stats.filter(s => !s.isPerma);

  const withData   = nonPerma.filter(s => s.games >= 3);
  const thinData   = withData.length === 0 && permaMaps.length === 0;
  const byStrength = [...withData].sort((a, b) => b.wr - a.wr);
  const byWeakness = [...withData].sort((a, b) => a.wr - b.wr);

  // Permabans are always your first bans
  let ban1 = null, ban2 = null;
  const suggestedBans = [];
  const reasoningParts = [];

  if (permaMaps.length >= 1) {
    ban1 = permaMaps[0].map;
    suggestedBans.push(ban1);
    const s = permaMaps[0];
    reasoningParts.push(`${ban1} is your permaban${s.games ? ` (opponent: ${s.games}G, ${Math.round(s.wr * 100)}% WR)` : ''}.`);
  }
  if (permaMaps.length >= 2) {
    ban2 = permaMaps[1].map;
    suggestedBans.push(ban2);
    const s = permaMaps[1];
    reasoningParts.push(`${ban2} is your permaban${s.games ? ` (opponent: ${s.games}G, ${Math.round(s.wr * 100)}% WR)` : ''}.`);
  }

  // Fill remaining bans from opponent's strongest maps (excluding permabans)
  if (!ban1) {
    if (thinData) {
      const byPlayed = [...nonPerma].sort((a, b) => b.games - a.games);
      ban1 = byPlayed[0]?.map || null;
      ban2 = byPlayed[1]?.map || null;
      suggestedBans.push(...[ban1, ban2].filter(Boolean));
    } else {
      ban1 = byStrength[0]?.map || null;
      ban2 = byStrength.find(s => s.map !== ban1)?.map || null;
      suggestedBans.push(...[ban1, ban2].filter(Boolean));
    }
  } else if (!ban2 && withData.length > 0) {
    // One permaban set, suggest second ban from opponent data
    ban2 = byStrength[0]?.map || null;
    if (ban2) {
      suggestedBans.push(ban2);
      const s = stats.find(s => s.map === ban2);
      reasoningParts.push(`${ban2} is their strongest remaining map (${s?.games || 0}G, ${Math.round((s?.wr || 0) * 100)}% WR) — ban this second.`);
    }
  }

  // Generate reasoning for non-permaban selections
  if (permaMaps.length === 0) {
    const s1 = stats.find(s => s.map === ban1);
    const s2 = stats.find(s => s.map === ban2);
    if (thinData) {
      reasoningParts.push(`Not enough data for a confident recommendation — no map has 3+ games. Defaulting to their most-played maps` +
        (ban1 ? ` (${ban1}${s1?.games ? `, ${s1.games}G` : ''})` : '') +
        (ban2 ? ` and ${ban2}${s2?.games ? ` (${s2.games}G)` : ''}` : '') + `.`);
    } else {
      if (s1) reasoningParts.push(`${ban1} is their strongest map (${s1.games}G, ${Math.round(s1.wr * 100)}% WR).`);
      if (s2) reasoningParts.push(`${ban2} is their second strongest map (${s2.games}G, ${Math.round(s2.wr * 100)}% WR).`);
    }
  }

  // Add "forces them onto" weak maps
  const weakMaps = byWeakness.filter(s => s.map !== ban1 && s.map !== ban2);
  if (weakMaps.length > 0) {
    const w1 = weakMaps[0];
    const w2 = weakMaps[1];
    reasoningParts.push(`This forces them onto` +
      (w1 ? ` ${w1.map} (${Math.round(w1.wr * 100)}% WR, ${w1.games}G)` : '') +
      (w1 && w2 ? ' or' : '') +
      (w2 ? ` ${w2.map} (${Math.round(w2.wr * 100)}% WR, ${w2.games}G)` : '') +
      ` where they struggle most.`);
  }

  // Predicted opponent bans
  const oppBanOrder = [...pool].sort((a, b) => (banCounts[b] || 0) - (banCounts[a] || 0));

  return {
    suggestedBans: suggestedBans.filter(Boolean),
    reasoning: reasoningParts.join(' ').trim(),
    lowConfidence: thinData,
    permaBans: [...permaSet],
    oppBan1: oppBanOrder[0] || null,
    oppBan2: oppBanOrder[1] || null,
  };
}


// Debug: dumps ALL player_stats keys + values for first player in a match



// Proxy FACEIT democracy API — browser can't call it cross-origin from localhost


/**
 * Step 1: Fetch match room + opponent history.
 * - Detects "core lineup" from most recent match
 * - Only keeps historical matches where ≥3 core players appeared
 * - Fetches player stats + derives roles
 */
// ─── Role helpers (defined inline here since they were trimmed) ───────────
function deriveRoleScores(stats) {
  const s = stats || {};
  const n = v => parseFloat(v) || 0;

  const kd         = n(s['K/D Ratio']);
  const hs         = n(s['Headshots %']);
  const adr        = n(s['ADR']);
  const entryRate  = n(s['Match Entry Rate']);
  const entrySR    = n(s['Match Entry Success Rate']);
  const clutch1v1  = n(s['Match 1v1 Win Rate']);
  const utilDmg    = n(s['Utility Damage per Round in a Match'] || s['Utility Damage per Round'] || 0);
  const assists    = n(s['Assists']);
  const sniperKR   = n(s['Sniper Kill Rate per Round']);
  const firstKills = n(s['First Kills']);
  const flashSucc  = n(s['Flash Successes']);
  const multiKills = n(s['Double Kills']);

  // Calibrated against real HIJACK data:
  //   flashSucc: 3-6 for all players, 6.5+ for dedicated support
  //   assists:   4-6 for all players, 6.5+ for dedicated support
  //   sniperKR:  0.28 for AWPer, ~0.001-0.01 for everyone else
  //   kd:        1.0-1.17 range for this team

  const entryScore =
    entryRate * 10
    + firstKills * 1.5
    + entrySR * 0.5
    - (entryRate < 0.15 ? 5 : 0)
    - sniperKR * 15;

  // Support: requires BOTH flash AND assists above strict thresholds.
  // flashSucc > 6 and assists > 6 are the gates — normal fraggers score 0.
  // Strong KD penalty ensures good fraggers don't get this role.
  const supportScore =
    (flashSucc > 6 ? (flashSucc - 5) * 3 : 0)
    + (assists  > 6 ? (assists  - 5) * 4 : 0)
    + utilDmg * 0.2
    - sniperKR * 20
    - (kd > 1.05 ? 3 : kd > 1.0 ? 1.5 : 0);

  const lurkScore =
    (entryRate < 0.13 ? 4 : entryRate < 0.16 ? 2 : entryRate < 0.19 ? 0 : -2)
    + clutch1v1 * 3
    - (flashSucc > 5 ? 1 : 0)
    - sniperKR * 10;

  const riflerScore =
    kd * 4
    + (hs > 50 ? 1.5 : 0)
    + adr * 0.012
    + multiKills * 0.3
    - sniperKR * 10;

  return {
    kd, hs, adr, entryRate, entrySR, clutch1v1,
    utilDmg, assists, sniperKR, firstKills, flashSucc, multiKills,
    scores: {
      AWPer:           sniperKR * 100,      // stored for reference; assignRoles hard-assigns AWPer
      'Entry Fragger': entryScore,
      Support:         supportScore,
      Lurker:          lurkScore,
      Rifler:          riflerScore,
    },
    impactScore: kd * 3 + adr * 0.015 + multiKills * 0.4,
  };
}

function assignRoles(playerScoresList) {
  // ── Step 1: Hard-assign AWPer by absolute sniper kill rate ───────────────
  const sniperRates  = playerScoresList.map(p => p.sniperKR || 0);
  const maxSniper    = Math.max(...sniperRates);
  const sortedSniper = [...sniperRates].sort((a, b) => b - a);
  const secondSniper = sortedSniper[1] || 0;
  const hasAWPer     = maxSniper > 0.07 && (secondSniper < 0.04 || maxSniper > secondSniper * 1.8);
  const awperIdx     = hasAWPer ? sniperRates.indexOf(maxSniper) : -1;

  const assigned = new Array(playerScoresList.length).fill(null);
  const usedIdxs = new Set();

  if (awperIdx >= 0) {
    assigned[awperIdx] = 'AWPer';
    usedIdxs.add(awperIdx);
  }

  // ── Step 2: Entry Fragger — eligible only if EF score > Rifler score
  // AND entryRate > 0.18. Among eligible players, highest entryRate wins
  // (the true entry fragger goes first most often — that's what the role means).
  let efBestIdx = -1, efBestRate = -Infinity;
  for (let i = 0; i < playerScoresList.length; i++) {
    if (usedIdxs.has(i)) continue;
    const p = playerScoresList[i];
    const efScore  = p.scores['Entry Fragger'] || 0;
    const rfScore  = p.scores['Rifler']        || 0;
    const rate     = p.entryRate || 0;
    const eligible = efScore > rfScore && rate > 0.18;
    if (eligible && rate > efBestRate) { efBestRate = rate; efBestIdx = i; }
  }
  if (efBestIdx >= 0) { assigned[efBestIdx] = 'Entry Fragger'; usedIdxs.add(efBestIdx); }

  // ── Step 3: Assign remaining roles by score ──────────────────────────────
  for (const role of ['Support', 'Lurker', 'Rifler']) {
    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < playerScoresList.length; i++) {
      if (usedIdxs.has(i)) continue;
      const score = playerScoresList[i].scores[role] || 0;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx >= 0) { assigned[bestIdx] = role; usedIdxs.add(bestIdx); }
  }

  // Any remaining unassigned → Rifler
  for (let i = 0; i < assigned.length; i++) {
    if (!assigned[i]) assigned[i] = 'Rifler';
  }

  return assigned;
}

// ── Quick match room info (returns both teams for selection) ─────────────
// ── Democracy (veto) data proxy ──────────────────────────────────────────
app.get('/api/democracy/:matchId', async (req, res) => {
  const { matchId } = req.params;
  try {
    const { data } = await axios.get(
      `https://www.faceit.com/api/democracy/v1/match/${matchId}/history`,
      {
        httpsAgent,
        headers: {
          'Accept': 'application/json',
          'faceit-referer': 'web-next',
        },
        timeout: 10000,
      }
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/match-info', async (req, res) => {
  const matchInput = (req.query.matchInput || '').trim();
  if (!matchInput) return res.status(400).json({ error: 'matchInput is required.' });

  const roomId = extractRoomId(matchInput);
  if (!roomId) return res.status(400).json({ error: 'Invalid match room URL or ID.' });

  try {
    // Check Redis cache first
    const ck = `matchinfo:${roomId}`;
    const cached = await rGet(ck);
    if (cached) return res.json(cached);

    const { data: room } = await faceit(`/matches/${roomId}`);
    const teams = room.teams || {};
    const result = {
      matchId: roomId,
      teams: Object.entries(teams).map(([key, t]) => ({
        factionKey: key,
        id: t.id || t.faction_id || t.team_id,
        name: t.name || t.faction_name || 'Unknown',
        avatar: t.avatar || null,
        roster: (t.roster || t.players || []).map(p => ({
          id: p.player_id || p.id,
          nickname: p.nickname || p.name,
          avatar: p.avatar || null,
          elo: p.elo || p.faceit_elo || null,
          level: p.gameSkillLevel || p.skill_level || null,
        })),
      })),
      competition: room.entity?.name || room.competition_name || null,
      status: room.status || room.state || null,
    };

    await rSet(ck, result, 300); // 5 min cache
    res.json(result);
  } catch (e) {
    const s = e.response?.status;
    if (s === 404) return res.status(404).json({ error: 'Match room not found.' });
    res.status(s || 500).json({ error: e.message });
  }
});

app.get('/api/setup', async (req, res) => {
  // Check cache
  const cacheKey = `setup:${req.query.matchInput}:${req.query.myTeam || ''}`;
  const cached = await rGet(cacheKey);
  if (cached) { console.log('[redis] cache hit:', cacheKey); return res.json(cached); }

  // Input validation
  const matchInput = (req.query.matchInput || '').trim();
  if (!matchInput) return res.status(400).json({ error: 'matchId is required.' });
  // Only allow UUIDs, FACEIT match URLs, or alphanumeric IDs
  if (!/^[a-zA-Z0-9\-\/:\.]+$/.test(matchInput) || matchInput.length > 200) {
    return res.status(400).json({ error: 'Invalid match ID format.' });
  }

  const myTeam = (req.query.myTeam || '').trim();

  if (!FACEIT_API_KEY || FACEIT_API_KEY === 'your_api_key_here') {
    return res.status(500).json({ error: 'FACEIT_API_KEY is not set in server/.env' });
  }

  const roomId = extractRoomId(matchInput || '');
  if (!roomId) return res.status(400).json({ error: 'Invalid match room URL or ID.' });

  try {
    const { data: match } = await faceit(`/matches/${roomId}`);
    const teams    = match.teams || {};
    const teamKeys = Object.keys(teams);
    if (teamKeys.length < 2) return res.status(400).json({ error: 'Could not find 2 teams.' });

    // Identify opponent
    let oppTeam = null, myTeamData = null;
    const myTeamLower = (myTeam || '').toLowerCase().trim();
    for (const key of teamKeys) {
      const t = teams[key];
      const name = (t.name || t.faction_name || '').toLowerCase();
      if (myTeamLower && name.includes(myTeamLower)) myTeamData = { ...t, factionKey: key };
      else oppTeam = { ...t, factionKey: key };
    }
    if (!oppTeam) {
      myTeamData = { ...teams[teamKeys[0]], factionKey: teamKeys[0] };
      oppTeam    = { ...teams[teamKeys[1]], factionKey: teamKeys[1] };
    }

    // In the FACEIT match room API, the team ID is stored as just `id`
    // This is the REGISTERED team ID (e.g. e9036f20-...) — same as faceit.com/teams/{id}
    const oppId      = oppTeam.id || oppTeam.faction_id || oppTeam.team_id;
    const oppName    = oppTeam.name || oppTeam.faction_name || 'Opponent';
    const oppAvatar  = oppTeam.avatar || null;
    console.log(`[team] oppId=${oppId} oppName=${oppName} type=${oppTeam.type}`);

    // Full roster from the current match room
    const rosterEntries = (oppTeam.roster || oppTeam.players || []);
    let oppPlayers    = rosterEntries.map(p => p.player_id || p.id).filter(Boolean);
    const nicknameMap   = Object.fromEntries(
      rosterEntries.map(p => [p.player_id || p.id, p.nickname || p.name || '?'])
    );

    // ── Fetch team roster early to prioritise core players for history lookup ──
    let teamRosterEarly = null;
    try {
      const ck = `roster:${oppId}`;
      const cached = await rGet(ck);
      if (cached) {
        teamRosterEarly = cached;
      } else {
        const { data: leagueData } = await axios.get(
          `https://www.faceit.com/api/team-leagues/v1/teams/${oppId}/profile/leagues/summary`,
          { httpsAgent, headers: { 'Accept': 'application/json', 'faceit-referer': 'web-next' }, timeout: 8000 }
        );
        const leagues = leagueData?.payload || [];
        if (leagues.length > 0) {
          teamRosterEarly = (leagues[0].active_members || []).map(m => ({
            id: m.user_id,
            name: m.user_name,
            gameRole: m.game_role === 'player' ? 'Core' : 'Substitute',
          }));
          await rSet(ck, teamRosterEarly, 3600); // 1hr cache
        }
      }
    } catch (e) {
      console.log(`[roster] early fetch failed: ${e.message}`);
    }

    // Prioritise core (starter) players for history intersection
    if (teamRosterEarly) {
      const coreIds = teamRosterEarly.filter(m => m.gameRole === 'Core').map(m => m.id);
      // Put core players first, then any match-room players not in the roster
      const coreSet = new Set(coreIds);
      const nonCore = oppPlayers.filter(id => !coreSet.has(id));
      oppPlayers = [...coreIds, ...nonCore];
      // Update nickname map with roster names
      for (const m of teamRosterEarly) {
        if (!nicknameMap[m.id]) nicknameMap[m.id] = m.name;
      }
      console.log(`[roster] prioritised ${coreIds.length} core players for history lookup`);
    }

    // Fetch match history using all 5 players' histories simultaneously.
    // Keep any match where ≥3 players appear — this finds all team matches
    // across ESEA seasons, qualifiers, and tournaments without needing a team endpoint.
    let matchIds   = [];
    let dataSource = 'players';

    if (oppPlayers.length > 0) {
      // Fetch up to 200 matches for each of the 5 players in parallel
      const playerHistories = await Promise.allSettled(
        oppPlayers.slice(0, 5).map(async pid => {
          const ck = `hist:${pid}`;
          const cached = await rGet(ck);
          if (cached) return cached;
          const { data } = await faceit(`/players/${pid}/history?game=cs2&offset=0&limit=${HISTORY_LIMIT}`);
          await rSet(ck, data, 900); // 15 min TTL
          return data;
        })
      );

      const idSets = playerHistories
        .filter(r => r.status === 'fulfilled' && r.value?.items)
        .map(r => new Set(r.value.items.map(m => m.match_id || m.matchId).filter(Boolean)));

      console.log(`[history] fetched histories for ${idSets.length} players, sizes: ${idSets.map(s => s.size).join(', ')}`);

      if (idSets.length > 0) {
        // Count how many players' histories contain each match ID
        const idCount = new Map();
        for (const idSet of idSets) {
          for (const id of idSet) {
            idCount.set(id, (idCount.get(id) || 0) + 1);
          }
        }

        // Keep matches appearing in ≥3 players' histories = definitely a team match
        // (PUGs/solos only have 1 player from the roster)
        const threshold = Math.min(3, idSets.length);
        const teamMatchIds = [...idCount.entries()]
          .filter(([, count]) => count >= threshold)
          .map(([id]) => id);

        console.log(`[history] ${teamMatchIds.length} matches appear in ≥${threshold} player histories`);
        matchIds = teamMatchIds;
      }
    }

    if (matchIds.length < 5 && oppPlayers.length > 0) {  // fallback: widen to ≥2 player overlap
      dataSource = 'players';
      // Fetch history for all 5 roster players.
      // Use a match-ID frequency count: only keep matches that appear in
      // at least 3 players' histories. This ensures we only get team matches
      // (PUGs only have 1-2 players from the same roster).
      const playerHistories = await Promise.allSettled(
        oppPlayers.slice(0, 5).map(pid =>
          faceit(`/players/${pid}/history?game=cs2&offset=0&limit=${HISTORY_LIMIT}`).then(r => r.data)
        )
      );
      const idSets = playerHistories
        .filter(r => r.status === 'fulfilled' && r.value?.items)
        .map(r => new Set(r.value.items.map(m => m.match_id || m.matchId).filter(Boolean)));

      if (!idSets.length) return res.status(400).json({ error: `No history for "${oppName}".` });

      // Count how many players' histories contain each match ID
      const idCount = new Map();
      for (const idSet of idSets) {
        for (const id of idSet) {
          idCount.set(id, (idCount.get(id) || 0) + 1);
        }
      }
      // Keep matches appearing in ≥2 players' histories
      const teamMatchIds = [...idCount.entries()]
        .filter(([, count]) => count >= 2)
        .map(([id]) => id);
      matchIds = teamMatchIds;
      console.log(`[history] fallback: ${teamMatchIds.length} matches via ≥2 player overlap`);
    }

    if (!matchIds.length) return res.status(400).json({ error: `No CS2 matches found for "${oppName}".` });

    // Fetch all match details
    const slice   = matchIds.slice(0, MATCH_LIMIT);
    const details = [];
    for (let i = 0; i < slice.length; i += 10) {
      const results = await Promise.allSettled(
        slice.slice(i, i + 10).map(id => faceit(`/matches/${id}`).then(r => r.data))
      );
      for (const r of results) if (r.status === 'fulfilled' && r.value) details.push(r.value);
    }

    if (!details.length) return res.status(400).json({ error: `Could not load matches for "${oppName}".` });

    // ── CORE LINEUP DETECTION ────────────────────────────────────────────────
    // Build a frequency map of which players appear on the opponent's side
    // across all fetched matches. Players appearing in ≥30% of matches are
    // considered "core" — this handles roster changes across seasons.
    const playerMatchCount = new Map();
    let totalMatchesForFreq = 0;

    for (const m of details) {
      const mTeams = m.teams || {};
      for (const [, t] of Object.entries(mTeams)) {
        if (!t) continue;
        const ids = (t.roster || t.players || []).map(p => p.player_id || p.id);
        // Check if this is the opponent's side by seeing if any known opp players are here
        const oppOverlap = ids.filter(id => oppPlayers.includes(id));
        if (oppOverlap.length >= 2) {
          // This is their side — count all players on it
          totalMatchesForFreq++;
          for (const id of ids) {
            playerMatchCount.set(id, (playerMatchCount.get(id) || 0) + 1);
          }
          break;
        }
      }
    }

    // Core = any player who appeared in ≥20% of their matches (catches subs too)
    const threshold = Math.max(2, Math.floor(totalMatchesForFreq * 0.20));
    const coreLineup = new Set(
      [...playerMatchCount.entries()]
        .filter(([, count]) => count >= threshold)
        .map(([id]) => id)
    );

    // If frequency approach yields nothing (e.g. too few matches), fall back to roster
    if (coreLineup.size < 3) {
      for (const pid of oppPlayers) coreLineup.add(pid);
    }

    const corePlayerIds = [...coreLineup];
    console.log(`[core] ${coreLineup.size} core players (threshold: ${threshold}/${totalMatchesForFreq} matches)`);

    // ── FILTER BY COMPETITION TYPE ─────────────────────────────────────────
    // Only keep league, championship and tournament matches — exclude PUGs and hubs.
    // Match details expose this via game_type, match_type, or competition fields.
    const isCompetitionMatch = m => {
      // team endpoint already scoped to that team's matches — always include
      if (dataSource === 'team') return true;
      // competition_type is the most reliable field:
      //   'championship' = ESEA/FACEIT league match
      //   'hub'          = hub match (exclude)
      //   undefined/''   = PUG (exclude)
      const ct = (m.competition_type || '').toLowerCase();
      if (ct === 'hub') return false;      // explicitly exclude hubs
      if (ct === 'championship') return true; // ESEA/league matches
      // Some matches have competition_type missing — fall back to name heuristic
      const cn = (m.competition_name || m.championship_name || '').toLowerCase();
      if (/s\d{2,3}\s/i.test(cn)) return true;  // e.g. "S57 EU Entry D"
      if (cn.includes('esea') || cn.includes('league') || cn.includes('open') ||
          cn.includes('intermediate') || cn.includes('premier') || cn.includes('championship') ||
          cn.includes('regular season') || cn.includes('playoffs')) return true;
      // No competition name at all = PUG
      if (!cn) return false;
      return false;
    };

    // Filter to only championship/league/tournament matches.
    // The match object exposes entity.type which is the most reliable field:
    //   'championship' = ESEA/FACEIT league or tournament (KEEP)
    //   'hub'          = private hub match (EXCLUDE)
    //   'matchmaking'  = FACEIT PUG queue (EXCLUDE)
    // Also check competition_type as a fallback.
    const isLeagueMatch = m => {
      const entityType = (m.entity?.type || m.competition_type || '').toLowerCase();
      if (entityType === 'championship') return true;
      if (entityType === 'hub')          return false;
      if (entityType === 'matchmaking')  return false;
      // Check entity/competition name for ESEA patterns
      const name = (m.entity?.name || m.competition_name || m.championship_name || '').toLowerCase();
      if (!name) return false; // no name = PUG, exclude
      // Explicit hub/PUG signals in name
      if (name.includes('queue') || name.includes('matchmaking')) return false;
      // League/tournament signals
      if (name.match(/s\d{2,3}/i)) return true; // S56, S57 etc
      if (name.includes('esea') || name.includes('league') || name.includes('open') ||
          name.includes('intermediate') || name.includes('premier') || name.includes('masters') ||
          name.includes('championship') || name.includes('regular season') ||
          name.includes('playoffs') || name.includes('qualifier') || name.includes('tournament') ||
          name.includes('cup') || name.includes('series')) return true;
      return false;
    };

    const competitionDetails = details.filter(isLeagueMatch);
    const excludedByType = details.length - competitionDetails.length;
    if (excludedByType > 0) console.log(`[filter] dropped ${excludedByType} non-league matches (PUGs/hubs/matchmaking)`);

    // ── FILTER MATCHES ───────────────────────────────────────────────────────
    // 1. Drop forfeits and BYEs — these have no veto and skew the data.
    //    Identifiable by: status contains 'forfeit'/'bye', OR voting is empty,
    //    OR results contain 'walkover'/'forfeit', OR no map was played.
    const isForfeitOrBye = m => {
      const status = (m.status || '').toLowerCase();
      if (status.includes('forfeit') || status.includes('bye') || status.includes('walkover')) return true;
      // No voting data at all = no veto happened
      const entities = m.voting?.map?.entities || [];
      const pick     = m.voting?.map?.pick || [];
      if (entities.length === 0 && pick.length === 0) return true;
      // Check results for forfeit signals
      const detailStr = JSON.stringify(m.results || '').toLowerCase();
      if (detailStr.includes('forfeit') || detailStr.includes('walkover')) return true;
      return false;
    };

    const playedDetails = competitionDetails.filter(m => !isForfeitOrBye(m));
    const forfeitCount  = competitionDetails.length - playedDetails.length;
    if (forfeitCount > 0) console.log(`[filter] dropped ${forfeitCount} forfeit/bye matches`);

    // 2. Only keep matches where ≥3 of ANY known opponent players appeared on one side.
    // For team endpoint: use the full coreLineup (frequency-built).
    // Key insight: coreLineup includes ALL players who played for this team historically,
    // so even with roster changes, old matches still pass.
    const coreDetails = playedDetails.filter(m => {
      const mTeams = m.teams || {};
      for (const [, t] of Object.entries(mTeams)) {
        if (!t) continue;
        const ids = (t.roster || t.players || []).map(p => p.player_id || p.id);
        if (ids.filter(id => coreLineup.has(id)).length >= 3) return true;
      }
      // Last resort: if teams are missing roster data, include the match anyway
      // (happens with some older FACEIT matches)
      const hasRosterData = Object.values(mTeams).some(t =>
        (t?.roster || t?.players || []).length > 0
      );
      if (!hasRosterData) return true;
      return false;
    });

    console.log(`[pipeline] IDs fetched: ${matchIds.length} → sliced: ${slice.length} → details loaded: ${details.length} → after competition filter: ${competitionDetails.length} → after forfeit filter: ${playedDetails.length} → after core filter: ${coreDetails.length}`);
    console.log(`[core] ${coreDetails.length}/${playedDetails.length} matches passed core lineup filter (${forfeitCount} forfeits excluded)`);
    if (coreDetails.length < playedDetails.length) {
      // Log a few dropped matches to diagnose why
      const dropped = playedDetails.filter(m => !coreDetails.includes(m)).slice(0, 3);
      for (const m of dropped) {
        const allTeamPlayers = Object.values(m.teams || {}).map(t =>
          (t.roster || t.players || []).map(p => p.player_id || p.id)
        );
        const overlaps = allTeamPlayers.map(ids => ids.filter(id => coreLineup.has(id)).length);
        console.log(`[dropped] match ${m.match_id?.slice(0,16)} competition="${m.competition_name}" overlaps=${JSON.stringify(overlaps)} core_size=${coreLineup.size}`);
      }
    }

    // ── BUILD MATCH SUMMARIES ─────────────────────────────────────────────────
    const matchSummaries = coreDetails.map(m => {
      const mId    = m.match_id || m.matchId || m.id;
      const mTeams = m.teams || {};

      // Always detect opponent faction by player overlap with coreLineup.
      // This is reliable across all match types regardless of faction slot order.
      // Falls back to oppId match if no player data is available.
      let oppFactionKey = null;
      let bestOverlap = 0;
      for (const [key, t] of Object.entries(mTeams)) {
        if (!t) continue;
        const ids = (t.roster || t.players || []).map(p => p.player_id || p.id);
        const overlap = ids.filter(id => coreLineup.has(id)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          oppFactionKey = key;
        }
      }
      // Fallback to oppId match if player overlap found nothing
      if (bestOverlap === 0) {
        for (const [key, t] of Object.entries(mTeams)) {
          if (!t) continue;
          if (t.faction_id === oppId || t.team_id === oppId) { oppFactionKey = key; break; }
        }
      }

      const winner    = m.results?.winner || m.results?.[0]?.winner || null;
      const startedAt = m.started_at || m.finished_at || null;

      // BO3 detection: voting.map.pick contains all maps played in a BO3.
      // Some ESEA matches also expose maps via voting.map.entities with status "pick".
      // Fall back to single map from game_map/map field for BO1s.
      const pickList = m.voting?.map?.pick ?? [];

      // Also check entities for explicitly picked maps (ESEA BO3 format)
      const entityPicks = (m.voting?.map?.entities || [])
        .filter(e => e.status === 'pick' || e.selected === true)
        .map(e => normalizeMap(e.guid || e.id || e.map || ''))
        .filter(Boolean);

      // Use whichever source gives us more maps
      const mapsToUse = pickList.length > entityPicks.length ? pickList : entityPicks;

      if (mapsToUse.length > 1) {
        // BO3: each map is a separate entry, W/L per map
        // For BO3 we use the overall series winner for each map entry
        // (per-map scores would need match stats endpoint)
        return mapsToUse.map(rawMap => {
          const map    = normalizeMap(rawMap);
          const oppWon = oppFactionKey ? winner === oppFactionKey : null;
          return map ? { matchId: mId, playedMap: map, oppWon, oppFactionKey, startedAt, isBo3: true } : null;
        }).filter(Boolean);
      } else {
        const playedMap = normalizeMap(mapsToUse[0] || m.game_map || m.map);
        const oppWon    = oppFactionKey ? winner === oppFactionKey : null;
        return [{ matchId: mId, playedMap, oppWon, oppFactionKey, startedAt }];
      }
    }).flat();

    // ── PLAYER STATS FROM ANALYSED MATCHES ──────────────────────────────────
    // Fetch /matches/{id}/stats for core matches and aggregate per-player.
    // This gives stats specific to this team's recent matches — more relevant
    // than lifetime averages and uses field names we know are correct.

    // Fetch profiles for display info (avatar, elo, level)
    const profileResults = await Promise.allSettled(
      corePlayerIds.map(pid => faceit(`/players/${pid}`).then(r => r.data))
    );
    const profileMap = {};
    for (const r of profileResults) {
      if (r.status === 'fulfilled' && r.value) {
        profileMap[r.value.player_id || r.value.id] = r.value;
      }
    }

    // Fetch match stats for core matches
    const matchStatsResults = await Promise.allSettled(
      coreDetails.slice(0, MATCH_LIMIT).map(async m => {
        const mid = m.match_id || m.matchId || m.id;
        const ck = `stats:${mid}`;
        const cached = await rGet(ck);
        if (cached) return { ...cached, _matchId: mid };
        const { data } = await faceit(`/matches/${mid}/stats`);
        await rSet(ck, data, 86400); // 24hr TTL — stats never change
        return { ...data, _matchId: mid };
      })
    );

    // Accumulate per-player stat totals across all matches
    // Keys match exactly what FACEIT returns in player_stats (confirmed from debug)
    const playerAcc = {};
    const toN = v => parseFloat(v) || 0;

    for (const r of matchStatsResults) {
      if (r.status !== 'fulfilled' || !r.value?.rounds) continue;
      const statsMatchId = r.value._matchId || r.value.match_id || r.value.matchId || r.value.id || '';
      for (const round of r.value.rounds) {
        for (const team of (round.teams || [])) {
          for (const player of (team.players || [])) {
            const pid = player.player_id;
            if (!coreLineup.has(pid)) continue;
            const s = player.player_stats || {};
            if (!playerAcc[pid]) {
              playerAcc[pid] = {
                matchCount: 0, roundCount: 0, matchIds: new Set(),
                kills: 0, deaths: 0, assists: 0,
                headshots: 0, hsPercent: 0,
                adr: 0, damage: 0,
                kd: 0, kr: 0,
                entryCount: 0, entryWins: 0, entryRate: 0, entrySR: 0,
                firstKills: 0,
                clutch1v1Count: 0, clutch1v1Wins: 0, clutch1v1Rate: 0,
                clutch1v2Count: 0, clutch1v2Wins: 0, clutch1v2Rate: 0,
                flashCount: 0, flashSuccesses: 0, flashSR: 0,
                utilDmg: 0,
                sniperKR: 0,
                wins: 0,
                byMap: {}, // per-map stat accumulation
              };
            }
            const acc = playerAcc[pid];
            acc.roundCount++;
            if (!acc.matchIds.has(statsMatchId)) {
              acc.matchIds.add(statsMatchId);
              acc.matchCount++;
              // Count match win/loss only once per match (not per round in BO3)
              acc.wins += toN(s['Result']);
            }
            acc.kills       += toN(s['Kills']);
            acc.deaths      += toN(s['Deaths']);
            acc.assists     += toN(s['Assists']);
            acc.headshots   += toN(s['Headshots']);
            acc.hsPercent   += toN(s['Headshots %']);
            acc.adr         += toN(s['ADR']);
            acc.kd          += toN(s['K/D Ratio']);
            acc.kr          += toN(s['K/R Ratio']);
            acc.entryCount  += toN(s['Entry Count']);
            acc.entryWins   += toN(s['Entry Wins']);
            acc.entryRate   += toN(s['Match Entry Rate']);
            acc.entrySR     += toN(s['Match Entry Success Rate']);
            acc.firstKills  += toN(s['First Kills']);
            acc.clutch1v1Count += toN(s['1v1Count']);
            acc.clutch1v1Wins  += toN(s['1v1Wins']);
            acc.clutch1v1Rate  += toN(s['Match 1v1 Win Rate']);
            acc.clutch1v2Count += toN(s['1v2Count']);
            acc.clutch1v2Wins  += toN(s['1v2Wins']);
            acc.clutch1v2Rate  += toN(s['Match 1v2 Win Rate']);
            acc.flashCount      += toN(s['Flash Count']);
            acc.flashSuccesses  += toN(s['Flash Successes']);
            acc.flashSR         += toN(s['Flash Success Rate per Match']);
            acc.utilDmg         += toN(s['Utility Damage per Round in a Match'] || s['Utility Damage per Round'] || 0);
            acc.sniperKR        += toN(s['Sniper Kill Rate per Round']);

            // Per-map accumulation — round.round_stats.Map gives the map name
            const roundMap = normalizeMap(round.round_stats?.Map || round.round_stats?.map || '');
            if (roundMap) {
              if (!acc.byMap[roundMap]) acc.byMap[roundMap] = { matchCount: 0, roundCount: 0, matchIds: new Set(), kd: 0, adr: 0, kills: 0, deaths: 0, wins: 0 };
              const bm = acc.byMap[roundMap];
              bm.roundCount++;
              bm.kd    += toN(s['K/D Ratio']);
              bm.adr   += toN(s['ADR']);
              bm.kills += toN(s['Kills']);
              bm.deaths += toN(s['Deaths']);
              // Count match + win only once per unique match on this map
              if (!bm.matchIds.has(statsMatchId)) {
                bm.matchIds.add(statsMatchId);
                bm.matchCount++;
                bm.wins += toN(s['Result']);
              }
            }
          }
        }
      }
    }


    // roundCount = total map entries (BO3 = 2-3 per match)
    // matchCount = unique matches (what the user sees as "games")
    // Stats accumulate per round entry, so average by roundCount
    const avg = (acc, key) => acc.roundCount > 0 ? acc[key] / acc.roundCount : 0;

    // Build player objects
    const rawPlayers = corePlayerIds
      .filter(pid => playerAcc[pid]?.roundCount > 0 || profileMap[pid])
      .map(pid => {
        const profile = profileMap[pid] || {};
        const acc     = playerAcc[pid] || { matchCount: 0, roundCount: 0 };
        const n       = acc.roundCount || 1;

        const nickname = profile.nickname || nicknameMap[pid] || pid;
        const avatar   = profile.avatar   || null;
        const level    = profile.games?.cs2?.skill_level || null;
        const elo      = profile.games?.cs2?.faceit_elo  || null;
        const matches  = acc.matchCount;

        // Averaged stats
        const kd        = acc.deaths > 0 ? Math.round((acc.kills / acc.deaths) * 100) / 100 : acc.kills;
        const hs        = avg(acc, 'hsPercent');
        const adr       = avg(acc, 'adr');
        const winRate   = matches > 0 ? (acc.wins / matches) * 100 : 0;
        const entryRate = avg(acc, 'entryRate');
        const entrySR   = avg(acc, 'entrySR');
        const firstKills = avg(acc, 'firstKills');
        const clutch1v1 = avg(acc, 'clutch1v1Rate');
        const clutch1v2 = avg(acc, 'clutch1v2Rate');
        const flashSR   = avg(acc, 'flashSR');
        const utilDmg   = avg(acc, 'utilDmg');
        const assists   = avg(acc, 'assists');
        const sniperKR  = avg(acc, 'sniperKR');

        // Build stats object matching field names used by deriveRoleScores
        const statsForRole = {
          'K/D Ratio': kd, 'Headshots %': hs, 'ADR': adr,
          'Match Entry Rate': entryRate, 'Match Entry Success Rate': entrySR,
          'Match 1v1 Win Rate': clutch1v1, 'Match 1v2 Win Rate': clutch1v2,
          'Flash Success Rate per Match': flashSR,
          'Utility Damage per Round in a Match': utilDmg,
          'Assists': assists, 'Sniper Kill Rate per Round': sniperKR,
          'First Kills': firstKills,
          'Flash Successes': acc.flashSuccesses / n,
          'Double Kills': avg(acc, 'multiKills') || 0,
          'Triple Kills': 0,
          'Quadro Kills': 0,
        };
        const roleData = deriveRoleScores(statsForRole);

        // Build per-map averages
        const byMap = {};
        for (const [map, bm] of Object.entries(acc.byMap || {})) {
          if (bm.matchCount > 0) {
            const bmN = bm.roundCount || bm.matchCount;
            byMap[map] = {
              matches: bm.matchCount,
              kd:  bm.deaths > 0 ? Math.round((bm.kills / bm.deaths) * 100) / 100 : bm.kills,
              adr: Math.round(bm.adr / bmN),
              wr:  Math.round((bm.wins / bm.matchCount) * 100),
            };
          }
        }

        return {
          pid, nickname, avatar, level, elo, matches,
          roleScores: roleData.scores,
          impactScore: roleData.impactScore,
          sniperKR,
          kd, hs: `${Math.round(hs)}%`, hsRaw: hs, adr, winRate,
          entryRate, entrySR, firstKills,
          clutch1v1, clutch1v2,
          flashSR, utilDmg, assists,
          byMap,
        };
      });

    // ── RELATIVE ROLE ASSIGNMENT ──────────────────────────────────────────────
    // Assign roles by comparing players against each other, not absolute values.
    // This prevents everyone getting "Support" when stats are uniformly low.
    const roleScoresList = rawPlayers.map(p => ({
      ...p.roleScores,
      sniperKR: p.sniperKR,
      entryRate: p.entryRate,
      impactScore: p.impactScore,
      scores: p.roleScores,
    }));
    const assignedRoles = assignRoles(roleScoresList);

    // Traits based on individual stats
    const withRoles = rawPlayers.map((p, i) => {
      const role = assignedRoles[i];
      let trait = null;
      if (p.clutch1v1 > 0.55 && role !== 'Lurker') trait = 'Clutch';
      if (p.hsRaw > 65)                                                  trait = 'Headshotter';
      if (p.sniperKR > 0.08 && role !== 'AWPer')                        trait = 'Part-time AWP';
      if (p.entryRate > 0.28 && role !== 'Entry Fragger')                       trait = 'Aggressive';
      return { ...p, role, trait, roleScores: undefined };
    });

    // Promote top Rifler to Star Rifler
    const riflers = withRoles.filter(p => p.role === 'Rifler').sort((a, b) => b.impactScore - a.impactScore);
    let starPid = null;
    if (riflers.length >= 1) {
      const top = riflers[0];
      const rest = riflers.slice(1);
      const teamKds = withRoles.map(p => p.kd).sort((a, b) => b - a);
      const isTopKd = teamKds.indexOf(top.kd) <= 1;
      const clearlyAhead = rest.length === 0 || top.impactScore > (rest[0]?.impactScore || 0) * 1.15;
      if (isTopKd && clearlyAhead) starPid = top.pid;
    }

    const players = withRoles.map(p => ({
      ...p,
      role: p.pid === starPid ? 'Star Rifler' : p.role,
      impactScore: undefined,
    }));

    // ── FORM GUIDE ───────────────────────────────────────────────────────────
    // Deduplicate by matchId (BO3s produce multiple summaries per match).
    // Use the series winner (oppWon from first entry of each match — they all share same winner).
    // Sort by startedAt descending, most recent first.
    const formByMatch = new Map();
    for (const s of matchSummaries) {
      if (!formByMatch.has(s.matchId) && s.oppWon !== null) {
        formByMatch.set(s.matchId, { result: s.oppWon ? 'W' : 'L', map: s.playedMap, matchId: s.matchId, startedAt: s.startedAt });
      }
    }
    const formGuide = [...formByMatch.values()]
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, 10)
      .map(({ result, map, matchId }) => ({ result, map, matchId }));

    // ── MY TEAM STATS ────────────────────────────────────────────────────────
    // Uses the same player-intersection approach as opponent analysis to ensure
    // we only get ESEA matches, not PUGs/hubs. Core lineup = 3+ players together.
    let myTeamStats = null;
    if (myTeamData) {
      const myRoster  = (myTeamData.roster || myTeamData.players || []);
      const myPlayers = myRoster.map(p => p.player_id || p.id).filter(Boolean);
      const myName    = myTeamData.name || myTeamData.faction_name || 'My Team';
      const myId      = myTeamData.faction_id || myTeamData.team_id;

      // Step 1: Get match IDs via player intersection (same as opponent — finds ESEA matches)
      let myMatchIds = [];
      try {
        const { data: hist } = await faceit(`/teams/${myId}/history?game=cs2&offset=0&limit=${HISTORY_LIMIT}`);
        myMatchIds = (hist.items || []).map(m => m.match_id || m.matchId).filter(Boolean);
      } catch {}

      if (myMatchIds.length === 0 && myPlayers.length >= 2) {
        const myHistResults = await Promise.allSettled(
          myPlayers.slice(0, 5).map(pid =>
            faceit(`/players/${pid}/history?game=cs2&offset=0&limit=${HISTORY_LIMIT}`).then(r => r.data)
          )
        );
        const myIdSets = myHistResults
          .filter(r => r.status === 'fulfilled' && r.value?.items)
          .map(r => new Set(r.value.items.map(m => m.match_id || m.matchId).filter(Boolean)));

        if (myIdSets.length > 0) {
          const idCount = new Map();
          for (const s of myIdSets) for (const id of s) idCount.set(id, (idCount.get(id) || 0) + 1);
          const threshold = Math.min(3, myIdSets.length);
          myMatchIds = [...idCount.entries()]
            .filter(([, c]) => c >= threshold)
            .map(([id]) => id);
          console.log(`[myTeam] ${myMatchIds.length} matches via ≥${threshold} player frequency`);
        }
      }

      // Step 2: Fetch match details in batches
      const myDetails = [];
      const mySlice = myMatchIds.slice(0, MATCH_LIMIT);
      for (let i = 0; i < mySlice.length; i += 5) {
        const chunk = await Promise.allSettled(
          mySlice.slice(i, i + 5).map(id => faceit(`/matches/${id}`).then(r => r.data))
        );
        for (const r of chunk) if (r.status === 'fulfilled' && r.value) myDetails.push(r.value);
      }

      // Step 3: Filter to competition matches + core lineup + no forfeits
      const myLineup = new Set(myPlayers);
      const myCoreDets = myDetails
        .filter(isCompetitionMatch)
        .filter(m => !isForfeitOrBye(m))
        .filter(m => {
          for (const [, t] of Object.entries(m.teams || {})) {
            const ids = (t.roster || t.players || []).map(p => p.player_id || p.id);
            if (ids.filter(id => myLineup.has(id)).length >= 3) return true;
          }
          return false;
        });

      console.log(`[myTeam] ${myCoreDets.length}/${myDetails.length} core matches for ${myName}`);

      // Step 4: Aggregate map win rates from core matches only
      const myPlayCounts = {}, myWinCounts = {};
      for (const m of myCoreDets) {
        const winner = m.results?.winner || m.results?.[0]?.winner || null;
        const pick   = m.voting?.map?.pick ?? [];
        const maps   = pick.length > 0
          ? pick.map(normalizeMap).filter(Boolean)
          : [normalizeMap(m.game_map || m.map)].filter(Boolean);

        // Find which faction my team is
        let myFk = null;
        for (const [k, t] of Object.entries(m.teams || {})) {
          const ids = (t.roster || t.players || []).map(p => p.player_id || p.id);
          if (ids.filter(id => myLineup.has(id)).length >= 3) { myFk = k; break; }
        }
        const myWon = myFk ? winner === myFk : null;
        for (const map of maps) {
          myPlayCounts[map] = (myPlayCounts[map] || 0) + 1;
          if (myWon) myWinCounts[map] = (myWinCounts[map] || 0) + 1;
        }
      }

      const myMapStats = {};
      for (const map of ACTIVE_MAP_POOL) {
        const g = myPlayCounts[map] || 0;
        const w = myWinCounts[map]  || 0;
        myMapStats[map] = { played: g, wins: w, wr: g ? Math.round((w / g) * 100) : null };
      }

      myTeamStats = { name: myName, mapStats: myMapStats, matchesAnalysed: myCoreDets.length };
    }

    // ── Reuse early roster data for Core/Substitute tagging ────────────────
    const teamRoster = teamRosterEarly;
    if (teamRoster) {
      console.log(`[roster] ${teamRoster.length} registered members (${teamRoster.filter(m => m.gameRole === 'Core').length} core, ${teamRoster.filter(m => m.gameRole === 'Substitute').length} subs)`);
    }

    // Tag players with teamRole and filter to registered members only
    let taggedPlayers = players;
    if (teamRoster) {
      const rosterMap = Object.fromEntries(teamRoster.map(m => [m.id, m]));
      taggedPlayers = players
        .filter(p => rosterMap[p.pid])
        .map(p => ({
          ...p,
          teamRole: rosterMap[p.pid]?.gameRole || null,
        }));
      // If filtering removed everyone (API mismatch), fall back to all players
      if (taggedPlayers.length === 0) taggedPlayers = players;
    }

    const responseData = {
      opponent: { name: oppName, avatar: oppAvatar, id: oppId, playerCount: oppPlayers.length },
      matchSummaries,
      coreLineupSize: corePlayerIds.length,
      matchesFiltered: { total: competitionDetails.length, forfeits: forfeitCount, afterCoreFilter: coreDetails.length },
      players: taggedPlayers,
      formGuide,
      myTeamStats,
      dataSource,
    };
    await rSet(cacheKey, responseData, 600); // 10 min TTL
    res.json(responseData);
  } catch (err) {
    const s = err.response?.status;
    if (s === 401) return res.status(401).json({ error: 'Invalid FACEIT API key.' });
    if (s === 404) return res.status(404).json({ error: 'Match room not found.' });
    if (s === 429) return res.status(503).json({ error: 'FACEIT rate limit hit. Please retry shortly.' });
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stats', (req, res) => {
  const { matchSummaries, bansByMatchId, excludeMaps: excludeRaw, myPermaBans: permaBanRaw,
          internalStatsByMatchId, oppTeamId } = req.body;
  const excludeMaps  = (excludeRaw  || '').split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
  const myPermaBans  = (permaBanRaw || '').split(',').map(m => m.trim()).filter(Boolean);
  const isExcluded   = map => excludeMaps.some(ex => map.toLowerCase().includes(ex));

  const banCounts = {}, playCounts = {}, winCounts = {}, pickCounts = {}, deciderCounts = {};
  let totalWins = 0, totalLosses = 0;
  const countedMatchIds = new Set();

  for (const { matchId, playedMap, oppWon } of (matchSummaries || [])) {
    if (!countedMatchIds.has(matchId)) {
      countedMatchIds.add(matchId);
      if (oppWon === true)  totalWins++;
      if (oppWon === false) totalLosses++;
      for (const map of (bansByMatchId?.[matchId] || [])) {
        if (isExcluded(map)) continue;
        banCounts[map] = (banCounts[map] || 0) + 1;
      }
    }
    if (playedMap && !isExcluded(playedMap)) {
      playCounts[playedMap] = (playCounts[playedMap] || 0) + 1;
      if (oppWon === true) winCounts[playedMap] = (winCounts[playedMap] || 0) + 1;
      deciderCounts[playedMap] = (deciderCounts[playedMap] || 0) + 1;
    }
  }

  const activePool = ACTIVE_MAP_POOL.filter(m => !isExcluded(m));
  const allMaps    = new Set([...activePool, ...Object.keys(playCounts)]);
  const winRates = {}, adjWinRates = {};

  for (const map of allMaps) {
    const g = playCounts[map] || 0, w = winCounts[map] || 0;
    winRates[map]    = g ? Math.round((w / g) * 100) : 0;
    adjWinRates[map] = Math.round(adjWinRate(w, g) * 100);
  }

  const totalGames     = totalWins + totalLosses;
  const overallWR      = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const sortedBans     = Object.entries(banCounts).sort((a, b) => b[1] - a[1]);
  const sortedPlayed   = Object.entries(playCounts).sort((a, b) => b[1] - a[1]);
  const mapsWithSample = [...allMaps].filter(m => (playCounts[m] || 0) >= 3);
  const mapsWithAnyGame = [...allMaps].filter(m => (playCounts[m] || 0) >= 1);
  const mapPool = mapsWithSample.length >= 2 ? mapsWithSample : mapsWithAnyGame;

  const mostBanned = sortedBans[0]?.[0]   || null;
  const mostPlayed = sortedPlayed[0]?.[0] || null;
  const bestMap    = [...mapPool].sort((a, b) => adjWinRates[b] - adjWinRates[a])[0] || null;
  const worstMap   = [...mapPool].sort((a, b) => adjWinRates[a] - adjWinRates[b])[0] || null;

  // Pass myPermaBans so recommendation avoids suggesting maps we already plan to ban
  const recommendation = buildRecommendation(playCounts, winCounts, banCounts,
    excludeMaps, activePool, myPermaBans);

  console.log(`[stats] ${countedMatchIds.size} matches | bans: ${JSON.stringify(sortedBans.slice(0,3))}`);

  res.json({
    totalWins, totalLosses, overallWR,
    banCounts, playCounts, winCounts, winRates, adjWinRates,
    pickCounts, deciderCounts,
    mostBanned, mostPlayed, bestMap, worstMap,
    banRate: mostBanned && countedMatchIds.size
      ? Math.round(((banCounts[mostBanned] || 0) / countedMatchIds.size) * 100) : 0,
    recommendation,
    sampleSize: { matches: countedMatchIds.size },
    activePool,
    myPermaBans,
  });
});



// Enrich a list of match IDs with opponent ELO diff



// Claude API proxy — browser can't call Anthropic directly due to CORS



// Debug: dumps full voting + results structure for a match



// Proxy for FACEIT internal stats API
// GET /api/stats-proxy/:matchId — returns per-map per-player stats with KAST etc.
app.get('/api/stats-proxy/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const cookie = req.headers['x-faceit-cookie'] || req.headers.cookie || '';
  try {
    const { data } = await axios.get(
      `https://www.faceit.com/api/stats/v3/matches/${matchId}`,
      {
        httpsAgent,
        headers: {
          'Accept': 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
          'faceit-referer': 'web-next',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 10000,
      }
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 502).json({ error: err.response?.data || err.message });
  }
});


/**
 * Aggregate player stats from FACEIT internal stats API data (fetched browser-side).
 * POST /api/player-stats
 * Body: { internalStatsByMatchId, corePlayerIds, oppTeamId, profileMap }
 *
 * The internal API returns per-map data with fields:
 *   entryAttemptsRate (0-100%), entrySuccess (0-100%), clutchSuccess (0-100%),
 *   flashSuccess (0-100%), kd, adr, kast, 1v1Wins, 1v1Losses etc.
 */
app.post('/api/player-stats', async (req, res) => {
  const { internalStatsByMatchId, corePlayerIds, oppTeamId } = req.body;

  if (!internalStatsByMatchId || !corePlayerIds?.length) {
    return res.json({ players: [] });
  }

  // Fetch profiles for display info
  const profileResults = await Promise.allSettled(
    corePlayerIds.map(pid => faceit(`/players/${pid}`).then(r => r.data))
  );
  const profileMap = {};
  for (const r of profileResults) {
    if (r.status === 'fulfilled' && r.value) {
      profileMap[r.value.player_id || r.value.id] = r.value;
    }
  }

  const coreSet = new Set(corePlayerIds);
  const toN = v => parseFloat(v) || 0;
  const playerAcc = {};

  for (const [matchId, mapEntries] of Object.entries(internalStatsByMatchId)) {
    if (!Array.isArray(mapEntries)) continue;
    for (const mapEntry of mapEntries) {
      const mapName = normalizeMap(mapEntry.map || '');
      for (const team of (mapEntry.teams || [])) {
        // Only process the opponent's team
        const isOppTeam = team.teamId === oppTeamId ||
          (team.players || []).some(p => coreSet.has(p.playerId));
        if (!isOppTeam) continue;

        for (const p of (team.players || [])) {
          const pid = p.playerId;
          if (!coreSet.has(pid)) continue;

          if (!playerAcc[pid]) {
            // Log field names once to confirm sniper field name
            playerAcc[pid] = {
              matchCount: 0, roundCount: 0, matchIds: new Set(),
              kd: 0, adr: 0, hsRate: 0, kast: 0,
              kills: 0, deaths: 0, assists: 0,
              entryAttempts: 0, entryKills: 0, entrySuccess: 0,
              clutchRounds: 0, clutchRoundsWon: 0, clutchSuccess: 0,
              vl1Wins: 0, vl1Count: 0, vl2Wins: 0, vl2Count: 0,
              flashSuccess: 0, utilityDmg: 0,
              sniperKR: 0,
              multiKills: 0, wins: 0,
              byMap: {},
            };
          }
          const acc = playerAcc[pid];
          acc.roundCount++;
          if (!acc.matchIds.has(matchId)) {
            acc.matchIds.add(matchId);
            acc.matchCount++;
            // Count match win only once per match
            acc.wins += team.score > (mapEntry.teams.find(t => t.teamId !== team.teamId)?.score || 0) ? 1 : 0;
          }
          acc.kd            += toN(p.kd);
          acc.adr           += toN(p.adr);
          acc.hsRate        += toN(p.hsRate);
          acc.kast          += toN(p.kast);
          acc.kills         += toN(p.kills);
          acc.deaths        += toN(p.deaths);
          acc.assists       += toN(p.assists);
          // Entry: entryAttemptsRate is % of rounds (0-100), entrySuccess is % won (0-100)
          acc.entryAttempts += toN(p.entryAttempts);
          acc.entryKills    += toN(p.entryKills);
          // Convert percentages to 0-1 rates for internal consistency
          acc.entrySuccess  += toN(p.entrySuccess) / 100;
          acc.clutchRounds  += toN(p.clutchRounds);
          acc.clutchRoundsWon += toN(p.clutchRoundsWon);
          acc.clutchSuccess += toN(p.clutchSuccess) / 100;
          acc.vl1Wins       += toN(p['1v1Wins']);
          acc.vl1Count      += toN(p['1v1Wins']) + toN(p['1v1Losses']);
          acc.vl2Wins       += toN(p['1v2Wins']);
          acc.vl2Count      += toN(p['1v2Wins']) + toN(p['1v2Losses']);
          acc.flashSuccess  += toN(p.flashSuccess) / 100;
          acc.utilityDmg    += toN(p.utilityDmg) / Math.max(1, toN(p.roundsPlayed));
          // sniperKR field name varies by API version — try all known variants
          acc.sniperKR      += toN(p.sniperKR) || toN(p.sniper_kill_rate) ||
                               (toN(p.sniperKills) / Math.max(1, toN(p.roundsPlayed))) ||
                               (toN(p.sniper_kills) / Math.max(1, toN(p.rounds_played)));
          acc.multiKills    += toN(p['2k'] || 0) + toN(p['3k'] || 0) * 1.5 + toN(p['4k'] || 0) * 3;

          // Per-map tracking
          if (mapName) {
            if (!acc.byMap[mapName]) acc.byMap[mapName] = { matchCount: 0, kd: 0, adr: 0, wins: 0 };
            const bm = acc.byMap[mapName];
            bm.matchCount++;
            bm.kd  += toN(p.kd);
            bm.adr += toN(p.adr);
            bm.wins += team.score > (mapEntry.teams.find(t => t.teamId !== team.teamId)?.score || 0) ? 1 : 0;
          }
        }
      }
    }
  }

  const avg = (acc, key) => acc.roundCount > 0 ? acc[key] / acc.roundCount : 0;

  const rawPlayers = corePlayerIds
    .filter(pid => playerAcc[pid]?.roundCount > 0)
    .map(pid => {
      const profile = profileMap[pid] || {};
      const acc     = playerAcc[pid];
      const n       = acc.roundCount;

      const kd       = avg(acc, 'kd');
      const hs       = avg(acc, 'hsRate');
      const adr      = avg(acc, 'adr');
      const winRate  = acc.matchCount > 0 ? (acc.wins / acc.matchCount) * 100 : 0;

      // Entry rate = avg entry attempts / rounds played — approximate from entryAttempts per match
      // entryAttemptsRate was % of rounds, stored as raw count here
      // Use entryKills/match as proxy for entryRate
      const entryRate  = n > 0 ? Math.min(acc.entryAttempts / (n * 20), 0.4) : 0; // ~20 T rounds/match
      const entrySR    = avg(acc, 'entrySuccess');
      const clutch1v1  = acc.vl1Count > 0 ? acc.vl1Wins / acc.vl1Count : avg(acc, 'clutchSuccess');
      const clutch1v2  = acc.vl2Count > 0 ? acc.vl2Wins / acc.vl2Count : 0;
      const flashSR    = avg(acc, 'flashSuccess');
      const utilDmg    = avg(acc, 'utilityDmg');
      const assists    = avg(acc, 'assists');
      const sniperKR   = avg(acc, 'sniperKR');
      const firstKills = n > 0 ? acc.entryKills / n : 0;
      const multiKills = avg(acc, 'multiKills');

      const statsForRole = {
        'K/D Ratio': kd, 'Headshots %': hs, 'ADR': adr,
        'Match Entry Rate': entryRate, 'Match Entry Success Rate': entrySR,
        'Match 1v1 Win Rate': clutch1v1, 'Match 1v2 Win Rate': clutch1v2,
        'Flash Success Rate per Match': flashSR,
        'Utility Damage per Round in a Match': utilDmg,
        'Assists': assists, 'Sniper Kill Rate per Round': sniperKR,
        'First Kills': firstKills,
        'Flash Successes': acc.flashSuccess,
        'Double Kills': multiKills,
      };
      const roleData = deriveRoleScores(statsForRole);

      const byMap = {};
      for (const [map, bm] of Object.entries(acc.byMap || {})) {
        if (bm.matchCount > 0) {
          byMap[map] = {
            matches: bm.matchCount,
            kd:  Math.round((bm.kd  / bm.matchCount) * 100) / 100,
            adr: Math.round(bm.adr  / bm.matchCount),
            wr:  Math.round((bm.wins / bm.matchCount) * 100),
          };
        }
      }

      return {
        pid,
        nickname:  profile.nickname || pid,
        avatar:    profile.avatar   || null,
        level:     profile.games?.cs2?.skill_level || null,
        elo:       profile.games?.cs2?.faceit_elo  || null,
        matches:   acc.matchCount,
        roleScores: roleData.scores,
        impactScore: roleData.impactScore,
        sniperKR,
        kd, hs: `${Math.round(hs)}%`, hsRaw: hs, adr, winRate,
        entryRate, entrySR, firstKills,
        clutch1v1, clutch1v2,
        flashSR, utilDmg, assists,
        byMap,
      };
    });

  // Relative role assignment
  const roleScoresList = rawPlayers.map(p => ({
    scores: p.roleScores,
    sniperKR: p.sniperKR,
    entryRate: p.entryRate,
    impactScore: p.impactScore,
  }));
  const assignedRoles = assignRoles(roleScoresList);

  const withRoles = rawPlayers.map((p, i) => {
    const role = assignedRoles[i];
    let trait = null;
    if (p.clutch1v1 > 0.55 && role !== 'Lurker') trait = 'Clutch';
    if (p.hsRaw > 65)                                                  trait = 'Headshotter';
    if (p.sniperKR > 0.08 && role !== 'AWPer')                        trait = 'Part-time AWP';
    if (p.entryRate > 0.28 && role !== 'Entry Fragger')                       trait = 'Aggressive';
    return { ...p, role, trait, roleScores: undefined };
  });

  const riflers = withRoles.filter(p => p.role === 'Rifler').sort((a, b) => b.impactScore - a.impactScore);
  let starPid = null;
  if (riflers.length >= 1) {
    const top = riflers[0];
    const rest = riflers.slice(1);
    const teamKds = withRoles.map(p => p.kd).sort((a, b) => b - a);
    const isTopKd = teamKds.indexOf(top.kd) <= 1;
    const clearlyAhead = rest.length === 0 || top.impactScore > (rest[0]?.impactScore || 0) * 1.15;
    if (isTopKd && clearlyAhead) starPid = top.pid;
  }

  const players = withRoles.map(p => ({
    ...p,
    role: p.pid === starPid ? 'Star Rifler' : p.role,
    impactScore: undefined,
  }));

  res.json({ players });
});


// Proxy for FACEIT match-rounds stats API — returns per-player per-match stats
// filtered to league/championship matches with matchType field
// GET /api/match-rounds-proxy/:playerId
app.get('/api/match-rounds-proxy/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const cookie = req.headers['x-faceit-cookie'] || req.headers.cookie || '';
  const limit = req.query.limit || 100;
  try {
    const { data } = await axios.get(
      `https://www.faceit.com/api/statistics/v1/cs2/players/${playerId}/match-rounds?size=${limit}`,
      {
        httpsAgent,
        headers: {
          'Accept': 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
          'faceit-referer': 'web-next',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 10000,
      }
    );
    // Filter to only competition matches on the server side
    const items = Array.isArray(data) ? data : (data?.items || data?.payload || []);
    const leagueOnly = items.filter(m => 
      m.matchType === 'league' || m.matchType === 'championship' || m.matchType === 'tournament'
    );
    res.json({ items: leagueOnly, total: leagueOnly.length });
  } catch (err) {
    res.status(err.response?.status || 502).json({ error: err.response?.data || err.message });
  }
});





// ── FACEIT OAuth2 (FACEIT Connect) ───────────────────────────────────────
const FACEIT_CLIENT_ID     = process.env.FACEIT_CLIENT_ID || '';
const FACEIT_CLIENT_SECRET = process.env.FACEIT_CLIENT_SECRET || '';
const FACEIT_REDIRECT_URI  = process.env.FACEIT_REDIRECT_URI || 'https://vetoscout.com/api/auth/callback';

// Step 1: Redirect user to FACEIT login
app.get('/api/auth/faceit', (req, res) => {
  if (!FACEIT_CLIENT_ID) return res.status(500).send('FACEIT OAuth not configured.');
  const state = require('crypto').randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: FACEIT_CLIENT_ID,
    redirect_uri: FACEIT_REDIRECT_URI,
    scope: 'openid profile',
    state,
  });
  res.redirect(`https://accounts.faceit.com?${params.toString()}`);
});

// Step 2: Handle callback — exchange code for token
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const basicAuth = Buffer.from(`${FACEIT_CLIENT_ID}:${FACEIT_CLIENT_SECRET}`).toString('base64');
    const { data: tokenData } = await axios.post('https://api.faceit.com/auth/v1/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: FACEIT_REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;

    // Decode the ID token to get user info (JWT — payload is base64)
    let userInfo = {};
    if (idToken) {
      try {
        const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
        userInfo = { guid: payload.guid || payload.sub, nickname: payload.nickname, avatar: payload.picture };
      } catch (_) {}
    }

    // If no guid from id_token, fetch from userinfo endpoint
    if (!userInfo.guid && accessToken) {
      try {
        const { data: ui } = await axios.get('https://api.faceit.com/auth/v1/resources/userinfo', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          timeout: 5000,
        });
        userInfo = { guid: ui.guid || ui.sub, nickname: ui.nickname, avatar: ui.picture };
      } catch (_) {}
    }

    console.log(`[auth] FACEIT login: ${userInfo.nickname} (${userInfo.guid})`);

    // Send back an HTML page that stores the token in sessionStorage and redirects
    res.send(`<!DOCTYPE html><html><head><title>VetoScout - Logging in...</title></head><body>
      <script>
        sessionStorage.setItem('faceit_token', ${JSON.stringify(accessToken)});
        sessionStorage.setItem('faceit_user', ${JSON.stringify(JSON.stringify(userInfo))});
        window.location.href = '/';
      </script>
      <p>Logging in... redirecting.</p>
    </body></html>`);
  } catch (e) {
    console.error('[auth] token exchange failed:', e.response?.data || e.message);
    res.status(500).send('FACEIT login failed. Please try again.');
  }
});

// Step 3: Proxy endpoint — fetch user's scheduled matches using their token
app.get('/api/auth/scheduled', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = req.query.userId;
  if (!token || !userId) return res.json({ matches: [] });

  try {
    const { data } = await axios.get(
      `https://www.faceit.com/api/match/v1/matches/groupByState?userId=${userId}`,
      {
        httpsAgent,
        headers: {
          'Accept': 'application/json',
          'faceit-referer': 'web-next',
          'Authorization': `Bearer ${token}`,
        },
        timeout: 10000,
      }
    );
    const scheduled = data?.payload?.SCHEDULED || [];
    res.json({ matches: scheduled });
  } catch (e) {
    console.log('[auth/scheduled] failed:', e.response?.status, e.message);
    // Try without auth as fallback
    try {
      const { data } = await axios.get(
        `https://www.faceit.com/api/match/v1/matches/groupByState?userId=${userId}`,
        { httpsAgent, headers: { 'Accept': 'application/json', 'faceit-referer': 'web-next' }, timeout: 10000 }
      );
      res.json({ matches: data?.payload?.SCHEDULED || [] });
    } catch (_) {
      res.json({ matches: [] });
    }
  }
});



// ── Health check for Railway ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Serve frontend in production ─────────────────────────────────────────
const path = require('path');
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});



// ── Graceful error handling ──────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[fatal] Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err?.message || err);
  process.exit(1);
});

app.listen(PORT, () => console.log(`VetoScout server running on http://localhost:${PORT}`))