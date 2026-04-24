import styles from './FormGuide.module.css';

export default function FormGuide({ formGuide }) {
  if (!formGuide || formGuide.length === 0) return null;
  const wins   = formGuide.filter(f => f.result === 'W').length;
  const streak = (() => {
    let s = 0;
    for (const f of formGuide) {
      if (f.result === formGuide[0].result) s++;
      else break;
    }
    return { type: formGuide[0]?.result, count: s };
  })();

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Form</span>
      <div className={styles.strip}>
        {formGuide.map((f, i) => (
          <div
            key={i}
            className={`${styles.dot} ${f.result === 'W' ? styles.win : styles.loss}`}
            title={f.map ? `${f.result} — ${f.map}` : f.result}
          >
            {f.result}
          </div>
        ))}
      </div>
      <span className={styles.record}>{wins}W – {formGuide.length - wins}L</span>
      {streak.count >= 3 && (
        <span className={`${styles.streak} ${streak.type === 'W' ? styles.streakWin : styles.streakLoss}`}>
          {streak.count} {streak.type === 'W' ? 'win' : 'loss'} streak
        </span>
      )}
    </div>
  );
}
