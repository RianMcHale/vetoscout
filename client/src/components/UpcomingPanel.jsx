import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import styles from './UpcomingPanel.module.css';

function formatDate(isoStr) {
  if (!isoStr) return 'TBD';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = d - now;
  const days = Math.floor(diff / 86400000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 0 && diff > 0) return 'Today ' + time;
  if (days === 1) return 'Tomorrow ' + time;
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function getFaceitAuth() {
  const token = sessionStorage.getItem('faceit_token');
  const user = sessionStorage.getItem('faceit_user');
  if (!token || !user) return null;
  try { return { token, user: JSON.parse(user) }; } catch { return null; }
}

export default function UpcomingPanel({ opponentId, onSelectMatch }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [auth, setAuth] = useState(getFaceitAuth);
  const [open, setOpen] = useState(true);

  useEffect(() => { setAuth(getFaceitAuth()); }, []);

  const load = useCallback(async () => {
    if (!auth?.user?.guid) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/auth/scheduled', {
        params: { userId: auth.user.guid },
        headers: { 'Authorization': `Bearer ${auth.token}` },
        timeout: 15000,
      });

      let scheduled = data.matches || [];
      if (opponentId && scheduled.length > 0) {
        const oppMatches = scheduled.filter(m => {
          const f1 = m.teams?.faction1?.id;
          const f2 = m.teams?.faction2?.id;
          return f1 === opponentId || f2 === opponentId;
        });
        const otherMatches = scheduled.filter(m => {
          const f1 = m.teams?.faction1?.id;
          const f2 = m.teams?.faction2?.id;
          return f1 !== opponentId && f2 !== opponentId;
        });
        scheduled = [...oppMatches, ...otherMatches];
      }

      const mapped = scheduled.slice(0, 5).map(m => {
        const userInF1 = (m.teams?.faction1?.roster || []).some(p => p.id === auth.user.guid);
        const opp = userInF1 ? m.teams?.faction2 : m.teams?.faction1;
        const isOppMatch = opp?.id === opponentId;
        return {
          matchId: m.id,
          matchUrl: `https://www.faceit.com/en/cs2/room/${m.id}`,
          schedule: m.schedule,
          competition: m.entity?.name || '',
          round: m.entityCustom?.round || null,
          isOppMatch,
          opponent: { name: opp?.name || '?', avatar: opp?.avatar || null },
        };
      });

      setMatches(mapped);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [auth, opponentId]);

  useEffect(() => { if (auth) load(); }, [load, auth]);

  const handleLogout = () => {
    sessionStorage.removeItem('faceit_token');
    sessionStorage.removeItem('faceit_user');
    setAuth(null);
    setMatches(null);
  };

  // Don't render at all if not logged in and no matches
  if (!auth && !matches) {
    return (
      <div className={styles.panel}>
        <div className={styles.loginWrap}>
          <a href="/api/auth/faceit" className={styles.loginBtn}>Login with FACEIT</a>
          <div className={styles.loginNote}>See your scheduled ESEA matches</div>
        </div>
      </div>
    );
  }

  const matchCount = matches?.length || 0;

  return (
    <div className={styles.panel}>
      <div className={styles.heading} onClick={() => setOpen(v => !v)}>
        <span className={styles.headingIcon}>◈</span>
        Upcoming Matches{matchCount > 0 && ` (${matchCount})`}
        {auth && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {auth.user?.nickname}
            <button
              onClick={e => { e.stopPropagation(); handleLogout(); }}
              style={{ background: 'none', border: 'none', color: '#e05c3a', cursor: 'pointer', fontSize: '0.65rem', marginLeft: 6 }}
            >
              logout
            </button>
          </span>
        )}
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>▾</span>
      </div>

      {open && (
        <div className={styles.body}>
          {loading && (
            <div className={styles.state}>
              <div className={styles.spinner} />
              <span>Loading schedule…</span>
            </div>
          )}

          {!loading && matches && matches.length === 0 && (
            <div className={styles.state}>No upcoming matches found.</div>
          )}

          {!loading && matches && matches.length > 0 && (
            <div className={styles.list}>
              {matches.map(m => (
                <div key={m.matchId} className={styles.matchCard} style={m.isOppMatch ? { borderColor: '#e05c3a' } : {}}>
                  <div className={styles.matchTop}>
                    {m.opponent.avatar && (
                      <img className={styles.oppAvatar} src={m.opponent.avatar} alt={m.opponent.name} onError={e => e.target.style.display = 'none'} />
                    )}
                    <div className={styles.matchInfo}>
                      <div className={styles.oppName}>
                        {m.opponent.name}
                        {m.isOppMatch && <span style={{ color: '#e05c3a', fontSize: '0.65rem', marginLeft: 6 }}>● CURRENT OPP</span>}
                      </div>
                      {m.competition && <div className={styles.competition}>{m.competition}{m.round ? ` · R${m.round}` : ''}</div>}
                    </div>
                    <div className={styles.dateStr}>{formatDate(m.schedule)}</div>
                  </div>
                  <div className={styles.matchActions}>
                    <button className={styles.analyzeBtn} onClick={() => onSelectMatch(m.matchId)}>Analyse →</button>
                    <a className={styles.roomLink} href={m.matchUrl} target="_blank" rel="noreferrer">Room ↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
