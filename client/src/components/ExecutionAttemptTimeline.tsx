import type { ExecutionAttempt } from '@/lib/api/executions';

export function ExecutionAttemptTimeline({ attempts }: { attempts: ExecutionAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="muted-copy">No delivery attempts have started.</p>;
  }

  return (
    <ol className="attempt-list">
      {attempts.map((attempt) => (
        <li key={attempt.id} className="attempt-row">
          <div className="attempt-row__heading">
            <strong>Attempt {attempt.attemptNumber}</strong>
            <time dateTime={attempt.startedAt}>{new Date(attempt.startedAt).toLocaleString()}</time>
          </div>
          <dl className="attempt-row__facts">
            <div><dt>Outcome</dt><dd>{attempt.outcome ?? 'in progress'}</dd></div>
            <div><dt>HTTP</dt><dd>{attempt.httpStatusCode ?? '—'}</dd></div>
            <div><dt>Duration</dt><dd>{attempt.durationMs === null ? '—' : `${attempt.durationMs} ms`}</dd></div>
            <div><dt>Worker</dt><dd className="mono">{attempt.workerId}</dd></div>
          </dl>
          {attempt.errorMessage !== null && <p className="inline-error">{attempt.errorMessage}</p>}
          {attempt.responseBodySample !== null && (
            <pre className="response-sample">{attempt.responseBodySample}</pre>
          )}
        </li>
      ))}
    </ol>
  );
}
