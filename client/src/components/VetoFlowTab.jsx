import { useMemo } from 'react';
import { MAP_COLORS } from '../lib/maps';
import styles from './VetoFlowTab.module.css';

const ACTIVE_POOL = ['Mirage','Inferno','Dust2','Nuke','Ancient','Anubis','Overpass'];

export default function VetoFlowTab({ bansByMatchId, matchSummaries }) {
  const banData = useMemo(() => {
    if (!bansByMatchId || !matchSummaries) return null;
    const seenMatches = new Set();
    const firstBanCounts = {}, secondBanCounts = {}, thirdBanCounts = {};
    let totalMatches = 0;

    for (const { matchId } of matchSummaries) {
      if (seenMatches.has(matchId)) continue;
      seenMatches.add(matchId);
      const bans = bansByMatchId[matchId];
      if (!bans || bans.length === 0) continue;
      totalMatches++;
      bans.forEach((map, idx) => {
        if (idx === 0) firstBanCounts[map]  = (firstBanCounts[map]  || 0) + 1;
        if (idx === 1) secondBanCounts[map] = (secondBanCounts[map] || 0) + 1;
        if (idx === 2) thirdBanCounts[map]  = (thirdBanCounts[map]  || 0) + 1;
      });
    }
    return { firstBanCounts, secondBanCounts, thirdBanCounts, totalMatches };
  }, [bansByMatchId, matchSummaries]);

  if (!banData || banData.totalMatches === 0) return null;

  const { firstBanCounts, secondBanCounts, thirdBanCounts, totalMatches } = banData;
  const pct = (count) => totalMatches > 0 ? Math.round(((count || 0) / totalMatches) * 100) : 0;

  const columns = [
    { label: 'First Ban',  counts: firstBanCounts,  color: '#e05c3a' },
    { label: 'Second Ban', counts: secondBanCounts, color: '#f0aa3c' },
    { label: 'Third Ban',  counts: thirdBanCounts,  color: '#9b7fe8' },
  ];

  // Key insight
  const topFirst = ACTIVE_POOL
    .filter(m => firstBanCounts[m] > 0)
    .sort((a, b) => (firstBanCounts[b] || 0) - (firstBanCounts[a] || 0))[0];
  const topFirstPct = topFirst ? pct(firstBanCounts[topFirst]) : 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionTitle}>Opponent Ban Patterns</div>
      <div className={styles.subtitle}>Based on {totalMatches} matches with veto data</div>

      <div className={styles.orderGrid}>
        {columns.map(({ label, counts, color }) => {
          const sorted = ACTIVE_POOL
            .filter(m => counts[m] > 0)
            .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
          if (sorted.length === 0) return null;
          return (
            <div key={label} className={styles.col}>
              <div className={styles.colLabel} style={{ color }}>{label}</div>
              <div className={styles.bars}>
                {sorted.map(map => {
                  const p = pct(counts[map] || 0);
                  return (
                    <div key={map} className={styles.bar}>
                      <div className={styles.mapName}>{map}</div>
                      <div className={styles.track}>
                        <div className={styles.fill} style={{ width: `${p}%`, background: MAP_COLORS[map] || color }} />
                      </div>
                      <div className={styles.pct}>{p}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {topFirstPct >= 40 && (
        <div className={styles.insight}>
          <span>💡</span>
          <span>
            <strong style={{ color: MAP_COLORS[topFirst] }}>{topFirst}</strong>
            {' '}is their go-to first ban in {topFirstPct}% of matches — plan your veto around this being gone immediately.
          </span>
        </div>
      )}
    </div>
  );
}
