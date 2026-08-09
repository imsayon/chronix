'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSchedule } from '@/lib/api/schedules';
import { useJobs } from '@/lib/api/jobs';
import Link from 'next/link';

export default function NewSchedulePage({ params }: { params: { workspaceId: string } }) {
  const { workspaceId } = params;
  const router = useRouter();
  const createSchedule = useCreateSchedule(workspaceId);
  const { data: jobs, isLoading: jobsLoading } = useJobs(workspaceId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobId, setJobId] = useState('');
  const [scheduleType, setScheduleType] = useState<'cron' | 'one_time'>('cron');
  const [cronExpression, setCronExpression] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [runAt, setRunAt] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!jobId) {
      setError('Please select a job');
      return;
    }

    try {
      await createSchedule.mutateAsync({
        name,
        description,
        jobId,
        scheduleType,
        ...(scheduleType === 'cron' ? { cronExpression, timezone } : { runAt: new Date(runAt).toISOString() })
      });
      router.push(`/workspaces/${workspaceId}/schedules`);
    } catch (err: any) {
      setError(err.message || 'Failed to create schedule');
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 32 }}>
        <Link href={`/workspaces/${workspaceId}/schedules`} style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Schedules
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '16px 0 0 0' }}>Create Schedule</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nightly Sync"
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Target Job</label>
          <select
            required
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          >
            <option value="" disabled>Select a job...</option>
            {jobs?.map(job => (
              <option key={job.id} value={job.id}>{job.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Schedule Type</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={scheduleType === 'cron'} onChange={() => setScheduleType('cron')} />
              Recurring (Cron)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={scheduleType === 'one_time'} onChange={() => setScheduleType('one_time')} />
              One-time
            </label>
          </div>
        </div>

        {scheduleType === 'cron' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Cron Expression</label>
              <input
                type="text"
                required
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="* * * * *"
                style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500 }}>Timezone</label>
              <input
                type="text"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
                style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
              />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 500 }}>Run At</label>
            <input
              type="datetime-local"
              required
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
            />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            type="submit"
            className="button button--primary"
            disabled={createSchedule.isPending || jobsLoading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {createSchedule.isPending ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}
