import React from 'react';

const severityStyles = {
  info: {
    icon: 'ℹ️',
    container: 'bg-blue-600',
    iconColor: 'text-blue-100',
  },
  success: {
    icon: '✅',
    container: 'bg-green-600',
    iconColor: 'text-green-100',
  },
  warning: {
    icon: '⚠️',
    container: 'bg-amber-500',
    iconColor: 'text-amber-100',
  },
  error: {
    icon: '⛔',
    container: 'bg-red-600',
    iconColor: 'text-red-100',
  },
};

export default function Toast({ message, severity = 'info', onClose }) {
  if (!message) return null;

  const { icon, container, iconColor } = severityStyles[severity] || severityStyles.info;

  return (
    <div className={`fixed top-32 right-4 ${container} text-white px-3 py-2 rounded-md shadow-lg z-40 max-w-sm text-sm`} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <span className={iconColor} aria-hidden="true">{icon}</span>
        <div className="flex-1">{message}</div>
        <button
          className="text-white hover:text-gray-100 font-bold ml-2"
          onClick={onClose}
          title="Dismiss"
          type="button"
        >
          ×
        </button>
      </div>
    </div>
  );
}
