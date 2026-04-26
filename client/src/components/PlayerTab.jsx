import { ACTIVE_MAP_POOL } from '../lib/maps';
import styles from './PlayerTab.module.css';

const ROLE_COLORS = {
  AWPer:           { bg: 'rgba(155,127,232,0.15)', border: 'rgba(155,127,232,0.35)', text: '#9b7fe8' },
  'Entry Fragger': { bg: 'rgba(224,92,58,0.15)',   border: 'rgba(224,92,58,0.35)',   text: '#e05c3a' },
  Support:         { bg: 'rgba(74,158,255,0.15)',  border: 'rgba(74,158,255,0.35)',  text: '#4a9eff' },
  Lurker:          { bg: 'rgba(240,170,60,0.15)',  border: 'rgba(240,170,60,0.35)',  text: '#f0aa3c' },
  Rifler:          { bg: 'rgba(136,145,168,0.15)', border: 'rgba(136,145,168,0.35)', text: '#8b91a8' },
  'Star Rifler':   { bg: 'rgba(232,75,156,0.15)',  border: 'rgba(232,75,156,0.35)',  text: '#e84b9c' },
};

const LEVEL_COLORS = ['','#eee','#3cdc64','#3cdc64','#3cdc64','#f0aa3c','#f0aa3c','#f0aa3c','#e05c3a','#e05c3a','#9b7fe8'];


function calcThreat(p) {
  const kd       = parseFloat(p.kd        || 0);
  const adr      = parseFloat(p.adr       || 0);
  const entrySR  = parseFloat(p.entrySR   || 0);
  const clutch   = parseFloat(p.clutch1v1 || 0);
  const sniperKR = parseFloat(p.sniperKR  || 0);
  const kdScore     = Math.min(100, (kd  / 1.5)  * 100);
  const adrScore    = Math.min(100, (adr / 100)   * 100);
  const entryScore  = Math.min(100, entrySR        * 100);
  const clutchScore = Math.min(100, clutch          * 100);
  const sniperBonus = sniperKR > 0.1 ? 10 : 0;
  return Math.round(kdScore * 0.35 + adrScore * 0.30 + entryScore * 0.15 + clutchScore * 0.15 + sniperBonus * 0.05);
}

function threatLabel(score) {
  if (score >= 75) return 'High Threat';
  if (score >= 55) return 'Moderate';
  if (score >= 35) return 'Average';
  return 'Low';
}

function threatColor(score) {
  if (score >= 75) return '#e05c3a';
  if (score >= 55) return '#f0aa3c';
  if (score >= 35) return '#4a9eff';
  return '#8b91a8';
}


// Threat rating: 0-100 composite of KD, ADR, entry success, clutch, impact
function BarStat({ label, value, displayValue, max, color, sub }) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className={styles.barStat}>
      <div className={styles.barHeader}>
        <span className={styles.barLabel}>{label}</span>
        <span className={styles.barValue} style={{ color }}>{displayValue ?? value}</span>
      </div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      {sub && <div className={styles.barSub}>{sub}</div>}
    </div>
  );
}

function StatGroup({ title, children }) {
  return (
    <div className={styles.statGroup}>
      <div className={styles.groupTitle}>{title}</div>
      <div className={styles.groupStats}>{children}</div>
    </div>
  );
}

