import { getVetoRecommendation } from '../lib/maps';
import styles from './VetoStrategy.module.css';

function VetoStep({ num, map, reason, side }) {
  return (
    <div className={styles.step}>
      <div className={`${styles.num} ${side === 'you' ? styles.you : styles.them}`}>{num}</div>
      <div>
        <div className={styles.map}>{map}</div>
        <div className={styles.reason}>{reason}</div>
      </div>
    </div>
  );
}

export default function VetoStrategy({ stats, poolMaps }) {
  const { yourBan1, yourBan2, oppBan1, oppBan2, reasoning, lowConfidence } =
    getVetoRecommendation(stats, poolMaps);

  const { banCounts, winRates, playCounts } = stats;
  const total = stats.totalWins + stats.totalLosses;
  const oppBan1Rate = total ? Math.round(((banCounts[oppBan1] || 0) / total) * 100) : 0;
  const oppBan2Rate = total ? Math.round(((banCounts[oppBan2] || 0) / total) * 100) : 0;

  return (
    <div className={styles.section}>
      <div className={styles.heading}>Optimal Veto Strategy</div>

      {/* Reasoning card from spec §5 */}
      {reasoning && (
        <div className={`${styles.reasoning} ${lowConfidence ? styles.reasoningWarn : ''}`}>
          <span className={styles.reasoningPill}>
            {lowConfidence ? 'low sample' : 'suggested bans'}
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
            reason={`${winRates[yourBan1] || 0}% win rate · ${playCounts[yourBan1] || 0}G — eliminate their strongest map`} />
          <VetoStep num="3" side="you" map={yourBan2 || '—'}
            reason={yourBan2
              ? `${winRates[yourBan2] || 0}% win rate · ${playCounts[yourBan2] || 0}G — remove second comfort map`
              : 'Insufficient data for second ban recommendation'} />
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

      {/* Sample size note */}
      {stats.sampleSize && (
        <div className={styles.sampleNote}>
          Based on {stats.sampleSize.matches} matches analysed
          {lowConfidence ? ' — low sample, treat recommendations with caution' : ''}
        </div>
      )}
    </div>
  );
}
