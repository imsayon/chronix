import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { getAccessToken } from '../auth';

export interface Job {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  targetUrl: string;
  httpMethod: string;
  headers: Record<string, string>;
  bodyTemplate: string | null;
  timeoutMs: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const getHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function useJobs(workspaceId: string) {
  return useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ jobs: Job[] }>(`/api/v1/workspaces/${workspaceId}/jobs`, {
        headers: getHeaders(),
      });
      return res.data.jobs;
    },
    enabled: !!workspaceId,
  });
}

export function useJob(workspaceId: string, jobId: string) {
  return useQuery({
    queryKey: ['job', workspaceId, jobId],
    queryFn: async () => {
      const res = await apiFetch<{ job: Job }>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`, {
        headers: getHeaders(),
      });
      return res.data.job;
    },
    enabled: !!workspaceId && !!jobId,
  });
}

export function useCreateJob(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Job>) => {
      const res = await apiFetch<{ job: Job }>(`/api/v1/workspaces/${workspaceId}/jobs`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      return res.data.job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    },
  });
}

export function useUpdateJob(workspaceId: string, jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Job>) => {
      const res = await apiFetch<{ job: Job }>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      return res.data.job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', workspaceId, jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    },
  });
}

export function useDeleteJob(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    },
  });
}

export function useEnableJob(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch<{ job: Job }>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}/enable`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return res.data.job;
    },
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['job', workspaceId, jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    },
  });
}

export function useDisableJob(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch<{ job: Job }>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}/disable`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return res.data.job;
    },
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['job', workspaceId, jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    },
  });
}
