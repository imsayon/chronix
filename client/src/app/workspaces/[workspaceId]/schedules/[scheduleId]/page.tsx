'use client';

import { use, useState } from 'react';
import { useSchedule, usePauseSchedule, useResumeSchedule, useDeleteSchedule } from '@/lib/api/schedules';
import { useExecutions } from '@/lib/api/executions';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { ScheduleStatusBadge } from '@/components/domain/ScheduleStatusBadge';
import { CronHumanReadable } from '@/components/domain/CronHumanReadable';
import { TriggerButton } from '@/components/domain/TriggerButton';

export default function ScheduleDetailPage({ params }: { params: Promise<{ workspaceId: string, scheduleId: string }> }) {
  const { workspaceId, scheduleId } = use(params);
  const router = useRouter();

  const { data: schedule, isLoading, error } = useSchedule(workspaceId, scheduleId);
  const pause = usePauseSchedule(workspaceId);
  const resume = useResumeSchedule(workspaceId);
  const del = useDeleteSchedule(workspaceId);

  const { data: executions, isLoading: execLoading } = useExecutions(workspaceId, { scheduleId, limit: 10 });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handlePauseResume = async () => {
    if (!schedule) return;
    try {
      if (schedule.status === 'paused') {
        await resume.mutateAsync(scheduleId);
      } else if (schedule.status === 'active') {
        await pause.mutateAsync(scheduleId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await del.mutateAsync(scheduleId);
      router.push(`/workspaces/${workspaceId}/schedules`);
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div>Loading schedule...</div>;
  if (error || !schedule) return <div style={{ color: 'red' }}>Error loading schedule</div>;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <Link href={`/workspaces/${workspaceId}/schedules`} style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Schedules
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{schedule.name}</h1>
              <ScheduleStatusBadge status={schedule.status} />
            </div>
            {schedule.description && <p style={{ fontSize: 16, color: 'var(--ink-muted)', margin: '8px 0 0 0' }}>{schedule.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <TriggerButton workspaceId={workspaceId} scheduleId={scheduleId} disabled={schedule.status !== 'active'} />

            {(schedule.status === 'active' || schedule.status === 'paused') && (
              <button
                className="button button--secondary"
                onClick={handlePauseResume}
                disabled={pause.isPending || resume.isPending}
              >
                {schedule.status === 'active' ? 'Pause' : 'Resume'}
              </button>
            )}

            <button
              className="button button--secondary"
              style={{ color: deleteConfirm ? '#fff' : '#a83222', background: deleteConfirm ? '#a83222' : undefined }}
              onClick={handleDelete}
              disabled={del.isPending}
            >
              {deleteConfirm ? 'Click to confirm delete' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 48 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, textTransform: 'uppercase', color: 'var(--ink-muted)', letterSpacing: '0.05em' }}>Configuration</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Type</div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {schedule.scheduleType === 'cron' ? 'Recurring (Cron)' : 'One-time'}
              </div>
            </div>
            {schedule.scheduleType === 'cron' && (
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Expression</div>
                <CronHumanReadable expression={schedule.cronExpression!} timezone={schedule.timezone!} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Misfire Policy</div>
              <div style={{ fontSize: 15, fontWeight: 500, textTransform: 'capitalize' }}>{schedule.misfirePolicy.replace('_', ' ')}</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, textTransform: 'uppercase', color: 'var(--ink-muted)', letterSpacing: '0.05em' }}>Next Run</h3>
          {schedule.nextRunAt ? (
            <div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{formatDistanceToNow(new Date(schedule.nextRunAt), { addSuffix: true })}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-muted)', marginTop: 4 }}>{format(new Date(schedule.nextRunAt), 'PPpp')}</div>
            </div>
          ) : (
            <div style={{ fontSize: 15, color: 'var(--ink-muted)' }}>None</div>
          )}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Recent Executions</h2>
        {execLoading ? (
          <div>Loading executions...</div>
        ) : !executions || executions.length === 0 ? (
          <div style={{ color: 'var(--ink-muted)' }}>No executions yet.</div>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink-muted)' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink-muted)' }}>Trigger</th>
                  <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink-muted)' }}>Nominal Run At</th>
                  <th style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--ink-muted)' }}>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {executions.map(exec => (
                  <tr key={exec.id} style={{ borderBottom: '1px solid var(--line)', background: '#fff' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <ScheduleStatusBadge status={exec.status} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14, textTransform: 'capitalize' }}>
                      {exec.triggerType}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14 }}>
                      {format(new Date(exec.nominalRunAt), 'PPpp')}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 14 }}>
                      {exec.attemptCount} / {exec.maxRetries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
