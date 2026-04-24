import { useState, useMemo } from 'react';
import { MAP_COLORS, winRateColor } from '../lib/maps';
import styles from './VetoSimulator.module.css';

const ACTIVE_POOL = ['Mirage','Inferno','Dust2','Nuke','Ancient','Anubis','Overpass'];

// ESEA BO1: Ban1, Ban2, Ban2, Ban1, Ban1, Ban2 → Decider (remaining)
// i.e. First team bans 1st, 4th, 5th | Second team bans 2nd, 3rd, 6th
const BO1_SEQUENCE = [
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  // remaining = decider
];

// ESEA BO3: Ban1, Ban2, Pick1, Pick2, Ban1, Ban2 → Decider (remaining)
const BO3_SEQUENCE = [
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'them', action: 'pick', label: '1st Pick' },
  { team: 'us',   action: 'pick', label: '2nd Pick' },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  // remaining = decider map 3
];

function MapTile({ map, state, action, isNext, winRate, myWinRate, onClick }) {
  const color = MAP_COLORS[map] || '#888';
  const banned = state === 'banned_them' || state === 'banned_us';
  const picked = state === 'picked_them' || state === 'picked_us';
  const decider = state === 'decider';
  const bannedByThem = state === 'banned_them';
  const bannedByUs   = state === 'banned_us';
  const pickedByThem = state === 'picked_them';
  const pickedByUs   = state === 'picked_us';

  return (
    <div
      className={`${styles.tile} ${banned ? styles.tileBanned : ''} ${picked || decider ? styles.tilePicked : ''} ${isNext ? styles.tileNext : ''}`}
      onClick={onClick}
      style={{ borderColor: isNext ? (action === 'ban' ? '#e05c3a' : '#2dd4a4') : banned ? 'transparent' : color }}
    >
      <div className={styles.tileMapColor} style={{ background: color, opacity: banned ? 0.3 : 1 }} />
      <div className={styles.tileName} style={{ opacity: banned ? 0.35 : 1 }}>{map}</div>

      {/* Win rate bars */}
      {!banned && (
        <div className={styles.tileRates}>
          {winRate != null && (
            <div className={styles.rateRow}>
              <span className={styles.rateTeam}>Opp</span>
              <div className={styles.rateBar}>
                <div className={styles.rateFill} style={{ width: `${winRate}%`, background: winRateColor(winRate) }} />
              </div>
              <span className={styles.ratePct} style={{ color: winRateColor(winRate) }}>{winRate}%</span>
            </div>
          )}
          {myWinRate != null && (
            <div className={styles.rateRow}>
              <span className={styles.rateTeam}>My</span>
              <div className={styles.rateBar}>
                <div className={styles.rateFill} style={{ width: `${myWinRate}%`, background: winRateColor(myWinRate) }} />
              </div>
              <span className={styles.ratePct} style={{ color: winRateColor(myWinRate) }}>{myWinRate}%</span>
            </div>
          )}
        </div>
      )}

      {/* Status badge */}
      {(bannedByThem || bannedByUs) && (
        <div className={styles.statusBadge} style={{ background: 'rgba(224,92,58,0.15)', color: '#e05c3a' }}>
          {bannedByThem ? 'They banned' : 'We banned'}
        </div>
      )}
      {pickedByThem && <div className={styles.statusBadge} style={{ background: 'rgba(155,127,232,0.15)', color: '#9b7fe8' }}>Their pick</div>}
      {pickedByUs   && <div className={styles.statusBadge} style={{ background: 'rgba(45,212,164,0.15)', color: '#2dd4a4' }}>Our pick</div>}
      {decider      && <div className={styles.statusBadge} style={{ background: 'rgba(74,158,255,0.15)', color: '#4a9eff' }}>Decider</div>}

      {isNext && (
        <div className={styles.nextHint}>
          {action === 'ban' ? '🚫 Click to ban' : '✓ Click to pick'}
        </div>
      )}
    </div>
  );
}

