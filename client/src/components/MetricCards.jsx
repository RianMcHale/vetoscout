import styles from './MetricCards.module.css';

function Card({ label, value, sub, accent }) {
  return (
    <div className={styles.card} style={{ '--top': accent }}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value} style={accent !== 'var(--accent)' ? { color: accent } : {}}>
        {value || '—'}
      </div>
      <div className={styles.sub}>{sub}</div>
    </div>
  );
}

export default function MetricCards({ stats }) {
  const { mostBanned, banRate, banCounts, bestMap, worstMap, mostPlayed, winRates, adjWinRates, playCounts } = stats;
  const wr = adjWinRates || winRates; // prefer confidence-adjusted
  return (
    <div className={styles.grid}>
      <Card
        label="Most Banned"
        value={mostBanned}
        sub={`${banCounts[mostBanned] || 0} bans · ${banRate}% rate`}
        accent="var(--accent)"
      />
      <Card
        label="Best Map"
        value={bestMap}
        sub={`${winRates[bestMap] || 0}% win rate · ${playCounts[bestMap] || 0}G`}
        accent="var(--teal)"
      />
      <Card
        label="Worst Map"
        value={worstMap}
        sub={`${winRates[worstMap] || 0}% win rate · ${playCounts[worstMap] || 0}G`}
        accent="var(--loss)"
      />
      <Card
        label="Most Played"
        value={mostPlayed}
        sub={`${playCounts[mostPlayed] || 0} appearances`}
        accent="var(--blue)"
      />
    </div>
  );
}
