import { useMemo } from 'react';
import { MAP_COLORS, winRateColor } from '../lib/maps';
import styles from './HistoryTimeline.module.css';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HistoryTimeline({ matchSummaries, bansByMatchId, opponent }) {
  const matches = useMemo(() => {
    if (!matchSummaries) return [];
    // Deduplicate by matchId, keep all maps for BO3s
    const byId = new Map();
    for (const s of matchSummaries) {
      if (!byId.has(s.matchId)) {
        byId.set(s.matchId, { ...s, maps: [s.playedMap].filter(Boolean) });
      } else {
        if (s.playedMap) byId.get(s.matchId).maps.push(s.playedMap);
      }
    }
    return [...byId.values()]
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, 30);
  }, [matchSummaries]);

  if (matches.length === 0) {
    return <div className={styles.empty}>No match history available.</div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Match History</div>
        <div className={styles.subtitle}>Last {matches.length} matches · Most recent first</div>
      </div>

      <div className={styles.timeline}>
        {matches.map((m, i) => {
          const bans = bansByMatchId?.[m.matchId] || [];
          const isWin  = m.oppWon === true;
          const isLoss = m.oppWon === false;
          const isBo3  = m.maps.length > 1;

          return (
            <div key={m.matchId} className={`${styles.row} ${isWin ? styles.rowWin : isLoss ? styles.rowLoss : ''}`}>
              {/* Result indicator */}
              <div className={`${styles.result} ${isWin ? styles.win : isLoss ? styles.loss : styles.unknown}`}>
                {isWin ? 'W' : isLoss ? 'L' : '—'}
              </div>

              {/* Date */}
              <div className={styles.date}>{formatDate(m.startedAt)}</div>

              {/* Maps played */}
              <div className={styles.maps}>
                {(m.maps.length > 0 ? m.maps : ['Unknown']).map((map, mi) => (
                  <span key={mi} className={styles.mapChip} style={{ background: `${MAP_COLORS[map] || '#888'}22`, color: MAP_COLORS[map] || '#888', border: `1px solid ${MAP_COLORS[map] || '#888'}44` }}>
                    {map || '?'}
                  </span>
                ))}
                {isBo3 && <span className={styles.bo3Badge}>BO3</span>}
              </div>

              {/* Their bans */}
              <div className={styles.bans}>
                {bans.length > 0 ? (
                  <>
                    <span className={styles.bansLabel}>Banned:</span>
                    {bans.map((ban, bi) => (
                      <span key={bi} className={styles.banChip} style={{ color: MAP_COLORS[ban] || '#888' }}>
                        {ban}
                      </span>
                    ))}
                  </>
                ) : (
                  <span className={styles.noBans}>—</span>
                )}
              </div>

              {/* Match link */}
              <a
                className={styles.link}
                href={`https://www.faceit.com/en/cs2/room/${m.matchId}`}
                target="_blank"
                rel="noreferrer"
              >
                ↗
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
