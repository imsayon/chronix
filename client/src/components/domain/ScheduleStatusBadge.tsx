import React from 'react';

type Status = 'active' | 'paused' | 'completed' | 'error' | 'pending' | 'running' | 'failed' | 'timeout';

export function ScheduleStatusBadge({ status }: { status: Status }) {
  let statusClass = 'status';
  let dotColor = 'currentColor';

  switch (status) {
    case 'active':
    case 'completed':
    case 'running':
      statusClass += ' status--healthy';
      dotColor = 'var(--success)';
      break;
    case 'paused':
    case 'pending':
      statusClass += ' status--paused';
      dotColor = 'var(--paused)';
      break;
    case 'error':
    case 'failed':
    case 'timeout':
      statusClass += ' status--attention'; // Need something reddish, maybe just inline style if no red available
      dotColor = 'var(--action)'; // action is #a84315 which is brownish/red
      break;
    default:
      dotColor = 'var(--ink-muted)';
      break;
  }

  // Fallback for custom colors if missing in CSS
  if (status === 'error' || status === 'failed' || status === 'timeout') {
    statusClass = 'status'; // fallback
    dotColor = '#a83222'; // Error color used in existing page
  }
  if (status === 'completed') {
    statusClass = 'status';
    dotColor = '#2563eb'; // blue
  }

  return (
    <span className={statusClass} style={status === 'error' || status === 'failed' || status === 'timeout' ? { color: '#a83222' } : status === 'completed' ? { color: '#2563eb' } : {}}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="3" fill={dotColor} />
      </svg>
      <span style={{ textTransform: 'capitalize' }}>{status}</span>
    </span>
  );
}
