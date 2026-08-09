import { ServerIcon } from 'lucide-react';

export interface WorkerRegistration {
  workerId: string;
  hostname: string;
  processId: number;
  version: string;
  concurrency: number;
  lastHeartbeat: string;
}

export function WorkerHeartbeatCard({
  worker,
  observedAt,
}: {
  worker: WorkerRegistration;
  observedAt: number;
}) {
  const lastSeen = new Date(worker.lastHeartbeat);
  const isStale = observedAt - lastSeen.getTime() > 2 * 60 * 1_000;

  return (
    <article className={isStale ? 'worker-card worker-card--stale' : 'worker-card'}>
      <header><ServerIcon size={16} aria-hidden="true" /><strong>{worker.hostname}</strong><span className="status-dot" aria-hidden="true" /></header>
      <dl>
        <div><dt>Worker ID</dt><dd className="mono">{worker.workerId}</dd></div>
        <div><dt>Process</dt><dd>{worker.processId}</dd></div>
        <div><dt>Version</dt><dd>{worker.version}</dd></div>
        <div><dt>Concurrency</dt><dd>{worker.concurrency}</dd></div>
        <div><dt>Heartbeat</dt><dd>{lastSeen.toLocaleTimeString()}</dd></div>
      </dl>
    </article>
  );
}
