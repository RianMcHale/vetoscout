import { useState } from 'react';
import UpcomingPanel from './components/UpcomingPanel';
import SetupWizard from './components/SetupWizard';
import { MAPS } from './lib/maps';
import { useAnalyze } from './hooks/useAnalyze';
import MetricCards from './components/MetricCards';
import MapCharts from './components/MapCharts';
import VetoStrategy from './components/VetoStrategy';
import MapScenario from './components/MapScenario';
import MyTeamTab from './components/MyTeamTab';
import TabLayout from './components/TabLayout';
import FormGuide from './components/FormGuide';
import VetoSimulator from './components/VetoSimulator';
import VetoFlowTab from './components/VetoFlowTab';
import HistoryTimeline from './components/HistoryTimeline';
import PlayerTab from './components/PlayerTab';
import styles from './App.module.css';

function LandingHero({ onGetStarted }) {
  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroContent}>
        <div className={styles.heroLogo}>
          <div className={styles.heroIcon}>◆</div>
        </div>
        <h1 className={styles.heroTitle}>VETO<span>SCOUT</span></h1>
        <p className={styles.heroSub}>CS2 veto intelligence for FACEIT &amp; ESEA</p>
        <div className={styles.heroFeatures}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>⬡</span>
            <span className={styles.featureLabel}>Map ban analysis</span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>◈</span>
            <span className={styles.featureLabel}>Player scouting</span>
          </div>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>⊘</span>
            <span className={styles.featureLabel}>Veto simulator</span>
          </div>
        </div>
        <button className={styles.heroCta} onClick={onGetStarted}>Get Started</button>
        <p className={styles.heroNote}>Paste a FACEIT match room URL to analyse your opponent</p>
      </div>
    </div>
  );
}

export default function App() {
  const { status, statusMsg, progress, result, error, analyze, bansByMatchId } = useAnalyze();
  const [view, setView]                     = useState('landing'); // landing | wizard | analysis
  const [lastExclude, setLastExclude]       = useState('');
  const [lastMyTeam, setLastMyTeam]         = useState('');

  const loading = status === 'loading';

  function getPoolMaps(excludeMaps) {
    if (!excludeMaps) return MAPS;
    const ex = excludeMaps.split(',').map(m => m.trim().toLowerCase());
    return MAPS.filter(m => !ex.some(e => m.toLowerCase().includes(e)));
  }

  function handleWizardComplete(params) {
    setLastExclude(params.excludeMaps || '');
    setLastMyTeam(params.myTeam || '');
    setView('analysis');
    analyze(params);
  }

  function handleSelectMatch(matchUrl) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    analyze({ matchInput: matchUrl, myTeam: lastMyTeam, excludeMaps: lastExclude, myPermaBans: '' });
  }

  function handleNewAnalysis() {
    setView('wizard');
  }

  // Landing page
  if (view === 'landing') {
    return (
      <div className={styles.app}>
        <div className={styles.scanlines} aria-hidden="true" />
        <LandingHero onGetStarted={() => setView('wizard')} />
      </div>
    );
  }

  // Wizard flow
  if (view === 'wizard' && !result && !loading) {
    return (
      <div className={styles.app}>
        <div className={styles.scanlines} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.logo} onClick={() => setView('landing')} style={{ cursor: 'pointer' }}>
              <div className={styles.logoIcon}>◆</div>
              <span className={styles.logoText}>VETO<span>SCOUT</span></span>
            </div>
            <span className={styles.badge}>CS2 · FACEIT ESEA</span>
          </div>
        </header>
        <SetupWizard onComplete={handleWizardComplete} onBack={() => setView('landing')} />
      </div>
    );
  }

  // Analysis view
  const poolMaps = getPoolMaps(lastExclude);

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
      <VetoFlowTab bansByMatchId={bansByMatchId} matchSummaries={result.matchSummaries} />
      <br />
      <VetoStrategy stats={result.stats} poolMaps={poolMaps} />
      <MapScenario stats={result.stats} poolMaps={poolMaps} />
    </>
  ) : null;

  const myTeamTab = result ? (
    <MyTeamTab myTeamStats={result.myTeamStats} oppName={result.opponent.name}
      oppMapStats={oppMapStats} oppOverallWR={result.stats.overallWR} players={result.players} />
  ) : null;

  const vetoSimTab = result ? (
    <VetoSimulator stats={result.stats} poolMaps={poolMaps} myTeamStats={result.myTeamStats} />
  ) : null;

  const historyTab = result ? (
    <HistoryTimeline matchSummaries={result.matchSummaries} bansByMatchId={bansByMatchId} opponent={result.opponent} />
  ) : null;

  const playerTab = result ? <PlayerTab players={result.players} /> : null;

  const tabs = result ? [
    { label: 'Map Statistics', icon: '⬡', content: mapTab },
    { label: 'Players',        icon: '◈', content: playerTab },
    { label: 'My Team',        icon: '⚑', content: myTeamTab },
    { label: 'Veto Simulator', icon: '⊘', content: vetoSimTab },
    { label: 'History',        icon: '◷', content: historyTab },
  ] : [];

  return (
    <div className={styles.app}>
      <div className={styles.scanlines} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo} onClick={() => { if (!loading) setView('landing'); }} style={{ cursor: 'pointer' }}>
            <div className={styles.logoIcon}>◆</div>
            <span className={styles.logoText}>VETO<span>SCOUT</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {result && (
              <button onClick={handleNewAnalysis} className={styles.newBtn}>+ New Analysis</button>
            )}
            <span className={styles.badge}>CS2 · FACEIT ESEA</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Loading state */}
        {loading && (
          <div className={styles.loadingCard}>
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingText}>{statusMsg}</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && <div className={styles.errorMsg}>⚠ {error}</div>}

        {result && (
          <div className={styles.results}>
            <div className={styles.oppHeader}>
              {result.opponent.avatar && (
                <img className={styles.avatar} src={result.opponent.avatar} alt={result.opponent.name}
                  onError={e => { e.target.style.display = 'none'; }} />
              )}
              <div className={styles.oppInfo}>
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
                      <span style={{ color: 'var(--teal)' }}>{result.stats.totalWins}W</span>{' – '}
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

            {result.opponent?.id && (
              <UpcomingPanel opponentId={result.opponent.id} onSelectMatch={handleSelectMatch} />
            )}

            <TabLayout tabs={tabs} />
          </div>
        )}
      </main>
    </div>
  );
}
