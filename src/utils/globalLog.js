// In-memory global log and utility
const globalLog = [];

export function logGlobalError(message) {
  globalLog.push({ message, time: new Date().toLocaleTimeString() });
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('globalLogUpdate'));
  }
}

export function getGlobalLog() {
  return globalLog;
}
