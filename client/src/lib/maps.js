export const MAPS = ['Mirage','Inferno','Nuke','Ancient','Anubis','Dust2','Overpass'];

export const ACTIVE_MAP_POOL = ['Mirage','Inferno','Dust2','Nuke','Ancient','Anubis','Overpass'];

export const MAP_COLORS = {
  Mirage:   '#9b7fe8',
  Inferno:  '#e05c3a',
  Nuke:     '#f0aa3c',
  Ancient:  '#2dd4a4',
  Anubis:   '#4a9eff',
  Dust2:    '#e84b9c',
  Overpass: '#7ecb6a',
  // Train:    '#888899',
  // Vertigo:  '#c1a05e',
};

/**
 * Win rate colour bucket matching spec §6:
 * green ≥60%, teal 45–59%, purple 35–44%, orange 25–34%, red <25%
 */
export function winRateColor(wr) {
  if (wr >= 60) return '#2dd4a4';   // teal/green
  if (wr >= 45) return '#4a9eff';   // blue
  if (wr >= 35) return '#9b7fe8';   // purple
  if (wr >= 25) return '#f0aa3c';   // amber
  return '#e05c3a';                 // red
}

/**
 * Use server-side recommendation if available (from /api/stats),
 * otherwise fall back to client-side confidence-weighted calculation.
 */
export function getVetoRecommendation(stats, poolMaps) {
  // Prefer server-computed recommendation which uses full spec §5 logic
  if (stats.recommendation?.suggestedBans?.length) {
    const [yourBan1, yourBan2] = stats.recommendation.suggestedBans;

    // Predicted opponent bans: their most-banned maps from history
    const oppBanOrder = [...poolMaps].sort(
      (a, b) => (stats.banCounts[b] || 0) - (stats.banCounts[a] || 0)
    );
    return {
      yourBan1: yourBan1 || oppBanOrder[0],
      yourBan2: yourBan2 || oppBanOrder[1],
      oppBan1: oppBanOrder[0],
      oppBan2: oppBanOrder[1],
      reasoning: stats.recommendation.reasoning,
      lowConfidence: stats.recommendation.lowConfidence || false,
    };
  }

  // Client-side fallback: sort by raw win rate with minimum 3 games
  const withData = poolMaps
    .map(m => ({
      map: m,
      games: stats.playCounts[m] || 0,
      wins: stats.winCounts?.[m] || 0,
      wr: (stats.playCounts[m] || 0) > 0
        ? (stats.winCounts?.[m] || 0) / stats.playCounts[m]
        : 0,
    }))
    .filter(m => m.games >= 3)
    .sort((a, b) => b.wr - a.wr);

  const yourBanTargets = withData.length > 0
    ? withData
    : [...poolMaps].map(m => ({ map: m, games: stats.playCounts[m] || 0 }))
        .sort((a, b) => b.games - a.games);

  const oppBanOrder = [...poolMaps].sort(
    (a, b) => (stats.banCounts[b] || 0) - (stats.banCounts[a] || 0)
  );

  return {
    yourBan1: yourBanTargets[0]?.map || poolMaps[0],
    yourBan2: yourBanTargets[1]?.map || poolMaps[1],
    oppBan1: oppBanOrder[0],
    oppBan2: oppBanOrder[1],
    reasoning: null,
    lowConfidence: withData.length === 0,
  };
}

export function getScenario(stats, poolMaps) {
  const oppBanOrder = [...poolMaps].sort(
    (a, b) => (stats.banCounts[b] || 0) - (stats.banCounts[a] || 0)
  );
  const oppWillBan = oppBanOrder.slice(0, 2);
  const remaining  = poolMaps.filter(m => !oppWillBan.includes(m));

  const total = remaining.reduce((s, m) => s + (stats.playCounts[m] || 1), 0);
  const likelyMaps = [...remaining]
    .sort((a, b) => (stats.playCounts[b] || 0) - (stats.playCounts[a] || 0))
    .map(m => ({
      map: m,
      pct: Math.round(((stats.playCounts[m] || 1) / total) * 100),
      wr: stats.winRates[m] || 0,
      games: stats.playCounts[m] || 0,
    }));

  return { oppWillBan, remaining, likelyMaps };
}

export const MAP_IMAGES = {
  Mirage:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7fb7d725-e44d-4e3c-b557-e1d19b260ab8_1695819144685.jpeg',
  Inferno:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/993380de-bb5b-4aa1-ada9-a0c1741dc475_1695819220797.jpeg',
  Dust2:    'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7c17caa9-64a6-4496-8a0b-885e0f038d79_1695819126962.jpeg',
  Nuke:     'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/7197a969-81e4-4fef-8764-55f46c7cec6e_1695819158849.jpeg',
  Ancient:  'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/5b844241-5b15-45bf-a304-ad6df63b5ce5_1695819190976.jpeg',
  Anubis:   'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/31f01daf-e531-43cf-b949-c094ebc9b3ea_1695819235255.jpeg',
  Overpass: 'https://assets.faceit-cdn.net/third_party/games/ce652bd4-0abb-4c90-9936-1133965ca38b/assets/votables/058c4eb3-dac4-441c-a810-70afa0f3022c_1695819170133.jpeg',
};