export interface LogEntry {
  message: string;
  time: string;
}

// In-memory global log and utility
const globalLog: LogEntry[] = [];

export function logGlobalError(message: string): void {
  globalLog.push({ message, time: new Date().toLocaleTimeString() });
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('globalLogUpdate'));
  }
}

export function getGlobalLog(): LogEntry[] {
  return globalLog;
}
