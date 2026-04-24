import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import { MAP_COLORS, winRateColor } from '../lib/maps';
import styles from './MapCharts.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const TEXT = '#8b91a8';
const GRID = 'rgba(255,255,255,0.05)';

const base = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: TEXT, font: { size: 11 }, maxRotation: 30, autoSkip: false }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: TEXT, font: { size: 11 } }, grid: { color: GRID }, border: { display: false } },
  },
};

function ChartCard({ title, children, full }) {
  return (
    <div className={`${styles.card} ${full ? styles.full : ''}`}>
      <div className={styles.heading}>{title}</div>
      <div className={styles.canvasWrap}>{children}</div>
    </div>
  );
}

export default function MapCharts({ stats, poolMaps }) {
  const { banCounts, playCounts, winRates, pickCounts, deciderCounts } = stats;

  // Swap: Maps Played first, then Ban Frequency
  const playMaps   = [...poolMaps].filter(m => (playCounts[m]||0) > 0).sort((a,b) => (playCounts[b]||0)-(playCounts[a]||0));
  const banMaps    = [...poolMaps].sort((a,b) => (banCounts[b]||0)-(banCounts[a]||0));
  const playedMaps = [...poolMaps].filter(m => (playCounts[m]||0) > 0).sort((a,b) => (winRates[b]||0)-(winRates[a]||0));

  // Maps played — per-map colours
  const playData = {
    labels: playMaps,
    datasets: [{
      data: playMaps.map(m => playCounts[m] || 0),
      backgroundColor: playMaps.map(m => MAP_COLORS[m] || '#888'),
      borderRadius: 4, borderSkipped: false,
    }],
  };

  // Ban frequency — per-map colours
  const banData = {
    labels: banMaps,
    datasets: [{
      data: banMaps.map(m => banCounts[m] || 0),
      backgroundColor: banMaps.map(m => MAP_COLORS[m] || '#888'),
      borderRadius: 4, borderSkipped: false,
    }],
  };

  // Win rate — win rate colour buckets
  const winData = {
    labels: playedMaps,
    datasets: [{
      data: playedMaps.map(m => winRates[m] || 0),
      backgroundColor: playedMaps.map(m => winRateColor(winRates[m] || 0)),
      borderRadius: 4, borderSkipped: false,
    }],
  };

  // Picked vs landed on — per-map colours for both series
  const pickData = {
    labels: playMaps,
    datasets: [
      {
        label: 'Picked',
        data: playMaps.map(m => pickCounts[m] || 0),
        backgroundColor: playMaps.map(m => MAP_COLORS[m] || '#9b7fe8'),
        borderRadius: 3, borderSkipped: false,
      },
      {
        label: 'Decider / Leftover',
        data: playMaps.map(m => deciderCounts[m] || 0),
        backgroundColor: playMaps.map(m => {
          const c = MAP_COLORS[m] || '#888';
          // Desaturated version of the map colour for decider bars
          return c + '55'; // 33% opacity hex suffix
        }),
        borderRadius: 3, borderSkipped: false,
      },
    ],
  };

  const winOpts = {
    ...base,
    scales: {
      ...base.scales,
      y: { ...base.scales.y, max: 100, ticks: { ...base.scales.y.ticks, callback: v => v + '%' } },
    },
  };

  const stackOpts = {
    ...base,
    scales: {
      ...base.scales,
      x: { ...base.scales.x, stacked: true },
      y: { ...base.scales.y, stacked: true, ticks: { ...base.scales.y.ticks, stepSize: 1 } },
    },
    plugins: {
      legend: {
        display: true,
        labels: { color: TEXT, font: { size: 11 }, boxWidth: 10, usePointStyle: true, pointStyleWidth: 8 },
      },
    },
  };

  return (
    <>
      <div className={styles.grid}>
        {/* Row 1: Maps Played (swapped to first) + Ban Frequency */}
        <ChartCard title="Maps played">
          <Bar data={playData} options={base} />
        </ChartCard>
        <ChartCard title="Ban frequency">
          <Bar data={banData} options={base} />
        </ChartCard>
        {/* Row 2: Win rate + Picked vs landed on (now coloured) */}
        <ChartCard title="Win rate by map">
          <Bar data={winData} options={winOpts} />
        </ChartCard>
        <ChartCard title="Picked vs landed on">
          <Bar data={pickData} options={stackOpts} />
        </ChartCard>
      </div>
    </>
  );
}