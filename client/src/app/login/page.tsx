'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import { ApiRequestError } from '@/lib/api/client';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/workspaces');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.error.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        {/* Wordmark */}
        <div className="auth-brand">
          <span className="wordmark__glyph" aria-hidden>Cx</span>
          <span className="wordmark" style={{ fontSize: 22 }}>Chronix</span>
        </div>

        <div className="auth-header">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-subtitle">Welcome back — sign in to your workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <label className="auth-label" htmlFor="login-email">
            Email
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="you@example.com"
              className="auth-input"
            />
          </label>

          <label className="auth-label" htmlFor="login-password">
            Password
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
              className="auth-input"
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="button button--primary auth-submit"
          >
            {loading ? (
              <>
                <svg className="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                Signing in…
              </>
            ) : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="auth-link">Create one</Link>
        </p>
      </div>

      <style>{`
        .auth-shell {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 24px 16px;
          background: var(--canvas);
        }
        .auth-card {
          width: min(420px, 100%);
          padding: 36px 32px 28px;
          border: 1px solid var(--line-strong);
          border-radius: 12px;
          background: var(--surface);
          box-shadow: 0 4px 24px rgb(56 39 25 / .07);
        }
        .auth-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 28px;
        }
        .auth-header { margin-bottom: 24px; }
        .auth-title {
          font-size: 22px;
          font-weight: 670;
          letter-spacing: -.04em;
          margin-bottom: 5px;
        }
        .auth-subtitle { color: var(--ink-muted); font-size: 14px; }
        .auth-form { display: grid; gap: 16px; }
        .auth-label {
          display: grid;
          gap: 6px;
          color: #4f463f;
          font-size: 13px;
          font-weight: 590;
        }
        .auth-input {
          height: 40px;
          padding: 0 12px;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: #fffefa;
          color: var(--ink);
          font-size: 14px;
          outline: none;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .auth-input:focus {
          border-color: var(--focus);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 17%, transparent);
        }
        .auth-input:disabled { opacity: .6; }
        .auth-error {
          margin: 0;
          padding: 10px 12px;
          border-radius: 7px;
          background: #fef2ef;
          border: 1px solid #f3c5b8;
          color: #a83222;
          font-size: 13px;
        }
        .auth-submit {
          height: 42px;
          font-size: 14px;
          margin-top: 4px;
          width: 100%;
          justify-content: center;
        }
        .auth-footer {
          margin: 20px 0 0;
          color: var(--ink-muted);
          font-size: 13px;
          text-align: center;
        }
        .auth-link { color: var(--action); font-weight: 580; }
        .auth-link:hover { text-decoration: underline; text-underline-offset: 3px; }
      `}</style>
    </main>
  );
}
