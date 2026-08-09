'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import { WorkspaceCard, type Workspace } from '@/features/workspaces/workspace-card';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth';
import Link from 'next/link';

export default function WorkspacesPage() {
  const { isAuthenticated, isLoading, account, logout } = useAuth();
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }

    (async () => {
      try {
        const res = await apiFetch<{ workspaces: Workspace[] }>('/api/v1/workspaces', {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        setWorkspaces(res.data.workspaces);
      } catch {
        setFetchError('Failed to load workspaces. Please refresh.');
      } finally {
        setFetching(false);
      }
    })();
  }, [isAuthenticated, isLoading, router]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading) {
    return (
      <main className="ws-shell">
        <div className="ws-page">
          <div className="skeleton-list" style={{ padding: 0 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-row" style={{ gridTemplateColumns: '1fr', marginBottom: 10 }}>
                <span style={{ height: 72, borderRadius: 10 }} />
              </div>
            ))}
          </div>
        </div>
        <WsStyles />
      </main>
    );
  }

  return (
    <main className="ws-shell">
      <div className="ws-page">
        {/* Header */}
        <div className="ws-header">
          <div className="ws-brand">
            <span className="wordmark__glyph" aria-hidden>Cx</span>
            <span className="wordmark" style={{ fontSize: 20 }}>Chronix</span>
          </div>
          <button onClick={handleLogout} className="button button--secondary" style={{ fontSize: 13, height: 34 }}>
            Sign out
          </button>
        </div>

        <div className="page-heading" style={{ marginTop: 32 }}>
          <div>
            <h1>Workspaces</h1>
            {account && <p style={{ marginTop: 6, color: 'var(--ink-muted)', fontSize: 14 }}>Signed in as {account.email || 'your account'}</p>}
          </div>
        </div>

        {/* Workspace grid */}
        {fetching ? (
          <div className="ws-grid">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton-row" style={{ gridTemplateColumns: '42px 1fr', gap: 14, padding: '14px 18px', border: '1px solid var(--line)', borderRadius: 10 }}>
                <span style={{ width: 42, height: 42, borderRadius: 9, flexShrink: 0 }} />
                <span style={{ height: 42, borderRadius: 7 }} />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <p style={{ color: '#a83222', fontSize: 14 }}>{fetchError}</p>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 12h6M12 9v6"/></svg>
            <h3>No workspaces yet</h3>
            <p>Create a workspace to get started.</p>
          </div>
        ) : (
          <div className="ws-grid">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} workspace={ws} />
            ))}
          </div>
        )}
      </div>
      <WsStyles />
    </main>
  );
}

function WsStyles() {
  return (
    <style>{`.ws-shell{min-height:100dvh;background:var(--canvas);padding:24px 16px}.ws-page{width:min(680px,100%);margin:0 auto}.ws-header{display:flex;align-items:center;justify-content:space-between}.ws-brand{display:flex;align-items:center;gap:9px}.ws-grid{display:grid;gap:10px;margin-top:4px}`}</style>
  );
}
