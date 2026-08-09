'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTriggerSchedule } from '@/lib/api/schedules';
import { errorMessage } from '@/lib/api/client';

interface Props {
  workspaceId: string;
  scheduleId: string;
  disabled?: boolean;
}

export function TriggerButton({ workspaceId, scheduleId, disabled }: Props) {
  const router = useRouter();
  const triggerSchedule = useTriggerSchedule(workspaceId);
  const [error, setError] = useState<string | null>(null);

  const handleTrigger = async () => {
    setError(null);
    try {
      const res = await triggerSchedule.mutateAsync(scheduleId);
      if (res.executionId) {
        router.push(`/workspaces/${workspaceId}/executions/${res.executionId}`);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to trigger schedule'));
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <button
        className="button button--secondary"
        onClick={handleTrigger}
        disabled={disabled || triggerSchedule.isPending}
      >
        {triggerSchedule.isPending ? 'Triggering...' : 'Trigger Now'}
      </button>
      {error && <span style={{ color: '#a83222', fontSize: '12px' }}>{error}</span>}
    </div>
  );
}
