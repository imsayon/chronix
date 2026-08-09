import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { getAccessToken } from '../auth';

export type ExecutionStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'dead_lettered';

export interface ExecutionAttempt {
  id: string;
  attemptNumber: number;
  workerId: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: string | null;
  httpStatusCode: number | null;
  durationMs: number | null;
  responseBodySample: string | null;
  errorMessage: string | null;
}

export interface Execution {
  id: string;
  workspaceId: string;
  scheduleId: string;
  jobId: string;
  triggerType: 'scheduled' | 'manual';
  status: ExecutionStatus;
  nominalRunAt: string;
  attemptCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  terminalAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ExecutionDetail extends Execution {
  attempts: ExecutionAttempt[];
}

export interface ExecutionQuery {
  scheduleId?: string;
  jobId?: string;
  status?: ExecutionStatus;
  limit?: number;
  cursor?: string;
}

const getHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function useExecutions(workspaceId: string, query: ExecutionQuery = {}) {
  return useQuery({
    queryKey: ['executions', workspaceId, query],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (query.scheduleId !== undefined) search.set('scheduleId', query.scheduleId);
      if (query.jobId !== undefined) search.set('jobId', query.jobId);
      if (query.status !== undefined) search.set('status', query.status);
      if (query.limit !== undefined) search.set('limit', String(query.limit));
      if (query.cursor !== undefined) search.set('cursor', query.cursor);
      const suffix = search.size === 0 ? '' : `?${search.toString()}`;
      const response = await apiFetch<{ executions: Execution[] }>(
        `/api/v1/workspaces/${workspaceId}/executions${suffix}`,
        { headers: getHeaders() },
      );
      return response.data.executions;
    },
    enabled: workspaceId.length > 0,
  });
}

export function useExecution(workspaceId: string, executionId: string) {
  return useQuery({
    queryKey: ['execution', workspaceId, executionId],
    queryFn: async () => {
      const response = await apiFetch<ExecutionDetail>(
        `/api/v1/workspaces/${workspaceId}/executions/${executionId}`,
        { headers: getHeaders() },
      );
      return response.data;
    },
    enabled: workspaceId.length > 0 && executionId.length > 0,
    refetchInterval: (queryState) => {
      const status = queryState.state.data?.status;
      return status === undefined || ['pending', 'claimed', 'running'].includes(status)
        ? 2_000
        : false;
    },
  });
}
