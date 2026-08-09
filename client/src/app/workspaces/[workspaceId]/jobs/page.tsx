'use client';

import Link from 'next/link';
import { useJobs } from '@/lib/api/jobs';
import { formatDistanceToNow } from 'date-fns';
import { use } from 'react';

export default function JobsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params);
  const { data: jobs, isLoading, error } = useJobs(workspaceId);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Jobs</h1>
          <p style={{ color: 'var(--ink-muted)', marginTop: 4 }}>Manage webhook targets for this workspace.</p>
        </div>
        <Link href={`/workspaces/${workspaceId}/jobs/new`} className="button button--primary" style={{ textDecoration: 'none' }}>
          New Job
        </Link>
      </div>

      {isLoading ? (
        <div>Loading jobs...</div>
      ) : error ? (
        <div style={{ color: 'red' }}>Error loading jobs</div>
      ) : jobs?.length === 0 ? (
        <div className="empty-state">
          <h3>No jobs found</h3>
          <p>Create a job to define a webhook target.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs?.map((job) => (
            <div key={job.id} style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{job.name}</h3>
                  {job.description && <p style={{ fontSize: 14, color: 'var(--ink-muted)', margin: '4px 0 0 0' }}>{job.description}</p>}
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink-muted)' }}>
                    <span style={{ padding: '2px 6px', background: 'var(--surface-hover)', borderRadius: 4, fontWeight: 500 }}>{job.httpMethod}</span>
                    <span style={{ fontFamily: 'monospace' }}>{job.targetUrl}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Created {formatDistanceToNow(new Date(job.createdAt))} ago</div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: job.isEnabled ? 'green' : 'gray' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: job.isEnabled ? 'green' : 'gray' }} />
                      {job.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
