'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateJob } from '@/lib/api/jobs';
import Link from 'next/link';

export default function NewJobPage({ params }: { params: { workspaceId: string } }) {
  const { workspaceId } = params;
  const router = useRouter();
  const createJob = useCreateJob(workspaceId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [httpMethod, setHttpMethod] = useState('POST');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await createJob.mutateAsync({
        name,
        description,
        targetUrl,
        httpMethod,
      });
      router.push(`/workspaces/${workspaceId}/jobs`);
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 32 }}>
        <Link href={`/workspaces/${workspaceId}/jobs`} style={{ color: 'var(--ink-muted)', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Jobs
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '16px 0 0 0' }}>Create Job</h1>
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
            placeholder="e.g. Sync Users"
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
          <label style={{ fontSize: 14, fontWeight: 500 }}>Target URL</label>
          <input
            type="url"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://api.example.com/webhook"
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>HTTP Method</label>
          <select
            value={httpMethod}
            onChange={(e) => setHttpMethod(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="submit"
            className="button button--primary"
            disabled={createJob.isPending}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {createJob.isPending ? 'Creating...' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
