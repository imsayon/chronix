'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { use } from 'react';

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const pathname = usePathname();
  const { workspaceId } = use(params);

  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="sidebar-brand">
          <span className="wordmark__glyph" aria-hidden>Cx</span>
          <span className="wordmark">Chronix</span>
        </div>

        <nav className="sidebar-nav">
          <Link
            href={`/workspaces`}
            className="sidebar-link"
          >
            ← Back to Workspaces
          </Link>
          <div className="sidebar-divider" />
          <Link
            href={`/workspaces/${workspaceId}/jobs`}
            className={`sidebar-link ${pathname.includes('/jobs') ? 'active' : ''}`}
          >
            Jobs
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/schedules`}
            className={`sidebar-link ${pathname.includes('/schedules') ? 'active' : ''}`}
          >
            Schedules
          </Link>
        </nav>
      </aside>

      <main className="workspace-content">
        {children}
      </main>

      <style>{`
        .workspace-layout {
          display: flex;
          min-height: 100dvh;
          background: var(--canvas);
        }
        .workspace-sidebar {
          width: 240px;
          border-right: 1px solid var(--line);
          background: #fff;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 32px;
          padding: 0 8px;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sidebar-link {
          display: block;
          padding: 8px 12px;
          border-radius: 6px;
          color: var(--ink-muted);
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          transition: background 140ms ease, color 140ms ease;
        }
        .sidebar-link:hover {
          background: var(--surface-hover);
          color: var(--ink);
        }
        .sidebar-link.active {
          background: var(--surface-active, #f3ede6);
          color: var(--ink);
          font-weight: 600;
        }
        .sidebar-divider {
          height: 1px;
          background: var(--line);
          margin: 12px 0;
        }
        .workspace-content {
          flex: 1;
          min-width: 0;
          padding: 32px 48px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}