export default function VetoSimulator({ stats, poolMaps, myTeamStats }) {
  const [format, setFormat] = useState('bo1');
  const [mapStates, setMapStates] = useState({});
  const [step, setStep] = useState(0);
  const [startTeam, setStartTeam] = useState('them'); // who bans first

  const sequence = useMemo(() => {
    const base = format === 'bo1' ? BO1_SEQUENCE : BO3_SEQUENCE;
    // If startTeam is 'us', flip all team assignments
    if (startTeam === 'us') return base.map(s => ({ ...s, team: s.team === 'them' ? 'us' : 'them' }));
    return base;
  }, [format, startTeam]);

  const availableMaps = ACTIVE_POOL.filter(m => poolMaps.includes(m));

  // Compute map states from sequence steps taken so far
  const computed = useMemo(() => {
    const states = {};
    for (let i = 0; i < step && i < sequence.length; i++) {
      const { team, action } = sequence[i];
      const map = mapStates[i];
      if (map) {
        if (action === 'ban') states[map] = team === 'them' ? 'banned_them' : 'banned_us';
        else states[map] = team === 'them' ? 'picked_them' : 'picked_us';
      }
    }
    // After all steps, remaining = decider (BO1) or third map (BO3)
    if (step >= sequence.length) {
      for (const m of availableMaps) {
        if (!states[m]) states[m] = 'decider';
      }
    }
    return states;
  }, [step, sequence, mapStates, availableMaps]);

  const currentStep = step < sequence.length ? sequence[step] : null;
  const remaining = availableMaps.filter(m => !computed[m]);

  function handleMapClick(map) {
    if (!currentStep || computed[map]) return;
    setMapStates(prev => ({ ...prev, [step]: map }));
    setStep(s => s + 1);
  }

  function handleUndo() {
    if (step === 0) return;
    setMapStates(prev => { const n = { ...prev }; delete n[step - 1]; return n; });
    setStep(s => s - 1);
  }

  function handleReset() {
    setMapStates({});
    setStep(0);
  }

  // Optimal suggestion: for a ban, suggest the map they win most; for a pick, suggest the map we win most
  function getOptimalSuggestion() {
    if (!currentStep || remaining.length === 0) return null;
    const { team, action } = currentStep;
    if (action === 'ban') {
      if (team === 'us') {
        // Ban their best map
        return remaining.sort((a, b) => (stats.winRates[b] || 0) - (stats.winRates[a] || 0))[0];
      } else {
        // Predict they ban our best (from myTeamStats)
        if (myTeamStats?.mapStats) {
          return remaining.sort((a, b) => (myTeamStats.mapStats[b]?.wr || 0) - (myTeamStats.mapStats[a]?.wr || 0))[0];
        }
      }
    } else {
      // Pick: suggest our best remaining
      if (team === 'us' && myTeamStats?.mapStats) {
        return remaining.sort((a, b) => (myTeamStats.mapStats[b]?.wr || 0) - (myTeamStats.mapStats[a]?.wr || 0))[0];
      } else {
        // Their pick: they'll pick their best
        return remaining.sort((a, b) => (stats.winRates[b] || 0) - (stats.winRates[a] || 0))[0];
      }
    }
    return null;
  }

  const suggestion = getOptimalSuggestion();

  return (
    <div className={styles.wrap}>
      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Format</span>
          <div className={styles.btnGroup}>
            <button className={`${styles.btn} ${format === 'bo1' ? styles.btnActive : ''}`} onClick={() => { setFormat('bo1'); handleReset(); }}>BO1</button>
            <button className={`${styles.btn} ${format === 'bo3' ? styles.btnActive : ''}`} onClick={() => { setFormat('bo3'); handleReset(); }}>BO3</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>First ban</span>
          <div className={styles.btnGroup}>
            <button className={`${styles.btn} ${startTeam === 'them' ? styles.btnActive : ''}`} onClick={() => { setStartTeam('them'); handleReset(); }}>Them</button>
            <button className={`${styles.btn} ${startTeam === 'us' ? styles.btnActive : ''}`} onClick={() => { setStartTeam('us'); handleReset(); }}>Us</button>
          </div>
        </div>
        <div className={styles.controlGroup}>
          <button className={styles.btnUndo} onClick={handleUndo} disabled={step === 0}>↩ Undo</button>
          <button className={styles.btnReset} onClick={handleReset} disabled={step === 0}>↺ Reset</button>
        </div>
      </div>

      {/* Sequence strip */}
      <div className={styles.sequenceStrip}>
        {sequence.map((s, i) => {
          const map = mapStates[i];
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className={`${styles.seqStep} ${done ? styles.seqDone : ''} ${active ? styles.seqActive : ''}`}>
              <div className={styles.seqTeam} style={{ color: s.team === 'them' ? '#e05c3a' : '#2dd4a4' }}>
                {s.team === 'them' ? 'Them' : 'Us'}
              </div>
              <div className={styles.seqAction}>{s.label || s.action}</div>
              {map && <div className={styles.seqMap} style={{ color: MAP_COLORS[map] }}>{map}</div>}
              {!map && active && <div className={styles.seqPending}>?</div>}
            </div>
          );
        })}
        {step >= sequence.length && (
          <div className={`${styles.seqStep} ${styles.seqDone}`}>
            <div className={styles.seqTeam} style={{ color: '#4a9eff' }}>Decider</div>
            <div className={styles.seqAction}>play</div>
            {remaining[0] && <div className={styles.seqMap} style={{ color: MAP_COLORS[remaining[0]] }}>{remaining[0]}</div>}
          </div>
        )}
      </div>

      {/* Current prompt */}
      {currentStep && (
        <div className={styles.prompt} style={{ borderColor: currentStep.action === 'ban' ? 'rgba(224,92,58,0.4)' : 'rgba(45,212,164,0.4)' }}>
          <span style={{ color: currentStep.team === 'them' ? '#e05c3a' : '#2dd4a4', fontWeight: 700 }}>
            {currentStep.team === 'them' ? 'Their turn' : 'Your turn'}
          </span>
          {' — '}
          {currentStep.action === 'ban' ? 'select a map to ban' : 'select a map to pick'}
          {suggestion && (
            <span className={styles.suggestion}>
              💡 Suggested: <strong style={{ color: MAP_COLORS[suggestion] }}>{suggestion}</strong>
            </span>
          )}
        </div>
      )}
      {step >= sequence.length && remaining.length > 0 && (
        <div className={styles.prompt} style={{ borderColor: 'rgba(74,158,255,0.4)' }}>
          <span style={{ color: '#4a9eff', fontWeight: 700 }}>Veto complete</span>
          {' — decider map: '}
          <strong style={{ color: MAP_COLORS[remaining[0]] }}>{remaining[0]}</strong>
        </div>
      )}

      {/* Map grid */}
      <div className={styles.mapGrid}>
        {availableMaps.map(map => (
          <MapTile
            key={map}
            map={map}
            state={computed[map]}
            action={currentStep?.action}
            isNext={!computed[map] && !!currentStep}
            winRate={stats.winRates[map] ?? null}
            myWinRate={myTeamStats?.mapStats?.[map]?.wr ?? null}
            onClick={() => handleMapClick(map)}
          />
        ))}
      </div>
    </div>
  );
}
