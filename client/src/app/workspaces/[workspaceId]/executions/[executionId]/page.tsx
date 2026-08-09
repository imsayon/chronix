'use client';

import { use } from 'react';
import { ExecutionAttemptTimeline } from '@/components/ExecutionAttemptTimeline';
import { ExecutionStatusBadge } from '@/components/ExecutionStatusBadge';
import { useExecution } from '@/lib/api/executions';

export default function ExecutionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; executionId: string }>;
}) {
  const { workspaceId, executionId } = use(params);
  const { data: execution, isLoading, error } = useExecution(workspaceId, executionId);

  if (isLoading) return <div className="empty-state">Loading execution details…</div>;
  if (error !== null || execution === undefined) {
    return <div className="empty-state"><h3>Execution unavailable</h3><p>Check the identifier or try again.</p></div>;
  }

  return (
    <div className="detail-page">
      <header className="detail-heading">
        <div>
          <p className="eyebrow">Execution</p>
          <h1>{execution.id}</h1>
        </div>
        <ExecutionStatusBadge status={execution.status} />
      </header>

      <section className="fact-grid" aria-label="Execution metadata">
        <dl>
          <div><dt>Job</dt><dd className="mono">{execution.jobId}</dd></div>
          <div><dt>Trigger</dt><dd>{execution.triggerType}</dd></div>
          <div><dt>Nominal run</dt><dd>{new Date(execution.nominalRunAt).toLocaleString()}</dd></div>
        </dl>
        <dl>
          <div><dt>Attempts</dt><dd>{execution.attemptCount} / {execution.maxRetries + 1}</dd></div>
          <div><dt>Next retry</dt><dd>{execution.nextRetryAt === null ? '—' : new Date(execution.nextRetryAt).toLocaleString()}</dd></div>
          <div><dt>Terminal</dt><dd>{execution.terminalAt === null ? '—' : new Date(execution.terminalAt).toLocaleString()}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <h2>Delivery timeline</h2>
        <ExecutionAttemptTimeline attempts={execution.attempts} />
      </section>
    </div>
  );
}
