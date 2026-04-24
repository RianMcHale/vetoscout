import { useState } from 'react';
import { MAPS } from './lib/maps';
import { useAnalyze } from './hooks/useAnalyze';
import InputForm from './components/InputForm';
import MetricCards from './components/MetricCards';
import MapCharts from './components/MapCharts';
import VetoStrategy from './components/VetoStrategy';
import MapScenario from './components/MapScenario';
import MyTeamTab from './components/MyTeamTab';
// import ReportTab from './components/ReportTab';
import TabLayout from './components/TabLayout';
import FormGuide from './components/FormGuide';
import UpcomingPanel from './components/UpcomingPanel';
import VetoSimulator from './components/VetoSimulator';
import VetoFlowTab from './components/VetoFlowTab';
import HistoryTimeline from './components/HistoryTimeline';
import PlayerTab from './components/PlayerTab';
import styles from './App.module.css';

export default function App() {
  const { status, statusMsg, progress, result, error, debugLog, analyze, bansByMatchId } = useAnalyze();
  const [showDebug, setShowDebug]           = useState(false);
  const [lastExclude, setLastExclude]       = useState('');
  const [lastMyTeam, setLastMyTeam]         = useState('');
  const [lastMatchInput, setLastMatchInput] = useState('');

  const loading = status === 'loading';

  function getPoolMaps(excludeMaps) {
    if (!excludeMaps) return MAPS;
    const ex = excludeMaps.split(',').map(m => m.trim().toLowerCase());
    return MAPS.filter(m => !ex.some(e => m.toLowerCase().includes(e)));
  }

  function handleSubmit(params) {
    setLastExclude(params.excludeMaps || '');
    setLastMyTeam(params.myTeam || '');
    setLastMatchInput(params.matchInput || '');
    analyze(params);
  }

  function handleSelectMatch(matchUrl) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    analyze({ matchInput: matchUrl, myTeam: lastMyTeam, excludeMaps: lastExclude, myPermaBans: '' });
    setLastMatchInput(matchUrl);
  }

  const poolMaps  = getPoolMaps(lastExclude);
  const showPanel = !!lastMyTeam && !!lastMatchInput;

  const oppMapStats = result ? (() => {
    const out = {};
    for (const map of poolMaps) {
      const g = result.stats.playCounts[map] || 0;
      const w = result.stats.winCounts?.[map] || 0;
      out[map] = { played: g, wins: w, wr: g ? Math.round((w / g) * 100) : null };
    }
    return out;
  })() : null;

  const mapTab = result ? (
    <>
      <MetricCards stats={result.stats} />
      <MapCharts stats={result.stats} poolMaps={poolMaps} />
      <VetoFlowTab
        bansByMatchId={bansByMatchId}
        matchSummaries={result.matchSummaries}
      />
      < br />
      <VetoStrategy stats={result.stats} poolMaps={poolMaps} />
      <MapScenario stats={result.stats} poolMaps={poolMaps} />
    </>
  ) : null;



  const myTeamTab = result ? (
    <MyTeamTab
      myTeamStats={result.myTeamStats}
      oppName={result.opponent.name}
      oppMapStats={oppMapStats}
      oppOverallWR={result.stats.overallWR}
      players={result.players}
    />
  ) : null;

  // const reportTab = result ? <ReportTab result={result} poolMaps={poolMaps} /> : null;

  const vetoSimTab = result ? (
    <VetoSimulator
      stats={result.stats}
      poolMaps={poolMaps}
      myTeamStats={result.myTeamStats}
    />
  ) : null;


  const historyTab = result ? (
    <HistoryTimeline
      matchSummaries={result.matchSummaries}
      bansByMatchId={bansByMatchId}
      opponent={result.opponent}
    />
  ) : null;

  const playerTab = result ? <PlayerTab players={result.players} /> : null;

  const tabs = result ? [
    { label: 'Map Statistics',    icon: '⬡', content: mapTab },
    { label: 'Players',           icon: '◈', content: playerTab },
    { label: 'My Team',           icon: '⚑', content: myTeamTab },
    { label: 'Veto Simulator',    icon: '⊘', content: vetoSimTab },
    { label: 'History',           icon: '◷', content: historyTab },
    // { label: 'AI Briefing',       icon: '✦', content: reportTab },
  ] : [];

  return (
    <div className={styles.app}>
      <div className={styles.scanlines} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>◆</div>
            <span className={styles.logoText}>VETO<span>SCOUT</span></span>
          </div>
          <span className={styles.badge}>CS2 · FACEIT ESEA</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.configCard}>
          <InputForm onSubmit={handleSubmit} loading={loading} />
          <div className={styles.statusBar}>
            <span className={`${styles.dot} ${loading ? styles.dotActive : status === 'error' ? styles.dotError : status === 'done' ? styles.dotDone : ''}`} />
            <span className={styles.statusText}>{statusMsg}</span>
          </div>
          {status === 'loading' && (
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <div className={styles.errorMsg}>⚠ {error}</div>}
        </div>

        {debugLog && (
          <div className={styles.debugCard}>
            <div className={styles.debugHeader}>
              <div className={styles.debugTitle}>
                Veto Debug
                <span className={debugLog.ok > 0 ? styles.debugBadgeGood : styles.debugBadgeBad}>
                  {debugLog.ok}/{debugLog.total} matches with veto data
                </span>
                {debugLog.no_map_ticket > 0 && <span className={styles.debugBadgeBad}>{debugLog.no_map_ticket} no ticket</span>}
                {debugLog.no_opp_bans > 0 && <span className={styles.debugBadgeWarn}>{debugLog.no_opp_bans} wrong faction</span>}
                {debugLog.http_error > 0 && <span className={styles.debugBadgeBad}>{debugLog.http_error} HTTP errors</span>}
                {debugLog.exception > 0 && <span className={styles.debugBadgeBad}>{debugLog.exception} exceptions</span>}
              </div>
              <button className={styles.debugToggle} onClick={() => setShowDebug(v => !v)}>
                {showDebug ? 'hide detail' : 'show detail'}
              </button>
            </div>
            {showDebug && (
              <div className={styles.debugBody}>
                <p className={styles.debugNote}>First 5 match samples:</p>
                {debugLog.sample.map((s, i) => (
                  <div key={i} className={styles.debugRow}>
                    <span className={`${styles.debugStatus} ${s.status === 'ok' ? styles.debugOk : s.status === 'no_opp_bans' ? styles.debugWarn : styles.debugErr}`}>{s.status}</span>
                    <span className={styles.debugMatchId}>{s.matchId.slice(0, 24)}…</span>
                    <span className={styles.debugFaction}>opp={s.oppFactionKey ?? 'null'}</span>
                    {s.httpStatus && <span className={styles.debugHttp}>HTTP {s.httpStatus}</span>}
                    {s.allDrops.length > 0 && <span className={styles.debugDrops}>drops: {s.allDrops.map(d => `${d.map}(${d.selected_by})`).join(', ')}</span>}
                    {s.bans.length > 0 && <span className={styles.debugBans}>→ {s.bans.join(', ')}</span>}
                    {s.error && <span className={styles.debugError}>{s.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.contentRow}>
          <div className={styles.mainCol}>
            {result && (
              <div className={styles.results}>
                <div className={styles.oppHeader}>
                  {result.opponent.avatar && (
                    <img className={styles.avatar} src={result.opponent.avatar} alt={result.opponent.name} onError={e => { e.target.style.display = 'none'; }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div className={styles.oppName}>{result.opponent.name}</div>
                    <div className={styles.oppMeta}>
                      <span className={styles.metaStat}>
                        <span className={styles.metaLabel}>Matches analysed</span>
                        <span className={styles.metaVal}>{result.matchesFiltered ? result.matchesFiltered.afterCoreFilter : result.matchesAnalysed}</span>
                      </span>
                      <span className={styles.metaDivider}>·</span>
                      <span className={styles.metaStat}>
                        <span className={styles.metaLabel}>W / L</span>
                        <span className={styles.metaVal}>
                          <span style={{ color: 'var(--teal)' }}>{result.stats.totalWins}W</span>
                          {' – '}
                          <span style={{ color: 'var(--loss)' }}>{result.stats.totalLosses}L</span>
                        </span>
                      </span>
                      <span className={styles.metaDivider}>·</span>
                      <span className={styles.metaStat}>
                        <span className={styles.metaLabel}>Win rate</span>
                        <span className={styles.metaVal} style={{ color: result.stats.overallWR >= 50 ? 'var(--teal)' : 'var(--loss)' }}>
                          {result.stats.overallWR}%
                        </span>
                      </span>
                    </div>
                    <FormGuide formGuide={result.formGuide} />
                  </div>
                </div>

                <TabLayout tabs={tabs} />
              </div>
            )}
          </div>

          {showPanel && (
            <UpcomingPanel myTeam={lastMyTeam} matchInput={lastMatchInput} onSelectMatch={handleSelectMatch} />
          )}
        </div>
      </main>
    </div>
  );
}
