import { useState, useMemo } from 'react';
import { MAP_COLORS, winRateColor } from '../lib/maps';
import styles from './VetoSimulator.module.css';

const ACTIVE_POOL = ['Mirage','Inferno','Dust2','Nuke','Ancient','Anubis','Overpass'];

const MAP_IMAGES = {
  Mirage:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7fb7d725-e44d-4e3c-b557-e1d19b260ab8_1695819144685.jpeg',
  Inferno:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/993380de-bb5b-4aa1-ada9-a0c1741dc475_1695819220797.jpeg',
  Dust2:    'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7c17caa9-64a6-4496-8a0b-885e0f038d79_1695819126962.jpeg',
  Nuke:     'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7197a969-81e4-4fef-8764-55f46c7cec6e_1695819158849.jpeg',
  Ancient:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/5b844241-5b15-45bf-a304-ad6df63b5ce5_1695819190976.jpeg',
  Anubis:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/31f01daf-e531-43cf-b949-c094ebc9b3ea_1695819235255.jpeg',
  Overpass: 'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/058c4eb3-dac4-441c-a810-70afa0f3022c_1695819170133.jpeg',
};

const BO1_SEQUENCE = [
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
];

const BO3_SEQUENCE = [
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
  { team: 'them', action: 'pick', label: '1st Pick' },
  { team: 'us',   action: 'pick', label: '2nd Pick' },
  { team: 'them', action: 'ban',  label: '1st Ban'  },
  { team: 'us',   action: 'ban',  label: '2nd Ban'  },
];

function MapTile({ map, state, action, isNext, winRate, myWinRate, oppName, myName, onClick }) {
  const banned = state === 'banned_them' || state === 'banned_us';
  const picked = state === 'picked_them' || state === 'picked_us';
  const decider = state === 'decider';

  let statusText = null;
  let statusColor = null;
  if (state === 'banned_them') { statusText = 'BANNED BY THEM'; statusColor = '#e05c3a'; }
  if (state === 'banned_us')   { statusText = 'BANNED BY YOU';  statusColor = '#f0aa3c'; }
  if (state === 'picked_them') { statusText = 'THEIR PICK';     statusColor = '#9b7fe8'; }
  if (state === 'picked_us')   { statusText = 'YOUR PICK';      statusColor = '#2dd4a4'; }
  if (decider)                 { statusText = 'DECIDER';         statusColor = '#4a9eff'; }

  return (
    <div
      className={`${styles.tile} ${banned ? styles.tileBanned : ''} ${picked || decider ? styles.tilePicked : ''} ${isNext ? styles.tileNext : ''}`}
      onClick={onClick}
      style={{
        borderColor: isNext
          ? (action === 'ban' ? 'rgba(224,92,58,0.6)' : 'rgba(45,212,164,0.6)')
          : statusColor
            ? `${statusColor}33`
            : 'var(--border)',
      }}
    >
      {/* Map background image */}
      <div className={styles.tileImg} style={{ backgroundImage: `url(${MAP_IMAGES[map]})`, opacity: banned ? 0.2 : 0.35 }} />

      {/* Content overlay */}
      <div className={styles.tileContent}>
        <div className={styles.tileName}>{map}</div>

        {/* Win rates — clear labels */}
        {!banned && (winRate != null || myWinRate != null) && (
          <div className={styles.tileRates}>
            {winRate != null && (
              <div className={styles.rateRow}>
                <span className={styles.rateLabel} style={{ color: '#e05c3a' }}>{oppName || 'Opp'} WR</span>
                <div className={styles.rateBarWrap}>
                  <div className={styles.rateBar}>
                    <div className={styles.rateFill} style={{ width: `${winRate}%`, background: winRateColor(winRate) }} />
                  </div>
                  <span className={styles.ratePct} style={{ color: winRateColor(winRate) }}>{winRate}%</span>
                </div>
              </div>
            )}
            {myWinRate != null && (
              <div className={styles.rateRow}>
                <span className={styles.rateLabel} style={{ color: '#2dd4a4' }}>{myName || 'My'} WR</span>
                <div className={styles.rateBarWrap}>
                  <div className={styles.rateBar}>
                    <div className={styles.rateFill} style={{ width: `${myWinRate}%`, background: winRateColor(myWinRate) }} />
                  </div>
                  <span className={styles.ratePct} style={{ color: winRateColor(myWinRate) }}>{myWinRate}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status overlay */}
        {statusText && (
          <div className={styles.statusBadge} style={{ background: `${statusColor}18`, color: statusColor, borderColor: `${statusColor}33` }}>
            {statusText}
          </div>
        )}

        {/* Click hint */}
        {isNext && (
          <div className={styles.nextHint} style={{ color: action === 'ban' ? '#e05c3a' : '#2dd4a4' }}>
            {action === 'ban' ? '🚫 Click to ban' : '✓ Click to pick'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VetoSimulator({ stats, poolMaps, myTeamStats }) {
  const [format, setFormat] = useState('bo1');
  const [mapStates, setMapStates] = useState({});
  const [step, setStep] = useState(0);
  const [startTeam, setStartTeam] = useState('them');

  const oppName = stats?.opponentName || 'Opponent';
  const myName = myTeamStats?.name || 'My Team';

  const sequence = useMemo(() => {
    const base = format === 'bo1' ? BO1_SEQUENCE : BO3_SEQUENCE;
    if (startTeam === 'us') return base.map(s => ({ ...s, team: s.team === 'them' ? 'us' : 'them' }));
    return base;
  }, [format, startTeam]);

  const availableMaps = ACTIVE_POOL.filter(m => poolMaps.includes(m));

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

  function getOptimalSuggestion() {
    if (!currentStep || remaining.length === 0) return null;
    const { team, action } = currentStep;
    if (action === 'ban') {
      if (team === 'us') {
        return remaining.sort((a, b) => (stats.winRates[b] || 0) - (stats.winRates[a] || 0))[0];
      } else {
        if (myTeamStats?.mapStats) {
          return remaining.sort((a, b) => (myTeamStats.mapStats[b]?.wr || 0) - (myTeamStats.mapStats[a]?.wr || 0))[0];
        }
      }
    } else {
      if (team === 'us' && myTeamStats?.mapStats) {
        return remaining.sort((a, b) => (myTeamStats.mapStats[b]?.wr || 0) - (myTeamStats.mapStats[a]?.wr || 0))[0];
      } else {
        return remaining.sort((a, b) => (stats.winRates[b] || 0) - (stats.winRates[a] || 0))[0];
      }
    }
    return null;
  }

  const suggestion = getOptimalSuggestion();

  return (
    <div className={styles.wrap}>
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
            oppName={oppName}
            myName={myName}
            onClick={() => handleMapClick(map)}
          />
        ))}
      </div>
    </div>
  );
}
