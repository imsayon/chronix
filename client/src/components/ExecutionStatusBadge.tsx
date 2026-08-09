import type { ExecutionStatus } from '@/lib/api/executions';

const statusClass: Record<ExecutionStatus, string> = {
  pending: 'status status--paused',
  claimed: 'status status--paused',
  running: 'status status--healthy',
  succeeded: 'status status--healthy',
  failed: 'status status--attention',
  dead_lettered: 'status status--attention',
};

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <span className={statusClass[status]}>
      <span className="status-dot" aria-hidden="true" />
      {status.replace('_', ' ')}
    </span>
  );
}
