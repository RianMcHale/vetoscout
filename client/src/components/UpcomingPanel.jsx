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

export default function UpcomingPanel({ opponentId, onSelectMatch }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!opponentId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/upcoming/${opponentId}`, { timeout: 15000 });
      setMatches(data.matches || []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [opponentId]);

  useEffect(() => { load(); }, [load]);

  if (!opponentId || loading) return null;
  if (!matches || matches.length === 0) return null;

  return (
    <aside className={styles.panel}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}>◈</span>
        Upcoming Matches
      </div>
      <div className={styles.list}>
        {matches.map(m => (
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
                {m.competition && <div className={styles.competition}>{m.competition}{m.round ? ` · R${m.round}` : ''}</div>}
              </div>
              <div className={styles.dateStr}>{formatDate(m.schedule)}</div>
            </div>
            <div className={styles.matchActions}>
              <button className={styles.analyzeBtn} onClick={() => onSelectMatch(m.matchId)}>
                Analyse →
              </button>
              <a className={styles.roomLink} href={m.matchUrl} target="_blank" rel="noreferrer">
                Room ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
