import { MAP_COLORS, winRateColor } from '../lib/maps';
import styles from './MyTeamTab.module.css';

const ACTIVE_POOL = ['Mirage','Inferno','Dust2','Nuke','Ancient','Anubis','Overpass'];

function SummaryCard({ label, myVal, oppVal, myColor, oppColor, myName, oppName, unit = '' }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryRow}>
        <div className={styles.summaryTeam}>
          <span className={styles.summaryName}>{myName}</span>
          <span className={styles.summaryVal} style={{ color: myColor }}>{myVal}{unit}</span>
        </div>
        <div className={styles.summaryDivider}>vs</div>
        <div className={styles.summaryTeam}>
          <span className={styles.summaryVal} style={{ color: oppColor }}>{oppVal}{unit}</span>
          <span className={styles.summaryName}>{oppName}</span>
        </div>
      </div>
    </div>
  );
}

function MapRow({ map, my, opp }) {
  const myWr  = my?.wr  ?? null;
  const oppWr = opp?.wr ?? null;
  const myG   = my?.played  || 0;
  const oppG  = opp?.played || 0;
  const color = MAP_COLORS[map] || '#888';

  const battleground = myWr !== null && oppWr !== null && myG >= 3 && oppG >= 3 && Math.abs(myWr - oppWr) < 20;
  const myAdvantage  = myWr !== null && oppWr !== null && myG >= 3 && myWr - oppWr >= 20;
  const oppAdvantage = myWr !== null && oppWr !== null && oppG >= 3 && oppWr - myWr >= 20;

  return (
    <div className={`${styles.mapRow} ${battleground ? styles.battleground : myAdvantage ? styles.advantage : oppAdvantage ? styles.danger : ''}`}>
      <div className={styles.mapName} style={{ borderLeft: `3px solid ${color}` }}>
        {map}
        {battleground  && <span className={styles.badge} style={{ background: 'rgba(240,170,60,0.15)', color: '#f0aa3c', borderColor: 'rgba(240,170,60,0.3)' }}>Battleground</span>}
        {myAdvantage   && <span className={styles.badge} style={{ background: 'rgba(45,212,164,0.12)', color: '#2dd4a4', borderColor: 'rgba(45,212,164,0.3)' }}>Our map</span>}
        {oppAdvantage  && <span className={styles.badge} style={{ background: 'rgba(224,92,58,0.12)',  color: '#e05c3a', borderColor: 'rgba(224,92,58,0.25)' }}>Avoid</span>}
      </div>
      <div className={styles.teamCol}>
        {myWr !== null && myG >= 1
          ? <><span className={styles.wr} style={{ color: winRateColor(myWr) }}>{myWr}%</span><span className={styles.games}>{myG}G</span></>
          : <span className={styles.noData}>—</span>}
      </div>
      <div className={styles.vsCol}>
        <div className={styles.vsBar}>
          {myWr  !== null && <div className={styles.vsLeft}  style={{ width: `${myWr}%`,  background: winRateColor(myWr)  }} />}
          {oppWr !== null && <div className={styles.vsRight} style={{ width: `${oppWr}%`, background: winRateColor(oppWr) }} />}
        </div>
      </div>
      <div className={styles.teamCol}>
        {oppWr !== null && oppG >= 1
          ? <><span className={styles.wr} style={{ color: winRateColor(oppWr) }}>{oppWr}%</span><span className={styles.games}>{oppG}G</span></>
          : <span className={styles.noData}>—</span>}
      </div>
    </div>
  );
}

