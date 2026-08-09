'use client';

import { use, useEffect, useState } from 'react';
import { WorkerHeartbeatCard } from '@/components/WorkerHeartbeatCard';
import type { WorkerRegistration } from '@/components/WorkerHeartbeatCard';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth';

export default function WorkersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);
  const [workers, setWorkers] = useState<WorkerRegistration[]>([]);
  const [observedAt, setObservedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchWorkers = async () => {
      try {
        const token = getAccessToken();
        const response = await apiFetch<WorkerRegistration[]>(
          `/api/v1/workspaces/${workspaceId}/workers`,
          { headers: token === null ? {} : { Authorization: `Bearer ${token}` } },
        );
        if (active) {
          setWorkers(response.data);
          setObservedAt(new Date().getTime());
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchWorkers();
    const interval = window.setInterval(() => void fetchWorkers(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [workspaceId]);

  return (
    <div className="detail-page">
      <header className="detail-heading">
        <div><p className="eyebrow">Runtime</p><h1>Worker fleet</h1><p className="muted-copy">Executor registrations and recent heartbeats.</p></div>
      </header>
      {loading ? (
        <div className="empty-state">Loading workers…</div>
      ) : failed ? (
        <div className="empty-state"><h3>Worker status unavailable</h3><p>The API could not return fleet health.</p></div>
      ) : workers.length === 0 ? (
        <div className="empty-state"><h3>No active workers</h3><p>Start an executor to process webhook deliveries.</p></div>
      ) : (
        <div className="worker-grid">
          {workers.map((worker) => (
            <WorkerHeartbeatCard key={worker.workerId} worker={worker} observedAt={observedAt} />
          ))}
        </div>
      )}
    </div>
  );
}
