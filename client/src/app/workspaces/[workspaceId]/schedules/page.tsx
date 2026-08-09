'use client';

import Link from 'next/link';
import { useSchedules } from '@/lib/api/schedules';
import { formatDistanceToNow, format } from 'date-fns';
import { ScheduleStatusBadge } from '@/components/domain/ScheduleStatusBadge';
import { CronHumanReadable } from '@/components/domain/CronHumanReadable';
import { use } from 'react';

export default function SchedulesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { data: schedules, isLoading, error } = useSchedules(workspaceId);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Schedules</h1>
          <p style={{ color: 'var(--ink-muted)', marginTop: 4 }}>Manage triggers for your jobs.</p>
        </div>
        <Link href={`/workspaces/${workspaceId}/schedules/new`} className="button button--primary" style={{ textDecoration: 'none' }}>
          New Schedule
        </Link>
      </div>

      {isLoading ? (
        <div>Loading schedules...</div>
      ) : error ? (
        <div style={{ color: 'red' }}>Error loading schedules</div>
      ) : schedules?.length === 0 ? (
        <div className="empty-state">
          <h3>No schedules found</h3>
          <p>Create a schedule to trigger your jobs.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {schedules?.map((schedule) => (
            <Link
              key={schedule.id}
              href={`/workspaces/${workspaceId}/schedules/${schedule.id}`}
              style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{schedule.name}</h3>
                    <ScheduleStatusBadge status={schedule.status} />
                  </div>
                  {schedule.description && <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: '4px 0 0 0' }}>{schedule.description}</p>}

                  <div style={{ marginTop: 12, fontSize: 14, color: 'var(--ink-muted)' }}>
                    {schedule.scheduleType === 'cron' ? (
                      <CronHumanReadable expression={schedule.cronExpression!} timezone={schedule.timezone!} />
                    ) : (
                      <span>One-time at {schedule.runAt ? format(new Date(schedule.runAt), 'PPpp') : 'Unknown'}</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    Next run: {schedule.nextRunAt ? formatDistanceToNow(new Date(schedule.nextRunAt), { addSuffix: true }) : 'None'}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
