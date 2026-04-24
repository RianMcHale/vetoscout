// import { useState } from 'react';
// import styles from './ReportTab.module.css';

// export default function ReportTab({ result, poolMaps }) {
//   const [report, setReport] = useState(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError]   = useState(null);

//   async function generate() {
//     setLoading(true);
//     setError(null);
//     setReport(null);

//     const { opponent, stats, players, formGuide, myTeamStats } = result;

//     // Build a rich context string for Claude
//     const mapPool = poolMaps.filter(m => (stats.playCounts[m] || 0) > 0);
//     const mapSummary = mapPool.map(m => {
//       const wr = stats.winRates[m] || 0;
//       const g  = stats.playCounts[m] || 0;
//       const b  = stats.banCounts[m]  || 0;
//       return `${m}: ${g}G ${wr}%WR ${b} bans`;
//     }).join(', ');

//     const playerSummary = (players || []).map(p =>
//       `${p.nickname} (${p.role}): KD=${p.kd?.toFixed(2)} ADR=${Math.round(p.adr)} HS=${p.hs} Entry=${Math.round((p.entryRate||0)*100)}%`
//     ).join('\n');

//     const formStr = (formGuide || []).map(f => f.result).join('');
//     const rec = stats.recommendation;

//     const myMapStr = myTeamStats
//       ? Object.entries(myTeamStats.mapStats || {})
//           .filter(([,v]) => v.played >= 3)
//           .map(([m,v]) => `${m}: ${v.wr}%WR ${v.played}G`)
//           .join(', ')
//       : 'Not provided';

//     const prompt = `You are a CS2 pre-match analyst for a semi-professional ESEA team. Generate a concise, tactical pre-match briefing (4-6 sentences) about the opponent team.

// OPPONENT: ${opponent.name}
// OVERALL: ${stats.totalWins}W-${stats.totalLosses}L (${stats.overallWR}% WR) over ${result.matchesAnalysed} matches
// RECENT FORM (newest first): ${formStr || 'N/A'}
// MAP DATA: ${mapSummary}
// SUGGESTED BANS: ${rec?.suggestedBans?.join(', ') || 'N/A'}

// PLAYER PROFILES:
// ${playerSummary}

// MY TEAM MAP STATS: ${myMapStr}

// Write a briefing that covers: their strongest and weakest maps, the key player threat(s) to watch, their playstyle tendencies (aggressive/passive, utility-heavy etc), and a recommended veto approach. Be direct and tactical — this is for a coach's pre-match notes, not a general audience. No bullet points, flowing prose only.`;

//     try {
//       const res = await fetch('/api/claude', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           messages: [{ role: 'user', content: prompt }],
//           max_tokens: 1000,
//         }),
//       });
//       const data = await res.json();
//       if (!res.ok) {
//         setError('AI error: ' + (data.error?.message || data.error || 'Check ANTHROPIC_API_KEY in server/.env'));
//         return;
//       }
//       const text = data.content?.find(b => b.type === 'text')?.text;
//       if (text) setReport(text);
//       else setError('No response from AI. Ensure ANTHROPIC_API_KEY is set in server/.env');
//     } catch (e) {
//       setError('Failed to generate report: ' + e.message);
//     } finally {
//       setLoading(false);
//     }
//   }

//   return (
//     <div className={styles.wrap}>
//       <div className={styles.header}>
//         <div>
//           <div className={styles.title}>AI Pre-Match Briefing</div>
//           <div className={styles.subtitle}>
//             Powered by Claude · Uses all analysed match data
//           </div>
//         </div>
//         <button
//           className={styles.generateBtn}
//           onClick={generate}
//           disabled={loading}
//         >
//           {loading ? (
//             <><span className={styles.spinner} /> Analysing…</>
//           ) : report ? (
//             '↺ Regenerate'
//           ) : (
//             '✦ Generate Briefing'
//           )}
//         </button>
//       </div>

//       {error && <div className={styles.error}>⚠ {error}</div>}

//       {!report && !loading && (
//         <div className={styles.placeholder}>
//           <div className={styles.placeholderIcon}>◆</div>
//           <div className={styles.placeholderText}>
//             Click "Generate Briefing" to get an AI-powered scouting report based on all the data collected for this opponent.
//           </div>
//         </div>
//       )}

//       {loading && (
//         <div className={styles.loading}>
//           <div className={styles.loadingBar} />
//           <div className={styles.loadingText}>Analysing {result?.opponent?.name}…</div>
//         </div>
//       )}

//       {report && (
//         <div className={styles.report}>
//           <div className={styles.reportMeta}>
//             Generated for {result?.opponent?.name} · {result?.matchesAnalysed} matches analysed
//           </div>
//           <div className={styles.reportText}>{report}</div>
//         </div>
//       )}
//     </div>
//   );
// }
