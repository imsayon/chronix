import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { getAccessToken } from '../auth';

export interface Execution {
  id: string;
  workspaceId: string;
  scheduleId: string;
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  nominalRunAt: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const getHeaders = () => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

export function useExecutions(workspaceId: string) {
  return useQuery({
    queryKey: ['executions', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ executions: Execution[] }>(`/api/v1/workspaces/${workspaceId}/executions`, {
        headers: getHeaders(),
      });
      return res.data.executions;
    },
    enabled: !!workspaceId,
  });
}

export function useExecution(workspaceId: string, executionId: string) {
  return useQuery({
    queryKey: ['execution', workspaceId, executionId],
    queryFn: async () => {
      const res = await apiFetch<{ execution: Execution }>(`/api/v1/workspaces/${workspaceId}/executions/${executionId}`, {
        headers: getHeaders(),
      });
      return res.data.execution;
    },
    enabled: !!workspaceId && !!executionId,
  });
}
