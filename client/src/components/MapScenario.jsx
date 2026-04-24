import { getScenario } from '../lib/maps';
import { MAP_COLORS } from '../lib/maps';
import styles from './MapScenario.module.css';

function pillClass(wr) {
  if (wr >= 60) return styles.danger;
  if (wr >= 45) return styles.warn;
  if (wr <= 25) return styles.safe;
  return styles.info;
}

export default function MapScenario({ stats, poolMaps }) {
  const { oppWillBan, remaining, likelyMaps } = getScenario(stats, poolMaps);

  return (
    <div className={styles.section}>
      <div className={styles.heading}>Map Pool After Their Bans</div>
      <p className={styles.desc}>
        After opponent bans{' '}
        <strong>{oppWillBan.join(' + ')}</strong>, these maps remain:
      </p>

      <div className={styles.pills}>
        {remaining.map(m => {
          const wr = stats.winRates[m] || 0;
          return (
            <span key={m} className={`${styles.pill} ${pillClass(wr)}`}>
              {m}
              <span className={styles.pillSub}>{wr}% WR</span>
            </span>
          );
        })}
      </div>

      <div className={styles.probLabel}>Likelihood of each map being played</div>
      <div className={styles.probList}>
        {likelyMaps.slice(0, 5).map(({ map, pct }) => (
          <div key={map} className={styles.probRow}>
            <span className={styles.probMap} style={{ color: MAP_COLORS[map] || 'var(--text)' }}>
              {map}
            </span>
            <div className={styles.bar}>
              <div
                className={styles.fill}
                style={{ width: `${pct}%`, background: MAP_COLORS[map] || 'var(--accent)' }}
              />
            </div>
            <span className={styles.pct}>~{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