function ScoutingPoints({ myTeamStats, oppMapStats, oppName, oppOverallWR, players }) {
  const points = [];

  // Find their best map
  const oppMaps = ACTIVE_POOL
    .filter(m => oppMapStats?.[m]?.played >= 3)
    .sort((a, b) => (oppMapStats[b].wr || 0) - (oppMapStats[a].wr || 0));

  if (oppMaps.length > 0) {
    const best = oppMaps[0];
    points.push({ type: 'warn', text: `Ban ${best} — ${oppName}'s strongest map at ${oppMapStats[best].wr}% WR (${oppMapStats[best].played}G)` });
  }
  if (oppMaps.length > 1) {
    const worst = oppMaps[oppMaps.length - 1];
    points.push({ type: 'good', text: `Force ${worst} — ${oppName}'s weakest map at ${oppMapStats[worst].wr}% WR (${oppMapStats[worst].played}G)` });
  }

  // Find our best map vs their weakness
  const myMaps = myTeamStats ? ACTIVE_POOL
    .filter(m => myTeamStats.mapStats?.[m]?.played >= 3)
    .sort((a, b) => (myTeamStats.mapStats[b].wr || 0) - (myTeamStats.mapStats[a].wr || 0)) : [];

  if (myMaps.length > 0 && oppMapStats) {
    const ideal = myMaps.find(m => (oppMapStats[m]?.wr || 100) < 45 && myTeamStats.mapStats[m].wr > 55);
    if (ideal) {
      points.push({ type: 'good', text: `Pick ${ideal} — you win ${myTeamStats.mapStats[ideal].wr}% there, they only win ${oppMapStats[ideal]?.wr ?? '?'}%` });
    }
  }

  // Overall form insight
  if (oppOverallWR !== undefined) {
    if (oppOverallWR >= 60) points.push({ type: 'warn', text: `${oppName} are in strong form at ${oppOverallWR}% overall — expect a disciplined team` });
    else if (oppOverallWR < 40) points.push({ type: 'good', text: `${oppName} are struggling at ${oppOverallWR}% overall — they may be on tilt` });
  }

  // Key player threat
  if (players?.length > 0) {
    const sorted = [...players].sort((a, b) => {
      const aScore = parseFloat(a.kd || 0) * 3 + parseFloat(a.adr || 0) * 0.015;
      const bScore = parseFloat(b.kd || 0) * 3 + parseFloat(b.adr || 0) * 0.015;
      return bScore - aScore;
    });
    const top = sorted[0];
    if (top && parseFloat(top.kd || 0) > 1.1) {
      points.push({ type: 'warn', text: `Watch ${top.nickname} (${top.role}) — ${parseFloat(top.kd).toFixed(2)} K/D, ${Math.round(top.adr)} ADR. They are the primary carry` });
    }
  }

  if (points.length === 0) return null;

  return (
    <div className={styles.scoutSection}>
      <div className={styles.sectionTitle}>Key Scouting Points</div>
      <div className={styles.scoutList}>
        {points.map((p, i) => (
          <div key={i} className={`${styles.scoutPoint} ${p.type === 'good' ? styles.scoutGood : styles.scoutWarn}`}>
            <span className={styles.scoutIcon}>{p.type === 'good' ? '✓' : '⚠'}</span>
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MyTeamTab({ myTeamStats, oppName, oppMapStats, oppOverallWR, players }) {
  if (!myTeamStats) {
    return <div className={styles.empty}>Enter your team name to enable team comparison.</div>;
  }

  // Summary stats
  const myOverall = myTeamStats.mapStats ? (() => {
    let totalG = 0, totalW = 0;
    for (const v of Object.values(myTeamStats.mapStats)) { totalG += v.played || 0; totalW += v.wins || 0; }
    return totalG > 0 ? Math.round((totalW / totalG) * 100) : null;
  })() : null;

  const myBestMap  = ACTIVE_POOL.filter(m => myTeamStats.mapStats?.[m]?.played >= 3).sort((a,b) => (myTeamStats.mapStats[b].wr||0) - (myTeamStats.mapStats[a].wr||0))[0];
  const oppBestMap = ACTIVE_POOL.filter(m => oppMapStats?.[m]?.played >= 3).sort((a,b) => (oppMapStats[b].wr||0) - (oppMapStats[a].wr||0))[0];

  return (
    <div className={styles.wrap}>
      {/* Summary comparison */}
      {(myOverall !== null || oppOverallWR !== undefined) && (
        <div className={styles.summaryGrid}>
          <SummaryCard
            label="Overall Win Rate"
            myName={myTeamStats.name} oppName={oppName}
            myVal={myOverall ?? '—'} oppVal={oppOverallWR ?? '—'}
            myColor={myOverall >= 50 ? '#2dd4a4' : '#e05c3a'}
            oppColor={oppOverallWR >= 50 ? '#2dd4a4' : '#e05c3a'}
            unit="%"
          />
          <SummaryCard
            label="Best Map"
            myName={myTeamStats.name} oppName={oppName}
            myVal={myBestMap  ? `${myBestMap} (${myTeamStats.mapStats[myBestMap].wr}%)`  : '—'}
            oppVal={oppBestMap ? `${oppBestMap} (${oppMapStats[oppBestMap].wr}%)` : '—'}
            myColor="#2dd4a4" oppColor="#2dd4a4"
          />
          <SummaryCard
            label="Matches in Sample"
            myName={myTeamStats.name} oppName={oppName}
            myVal={myTeamStats.matchesAnalysed} oppVal="—"
            myColor="var(--text)" oppColor="var(--text3)"
          />
        </div>
      )}

      {/* Scouting points */}
      <ScoutingPoints
        myTeamStats={myTeamStats}
        oppMapStats={oppMapStats}
        oppName={oppName}
        oppOverallWR={oppOverallWR}
        players={players}
      />

      {/* Map-by-map table */}
      <div className={styles.sectionTitle}>Map Win Rate Comparison</div>
      <div className={styles.tableHeader}>
        <div className={styles.mapCol}>Map</div>
        <div className={styles.teamCol}>{myTeamStats.name}</div>
        <div className={styles.vsCol}></div>
        <div className={styles.teamCol}>{oppName}</div>
      </div>
      <div className={styles.rows}>
        {ACTIVE_POOL.map(map => (
          <MapRow key={map} map={map} my={myTeamStats.mapStats?.[map]} opp={oppMapStats?.[map]} />
        ))}
      </div>

      <div className={styles.footer}>
        {myTeamStats.name}: {myTeamStats.matchesAnalysed} matches analysed
      </div>
    </div>
  );
}
