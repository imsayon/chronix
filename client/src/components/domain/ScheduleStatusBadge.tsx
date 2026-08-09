type Status = 'active' | 'paused' | 'completed' | 'error' | 'pending' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'dead_lettered';

export function ScheduleStatusBadge({ status }: { status: Status }) {
  let statusClass = 'status';
  let dotColor = 'currentColor';

  switch (status) {
    case 'active':
    case 'completed':
    case 'running':
    case 'succeeded':
      statusClass += ' status--healthy';
      dotColor = 'var(--success)';
      break;
    case 'paused':
    case 'pending':
    case 'claimed':
      statusClass += ' status--paused';
      dotColor = 'var(--paused)';
      break;
    case 'error':
    case 'failed':
    case 'dead_lettered':
      statusClass += ' status--attention'; // Need something reddish, maybe just inline style if no red available
      dotColor = 'var(--action)'; // action is #a84315 which is brownish/red
      break;
    default:
      dotColor = 'var(--ink-muted)';
      break;
  }

  // Fallback for custom colors if missing in CSS
  if (status === 'error' || status === 'failed' || status === 'dead_lettered') {
    statusClass = 'status'; // fallback
    dotColor = '#a83222'; // Error color used in existing page
  }
  if (status === 'completed') {
    statusClass = 'status';
    dotColor = '#2563eb'; // blue
  }

  return (
    <span className={statusClass} style={status === 'error' || status === 'failed' || status === 'dead_lettered' ? { color: '#a83222' } : status === 'completed' ? { color: '#2563eb' } : {}}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="3" fill={dotColor} />
      </svg>
      <span style={{ textTransform: 'capitalize' }}>{status}</span>
    </span>
  );
}
