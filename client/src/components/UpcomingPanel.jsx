import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import styles from './UpcomingPanel.module.css';

const DIFF_COLORS = {
  'Very Hard':  { text: '#e05c3a', bg: 'rgba(224,92,58,0.12)',   border: 'rgba(224,92,58,0.3)' },
  'Hard':       { text: '#f0aa3c', bg: 'rgba(240,170,60,0.12)',  border: 'rgba(240,170,60,0.3)' },
  'Even':       { text: '#8b91a8', bg: 'rgba(139,145,168,0.12)', border: 'rgba(139,145,168,0.3)' },
  'Favourable': { text: '#2dd4a4', bg: 'rgba(45,212,164,0.12)',  border: 'rgba(45,212,164,0.3)' },
  'Very Easy':  { text: '#4a9eff', bg: 'rgba(74,158,255,0.12)',  border: 'rgba(74,158,255,0.3)' },
  'Unknown':    { text: '#8b91a8', bg: 'rgba(139,145,168,0.08)', border: 'rgba(139,145,168,0.2)' },
};

function formatDate(ts) {
  if (!ts) return 'TBD';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = d - now;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Tomorrow ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days < 7)  return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Fetch FACEIT internal URL via our proxy.
// Since localhost can't receive cookies from faceit.com automatically,
// we pass the browser's document.cookie as a query param.
// This only works because VetoScout runs locally — the cookies never leave your machine.
async function proxyFetch(url) {
  const cookie = typeof document !== 'undefined' ? document.cookie : '';
  const { data } = await axios.get('/api/upcoming-proxy', {
    params: { url, cookie },
    timeout: 10000,
  });
  return data;
}

// Fetch scheduled match IDs using confirmed FACEIT internal endpoint
// https://www.faceit.com/api/match/v1/matches/groupByState?userId=<pid>
// Returns payload.SCHEDULED[] with match objects containing .id
async function fetchScheduledMatchIds(myPlayers) {
  for (const pid of myPlayers.slice(0, 3)) {
    try {
      const data = await proxyFetch(
        `https://www.faceit.com/api/match/v1/matches/groupByState?userId=${pid}`
      );
      const scheduled = data?.payload?.SCHEDULED || [];
      const matchIds  = scheduled.map(m => m.id).filter(Boolean);
      if (matchIds.length > 0) return { matchIds, rawMatches: scheduled };
    } catch { /* try next player */ }
  }
  return { matchIds: [], rawMatches: [] };
}

export default function UpcomingPanel({ myTeam, matchInput, onSelectMatch }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!myTeam || !matchInput) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      // Step 1: get team identity + my avg ELO from server
      const setupRes = await axios.get('/api/upcoming', {
        params: { myTeam, matchInput },
        timeout: 20000,
      });
      const { myAvgElo, myId, myPlayers } = setupRes.data;

      // Step 2: fetch scheduled matches via browser proxy (confirmed endpoint)
      const { matchIds, rawMatches } = await fetchScheduledMatchIds(myPlayers || []);

      if (matchIds.length === 0) {
        setData({ matches: [], myAvgElo, note: 'no_matches' });
        setLoading(false);
        return;
      }

      // Step 3: enrich with opponent ELO diff (server-side, needs API key)
      const enrichRes = await axios.post('/api/enrich-matches', {
        matchIds,
        myId,
        myAvgElo,
        myTeamName: myTeam,
        rawMatches, // pass raw data so server can skip re-fetching details
      }, { timeout: 30000 });

      setData({ matches: enrichRes.data.matches || [], myAvgElo });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load upcoming matches.');
    } finally {
      setLoading(false);
    }
  }, [myTeam, matchInput]);

  useEffect(() => { load(); }, [load]);

  if (!myTeam) return null;

  const noMatches = data && data.matches.length === 0;

  return (
    <aside className={styles.panel}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}>◈</span>
        Upcoming Matches
        {data?.myAvgElo && (
          <span className={styles.myElo}>My avg: {data.myAvgElo} ELO</span>
        )}
      </div>

      {loading && (
        <div className={styles.state}>
          <div className={styles.spinner} />
          <span>Loading schedule…</span>
        </div>
      )}

      {error && (
        <div className={styles.errorMsg}>
          ⚠ {error}
          <div className={styles.errorHint}>
            Make sure you're logged into FACEIT in this browser.
          </div>
        </div>
      )}

      {!loading && noMatches && (
        <div className={styles.state}>
          No upcoming matches found.
          <span className={styles.stateHint}>ESEA scheduling may not be available via API.</span>
        </div>
      )}

      {!loading && data?.matches.length > 0 && (
        <div className={styles.list}>
          {data.matches.map(m => {
            const dc = DIFF_COLORS[m.difficulty] || DIFF_COLORS.Unknown;
            return (
              <div key={m.matchId} className={styles.matchCard}>
                <div className={styles.matchTop}>
                  {m.opponent.avatar && (
                    <img
                      className={styles.oppAvatar}
                      src={m.opponent.avatar}
                      alt={m.opponent.name}
                      onError={e => e.target.style.display = 'none'}
                    />
                  )}
                  <div className={styles.matchInfo}>
                    <div className={styles.oppName}>{m.opponent.name}</div>
                    {m.competition && <div className={styles.competition}>{m.competition}</div>}
                  </div>
                  <div
                    className={styles.diffBadge}
                    style={{ color: dc.text, background: dc.bg, border: `1px solid ${dc.border}` }}
                  >
                    {m.difficulty}
                  </div>
                </div>

                <div className={styles.matchMeta}>
                  <span className={styles.dateStr}>{formatDate(m.scheduledAt)}</span>
                  {m.opponent.avgElo && (
                    <span className={styles.eloStr}>
                      Opp: <strong>{m.opponent.avgElo}</strong>
                      {m.diffScore != null && (
                        <span style={{ color: m.diffScore > 0 ? '#e05c3a' : '#2dd4a4', marginLeft: 4 }}>
                          ({m.diffScore > 0 ? '+' : ''}{m.diffScore})
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div className={styles.matchActions}>
                  <button className={styles.analyzeBtn} onClick={() => onSelectMatch(m.matchUrl)}>
                    Analyse →
                  </button>
                  <a className={styles.roomLink} href={m.matchUrl} target="_blank" rel="noreferrer">
                    Room ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
