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

export default function Banner({ message, severity = 'info', onClose }) {
  if (!message) return null;

  const { icon, container, iconColor } = severityStyles[severity] || severityStyles.info;

  return (
    <div
      className={`w-full ${container} text-white px-4 py-2 shadow z-60 flex items-center justify-between`}
      role="status"
      aria-live="polite"
      style={{ position: 'fixed', top: 72, left: 16, right: 16 }}
    >
      <div className="flex items-center gap-2">
        <span className={iconColor} aria-hidden="true">{icon}</span>
        <span>{message}</span>
      </div>
      <button
        className="text-white hover:text-gray-100 font-bold ml-2"
        onClick={onClose}
        title="Dismiss"
        type="button"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}