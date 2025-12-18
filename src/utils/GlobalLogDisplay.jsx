import React from 'react';
import { getGlobalLog } from './globalLog';

function useGlobalLogDisplay() {
  const [_, forceUpdate] = React.useState(0);
  React.useEffect(() => {
    const handler = () => forceUpdate(x => x + 1);
    window.addEventListener('globalLogUpdate', handler);
    return () => window.removeEventListener('globalLogUpdate', handler);
  }, []);
  return getGlobalLog();
}

export function GlobalLogDisplay() {
  const log = useGlobalLogDisplay();
  if (!log.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, background: '#fffbe9', borderTop: '2px solid #fbbf24', maxHeight: 200, overflowY: 'auto', fontSize: 14, padding: 8 }}>
      <strong>Global Log:</strong>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {log.slice(-10).map((entry, i) => (
          <li key={i} style={{ color: '#b91c1c', marginBottom: 2 }}>
            [{entry.time}] {entry.message}
          </li>
        ))}
      </ul>
    </div>
  );
}