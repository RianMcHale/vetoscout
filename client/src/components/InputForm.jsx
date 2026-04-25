import { useState } from 'react';
import styles from './InputForm.module.css';

export default function InputForm({ onSubmit, loading }) {
  const [matchInput, setMatchInput] = useState('');
  const [myTeam, setMyTeam]         = useState('');
  const [excludeMaps, setExclude]   = useState('');
  const [myPermaBans, setPermaBans] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!matchInput.trim()) return;
    onSubmit({ matchInput: matchInput.trim(), myTeam: myTeam.trim(), excludeMaps: excludeMaps.trim(), myPermaBans: myPermaBans.trim() });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.row}>
        <div className={styles.group} style={{ flex: 2 }}>
          <label className={styles.label}>Match Room URL or ID</label>
          <input
            className={styles.input}
            type="text"
            placeholder="https://www.faceit.com/en/cs2/room/1-abc… or just the room ID"
            value={matchInput}
            onChange={e => setMatchInput(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className={styles.group}>
          <label className={styles.label}>Your Team Name</label>
          <input
            className={styles.input}
            type="text"
            placeholder="e.g. Potential CS"
            value={myTeam}
            onChange={e => setMyTeam(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className={styles.group}>
          <label className={styles.label}>Your Permabans</label>
          <input
            className={styles.input}
            type="text"
            placeholder="e.g. Dust 2"
            value={myPermaBans}
            onChange={e => setPermaBans(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className={styles.group}>
          <label className={styles.label}>Exclude Maps</label>
          <input
            className={styles.input}
            type="text"
            placeholder="e.g. Train"
            value={excludeMaps}
            onChange={e => setExclude(e.target.value)}
            disabled={loading}
          />
        </div>
        <button className={styles.btn} type="submit" disabled={loading || !matchInput.trim()}>
          {loading ? <span className={styles.spinner} /> : 'ANALYZE'}
        </button>
      </div>
    </form>
  );
}
