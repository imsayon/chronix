import { CircleAlert, CircleCheck, PauseCircle } from "lucide-react";

import type { ScheduleStatus } from "@/lib/schedules";

const config = {
  healthy: { label: "Healthy", icon: CircleCheck, className: "status status--healthy" },
  attention: { label: "Needs attention", icon: CircleAlert, className: "status status--attention" },
  paused: { label: "Paused", icon: PauseCircle, className: "status status--paused" },
} as const;

export function Status({ status }: { status: ScheduleStatus }) {
  const { label, icon: Icon, className } = config[status];
  return <span className={className}><Icon aria-hidden="true" size={15} />{label}</span>;
}
