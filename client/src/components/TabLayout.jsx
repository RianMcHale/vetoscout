import { useState } from 'react';
import styles from './TabLayout.module.css';

export default function TabLayout({ tabs }) {
  const [active, setActive] = useState(0);

  return (
    <div className={styles.wrap}>
      <div className={styles.tabBar}>
        {tabs.map((tab, i) => (
          <button
            key={i}
            className={`${styles.tab} ${active === i ? styles.tabActive : ''}`}
            onClick={() => setActive(i)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {tabs[active].content}
      </div>
    </div>
  );
}
