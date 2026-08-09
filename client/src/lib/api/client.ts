/**
 * API fetch utility.
 *
 * Wraps fetch with:
 *  - Base URL from env
 *  - Credentials: 'include' (sends cookies for auth)
 *  - Content-Type: application/json
 *  - Throws on non-2xx responses with structured error info
 */

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown[];
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
    public readonly requestId: string | undefined,
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta: { requestId?: string } }> {
  const url = `${API_BASE}${path}`;

  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errBody = body as { error: ApiError; meta?: { requestId?: string } };
    throw new ApiRequestError(response.status, errBody.error, errBody.meta?.requestId);
  }

  return body as { data: T; meta: { requestId?: string } };
}
