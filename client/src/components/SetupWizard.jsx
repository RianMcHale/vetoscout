import { useState, useCallback } from 'react';
import axios from 'axios';
import styles from './SetupWizard.module.css';

const ACTIVE_POOL = ['Mirage', 'Inferno', 'Dust2', 'Nuke', 'Ancient', 'Anubis', 'Overpass'];

const MAP_IMAGES = {
  Mirage:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7fb7d725-e44d-4e3c-b557-e1d19b260ab8_1695819144685.jpeg',
  Inferno:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/993380de-bb5b-4aa1-ada9-a0c1741dc475_1695819220797.jpeg',
  Dust2:    'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7c17caa9-64a6-4496-8a0b-885e0f038d79_1695819126962.jpeg',
  Nuke:     'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7197a969-81e4-4fef-8764-55f46c7cec6e_1695819158849.jpeg',
  Ancient:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/5b844241-5b15-45bf-a304-ad6df63b5ce5_1695819190976.jpeg',
  Anubis:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/31f01daf-e531-43cf-b949-c094ebc9b3ea_1695819235255.jpeg',
  Overpass: 'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/058c4eb3-dac4-441c-a810-70afa0f3022c_1695819170133.jpeg',
};

export default function SetupWizard({ onComplete, onBack }) {
  const [step, setStep]             = useState(1);
  const [matchInput, setMatchInput] = useState('');
  const [matchInfo, setMatchInfo]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [myTeam, setMyTeam]         = useState('');
  const [permaBans, setPermaBans]   = useState(new Set());

  // Step 1: fetch match room info
  const handleMatchSubmit = useCallback(async () => {
    if (!matchInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/match-info', {
        params: { matchInput: matchInput.trim() },
        timeout: 15000,
      });
      setMatchInfo(data);
      setStep(2);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load match room.');
    } finally {
      setLoading(false);
    }
  }, [matchInput]);

  // Step 2: select team
  const handleTeamSelect = (teamName) => {
    setMyTeam(teamName);
    setStep(3);
  };

  // Step 3: toggle permaban
  const toggleBan = (map) => {
    setPermaBans(prev => {
      const next = new Set(prev);
      if (next.has(map)) next.delete(map);
      else next.add(map);
      return next;
    });
  };

  // Final: launch analysis
  const handleLaunch = () => {
    onComplete({
      matchInput: matchInput.trim(),
      myTeam,
      myPermaBans: [...permaBans].join(', '),
      excludeMaps: '',
    });
  };

  return (
    <div className={styles.wizard}>
      {/* Progress indicator */}
      <div className={styles.progress}>
        {[1, 2, 3].map(s => (
          <div key={s} className={`${styles.progressStep} ${step >= s ? styles.progressActive : ''} ${step === s ? styles.progressCurrent : ''}`}>
            <div className={styles.progressDot}>{step > s ? '✓' : s}</div>
            <span className={styles.progressLabel}>
              {s === 1 ? 'Match Room' : s === 2 ? 'Your Team' : 'Permabans'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Match Room URL */}
      {step === 1 && (
        <div className={styles.stepCard}>
          <h2 className={styles.stepTitle}>Paste your match room</h2>
          <p className={styles.stepSub}>Enter a FACEIT match room URL or ID</p>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="https://www.faceit.com/en/cs2/room/1-abc..."
              value={matchInput}
              onChange={e => setMatchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMatchSubmit()}
              autoFocus
              disabled={loading}
            />
            <button className={styles.btn} onClick={handleMatchSubmit} disabled={loading || !matchInput.trim()}>
              {loading ? <span className={styles.spinner} /> : 'Next →'}
            </button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.backLink} onClick={onBack}>← Back to home</button>
        </div>
      )}

      {/* Step 2: Select Your Team */}
      {step === 2 && matchInfo && (
        <div className={styles.stepCard}>
          <h2 className={styles.stepTitle}>Which team are you?</h2>
          {matchInfo.competition && (
            <p className={styles.stepSub}>{matchInfo.competition}</p>
          )}
          <div className={styles.teamGrid}>
            {matchInfo.teams.map(t => (
              <button
                key={t.id}
                className={styles.teamCard}
                onClick={() => handleTeamSelect(t.name)}
              >
                {t.avatar && (
                  <img className={styles.teamAvatar} src={t.avatar} alt={t.name} onError={e => e.target.style.display = 'none'} />
                )}
                <div className={styles.teamName}>{t.name}</div>
                <div className={styles.teamRoster}>
                  {t.roster.slice(0, 5).map(p => (
                    <span key={p.id} className={styles.rosterPlayer}>
                      {p.nickname}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <button className={styles.backLink} onClick={() => setStep(1)}>← Change match room</button>
        </div>
      )}

      {/* Step 3: Select Permabans */}
      {step === 3 && (
        <div className={styles.stepCard}>
          <h2 className={styles.stepTitle}>Your permabans</h2>
          <p className={styles.stepSub}>Select maps your team always bans (optional)</p>
          <div className={styles.mapGrid}>
            {ACTIVE_POOL.map(map => {
              const banned = permaBans.has(map);
              return (
                <button
                  key={map}
                  className={`${styles.mapCard} ${banned ? styles.mapBanned : ''}`}
                  onClick={() => toggleBan(map)}
                >
                  <img
                    className={styles.mapImg}
                    src={MAP_IMAGES[map]}
                    alt={map}
                    onError={e => e.target.style.display = 'none'}
                  />
                  <div className={styles.mapOverlay}>
                    <span className={styles.mapName}>{map}</span>
                    {banned && <span className={styles.mapBanIcon}>✕</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className={styles.launchRow}>
            <button className={styles.backLink} onClick={() => setStep(2)}>← Change team</button>
            <button className={styles.launchBtn} onClick={handleLaunch}>
              Analyse {matchInfo?.teams?.find(t => t.name !== myTeam)?.name || 'Opponent'} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
