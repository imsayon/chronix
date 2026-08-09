import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { getAccessToken } from '../auth';

export interface Schedule {
  id: string;
  workspaceId: string;
  jobId: string;
  name: string;
  description: string | null;
  scheduleType: 'cron' | 'one_time';
  cronExpression: string | null;
  timezone: string;
  runAt: string | null;
  misfirePolicy: string;
  maxRetries: number;
  retryBackoffBaseMs: number;
  status: 'active' | 'paused' | 'completed' | 'error';
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const getHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function useSchedules(workspaceId: string) {
  return useQuery({
    queryKey: ['schedules', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ schedules: Schedule[] }>(`/api/v1/workspaces/${workspaceId}/schedules`, {
        headers: getHeaders(),
      });
      return res.data.schedules;
    },
    enabled: !!workspaceId,
  });
}

export function useSchedule(workspaceId: string, scheduleId: string) {
  return useQuery({
    queryKey: ['schedule', workspaceId, scheduleId],
    queryFn: async () => {
      const res = await apiFetch<{ schedule: Schedule }>(`/api/v1/workspaces/${workspaceId}/schedules/${scheduleId}`, {
        headers: getHeaders(),
      });
      return res.data.schedule;
    },
    enabled: !!workspaceId && !!scheduleId,
  });
}

export function useCreateSchedule(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Schedule>) => {
      const res = await apiFetch<{ schedule: Schedule }>(`/api/v1/workspaces/${workspaceId}/schedules`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      return res.data.schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', workspaceId] });
    },
  });
}

export function usePauseSchedule(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await apiFetch<{ schedule: Schedule }>(`/api/v1/workspaces/${workspaceId}/schedules/${scheduleId}/pause`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return res.data.schedule;
    },
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['schedule', workspaceId, scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['schedules', workspaceId] });
    },
  });
}

export function useResumeSchedule(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await apiFetch<{ schedule: Schedule }>(`/api/v1/workspaces/${workspaceId}/schedules/${scheduleId}/resume`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return res.data.schedule;
    },
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['schedule', workspaceId, scheduleId] });
      queryClient.invalidateQueries({ queryKey: ['schedules', workspaceId] });
    },
  });
}

export function useTriggerSchedule(workspaceId: string) {
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await apiFetch<{ executionId: string }>(`/api/v1/workspaces/${workspaceId}/schedules/${scheduleId}/trigger`, {
        method: 'POST',
        headers: getHeaders(),
      });
      return res.data;
    },
  });
}

export function useDeleteSchedule(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', workspaceId] });
    },
  });
}
