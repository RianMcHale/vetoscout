import { getVetoRecommendation } from '../lib/maps';
import styles from './VetoStrategy.module.css';

function VetoStep({ num, map, reason, side, isPerma }) {
  return (
    <div className={`${styles.step} ${isPerma ? styles.stepPerma : ''}`}>
      <div className={`${styles.num} ${side === 'you' ? styles.you : styles.them}`}>{num}</div>
      <div>
        <div className={styles.map}>
          {map}
          {isPerma && <span className={styles.permaBadge}>PERMABAN</span>}
        </div>
        <div className={styles.reason}>{reason}</div>
      </div>
    </div>
  );
}

export default function VetoStrategy({ stats, poolMaps }) {
  const { yourBan1, yourBan2, oppBan1, oppBan2, reasoning, lowConfidence, permaBans } =
    getVetoRecommendation(stats, poolMaps);

  const permaSet = new Set(permaBans || stats.myPermaBans || []);
  const { banCounts, winRates, playCounts } = stats;
  const total = stats.totalWins + stats.totalLosses;
  const oppBan1Rate = total ? Math.round(((banCounts[oppBan1] || 0) / total) * 100) : 0;
  const oppBan2Rate = total ? Math.round(((banCounts[oppBan2] || 0) / total) * 100) : 0;

  return (
    <div className={styles.section}>
      <div className={styles.heading}>Optimal Veto Strategy</div>

      {permaSet.size > 0 && (
        <div className={styles.permaNote}>
          Your permabans: {[...permaSet].map(m => (
            <span key={m} className={styles.permaTag}>{m}</span>
          ))}
        </div>
      )}

      {reasoning && (
        <div className={`${styles.reasoning} ${lowConfidence ? styles.reasoningWarn : ''}`}>
          <span className={styles.reasoningPill}>
            {lowConfidence ? 'low sample' : permaSet.size > 0 ? 'permaban + data' : 'suggested bans'}
          </span>
          <strong className={styles.banLine}>
            Ban {yourBan1}{yourBan2 ? ` + ${yourBan2}` : ''}
          </strong>
          <p className={styles.reasoningText}>{reasoning}</p>
        </div>
      )}

      <div className={styles.grid}>
        <div>
          <div className={styles.colTitle}>Your Bans</div>
          <VetoStep num="1" side="you" map={yourBan1}
            isPerma={permaSet.has(yourBan1)}
            reason={permaSet.has(yourBan1)
              ? `Your permaban — opponent: ${winRates[yourBan1] || 0}% WR · ${playCounts[yourBan1] || 0}G`
              : `${winRates[yourBan1] || 0}% win rate · ${playCounts[yourBan1] || 0}G — eliminate their strongest map`} />
          <VetoStep num="3" side="you" map={yourBan2 || '—'}
            isPerma={permaSet.has(yourBan2)}
            reason={!yourBan2
              ? 'Insufficient data for second ban recommendation'
              : permaSet.has(yourBan2)
                ? `Your permaban — opponent: ${winRates[yourBan2] || 0}% WR · ${playCounts[yourBan2] || 0}G`
                : `${winRates[yourBan2] || 0}% win rate · ${playCounts[yourBan2] || 0}G — remove second comfort map`} />
          <VetoStep num="5" side="you" map="Your choice"
            reason="Remove whichever remaining map you're weakest on" />
        </div>
        <div>
          <div className={styles.colTitle}>Expected Opponent Bans</div>
          <VetoStep num="2" side="them" map={oppBan1 || '—'}
            reason={oppBan1
              ? `${oppBan1Rate}% ban rate — almost certain first ban`
              : 'No clear ban pattern detected'} />
          <VetoStep num="4" side="them" map={oppBan2 || '—'}
            reason={oppBan2
              ? `${oppBan2Rate}% ban rate — likely second ban`
              : 'No clear second ban'} />
          <VetoStep num="6" side="them" map="TBD"
            reason="Depends on remaining pool after your bans" />
        </div>
      </div>

      {stats.sampleSize && (
        <div className={styles.sampleNote}>
          Based on {stats.sampleSize.matches} matches analysed
          {lowConfidence ? ' — low sample, treat recommendations with caution' : ''}
        </div>
      )}
    </div>
  );
}