function PlayerCard({ player }) {
  const roleStyle  = ROLE_COLORS[player.role] || ROLE_COLORS.Rifler;
  const initials   = player.nickname.slice(0, 2).toUpperCase();

  const kd         = parseFloat(player.kd         || 0);
  const adr        = parseFloat(player.adr        || 0);
  const hs         = parseFloat(player.hsRaw      || 0);
  const winRate    = parseFloat(player.winRate     || 0);
  const entryRate  = parseFloat(player.entryRate   || 0);
  const entrySR    = parseFloat(player.entrySR     || 0);
  const firstKills = parseFloat(player.firstKills  || 0);
  const clutch1v1  = parseFloat(player.clutch1v1   || 0);
  const clutch1v2  = parseFloat(player.clutch1v2   || 0);
  const flashSR    = parseFloat(player.flashSR     || 0);
  const utilDmg    = parseFloat(player.utilDmg     || 0);
  const assists    = parseFloat(player.assists      || 0);
  const sniperKR   = parseFloat(player.sniperKR    || 0);

  return (
    <div className={styles.card}>
      {/* Player header */}
      <div className={styles.cardHeader}>
        <div className={styles.avatarWrap}>
          {player.avatar
            ? <img className={styles.avatar} src={player.avatar} alt={player.nickname} onError={e => e.target.style.display='none'} />
            : <div className={styles.avatarFallback}>{initials}</div>
          }
          {player.level && (
            <div className={styles.level} style={{ color: LEVEL_COLORS[player.level] || '#fff' }}>{player.level}</div>
          )}
        </div>
        <div className={styles.playerMeta}>
          <div className={styles.nickname}>{player.nickname}</div>
          <div className={styles.subRow}>
            {player.elo   && <span className={styles.elo}>{player.elo} ELO</span>}
            {player.matches > 0 && <span className={styles.matches}>{player.matches.toLocaleString()}G</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          {player.teamRole && (
            <div style={{
              padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
              background: player.teamRole === 'Core' ? 'rgba(45,212,164,0.1)' : 'rgba(240,170,60,0.1)',
              border: `1px solid ${player.teamRole === 'Core' ? 'rgba(45,212,164,0.25)' : 'rgba(240,170,60,0.25)'}`,
              color: player.teamRole === 'Core' ? '#2dd4a4' : '#f0aa3c',
            }}>
              {player.teamRole}
            </div>
          )}
          <div className={styles.roleBadge} style={{ background: roleStyle.bg, border: `1px solid ${roleStyle.border}`, color: roleStyle.text }}>
            {player.role}{player.trait && <span className={styles.trait}> · {player.trait}</span>}
          </div>
        </div>
      </div>

      {/* Threat rating bar */}
      {(() => {
        const score = calcThreat(player);
        const color = threatColor(score);
        return (
          <div className={styles.threatRow}>
            <span className={styles.threatLabel}>Threat</span>
            <div className={styles.threatTrack}>
              <div className={styles.threatFill} style={{ width: `${score}%`, background: color }} />
            </div>
            <span className={styles.threatScore} style={{ color }}>{score} — {threatLabel(score)}</span>
          </div>
        );
      })()}

      {/* Core stats — always visible summary row */}
      <div className={styles.coreRow}>
        {[
          { label: 'K/D',  val: kd.toFixed(2),        good: kd > 1.15,    bad: kd < 0.9 },
          { label: 'ADR',  val: Math.round(adr),       good: adr > 80,     bad: adr < 60 },
          { label: 'HS%',  val: `${Math.round(hs)}%`,  good: hs > 60 },
          { label: 'WIN%', val: winRate ? `${Math.round(winRate)}%` : '—', good: winRate > 55 },
        ].map(s => (
          <div key={s.label} className={styles.coreBlock}>
            <div className={styles.coreLabel}>{s.label}</div>
            <div className={`${styles.coreVal} ${s.good ? styles.good : s.bad ? styles.bad : ''}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Detailed stats — 3 sections side by side */}
      <div className={styles.detailGrid}>
        <StatGroup title="Opening Duels">
          <BarStat label="Entry rate"    value={entryRate * 100} displayValue={`${Math.round(entryRate * 100)}%`} max={35}  color="#e05c3a" sub="% of rounds they open" />
          <BarStat label="Entry success" value={entrySR * 100}   displayValue={`${Math.round(entrySR * 100)}%`}   max={100} color="#f0aa3c" sub="% of entries won" />
          <BarStat label="First kills"   value={firstKills}      displayValue={firstKills.toFixed(1)}              max={5}   color="#9b7fe8" sub="avg per match" />
        </StatGroup>

        <StatGroup title="Clutch">
          <BarStat label="1v1 win rate" value={clutch1v1 * 100} displayValue={`${Math.round(clutch1v1 * 100)}%`} max={100} color="#2dd4a4" sub="% of 1v1s won" />
          <BarStat label="1v2 win rate" value={clutch1v2 * 100} displayValue={`${Math.round(clutch1v2 * 100)}%`} max={100} color="#4a9eff" sub="% of 1v2s won" />
        </StatGroup>

        <StatGroup title={sniperKR > 0.05 ? 'Utility & AWP' : 'Utility & Support'}>
          <BarStat label="Flash success"    value={flashSR * 100} displayValue={`${Math.round(flashSR * 100)}%`} max={100} color="#f0aa3c" sub="% of flashes that blind" />
          <BarStat label="Util dmg/round"   value={utilDmg}        displayValue={utilDmg.toFixed(1)}               max={15}  color="#4a9eff" sub="avg utility damage" />
          <BarStat label="Assists"          value={assists}         displayValue={assists.toFixed(1)}                max={10}  color="#8b91a8" sub="avg per match" />
          {sniperKR > 0.05 && (
            <BarStat label="Sniper/100r" value={sniperKR * 100} displayValue={(sniperKR * 100).toFixed(1)} max={30} color="#9b7fe8" sub="sniper kills per 100 rounds" />
          )}
        </StatGroup>
      </div>

      {/* Map-specific stats */}
      {player.byMap && Object.keys(player.byMap).length > 0 && (
        <div className={styles.mapStats}>
          <div className={styles.mapStatsLabel}>Performance by map</div>
          <div className={styles.mapStatsGrid}>
            {ACTIVE_MAP_POOL.filter(m => player.byMap[m]).map(m => {
              const bm = player.byMap[m];
              return (
                <div key={m} className={styles.mapStatCell}>
                  <div className={styles.mapStatName}>{m}</div>
                  <div className={styles.mapStatKd} style={{ color: bm.kd >= 1.15 ? '#2dd4a4' : bm.kd < 0.9 ? '#e05c3a' : 'var(--text)' }}>
                    {bm.kd.toFixed(2)}
                  </div>
                  <div className={styles.mapStatSub}>{bm.adr} ADR · {bm.matches}G</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlayerTab({ players }) {
  if (!players || players.length === 0) {
    return <div className={styles.empty}>No player data available.</div>;
  }
  return (
    <div className={styles.list}>
      {players.map(p => <PlayerCard key={p.pid} player={p} />)}
    </div>
  );
}
