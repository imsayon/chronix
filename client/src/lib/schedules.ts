export type ScheduleStatus = "healthy" | "attention" | "paused";

export type Schedule = {
  id: string;
  name: string;
  target: string;
  expression: string;
  timezone: string;
  nextRun: string;
  lastRun: string;
  status: ScheduleStatus;
};

export const schedules: Schedule[] = [
  { id: "sch_01HZK73B", name: "Ledger close", target: "/jobs/ledger-close", expression: "0 2 * * *", timezone: "America/New_York", nextRun: "Today, 02:00", lastRun: "Yesterday, 02:00", status: "healthy" },
  { id: "sch_01J0J6M4", name: "Search index refresh", target: "/jobs/search-index", expression: "*/15 * * * *", timezone: "UTC", nextRun: "In 9 min", lastRun: "6 min ago", status: "healthy" },
  { id: "sch_01J0TNNQ", name: "Subscription reconciliation", target: "/jobs/subscriptions/reconcile", expression: "30 6 * * 1-5", timezone: "Europe/London", nextRun: "Tomorrow, 06:30", lastRun: "Yesterday, 06:30", status: "attention" },
  { id: "sch_01J1A0G9", name: "Warehouse export", target: "/jobs/warehouse/export", expression: "0 4 * * 0", timezone: "America/Los_Angeles", nextRun: "Sun, 04:00", lastRun: "Sun, 04:00", status: "paused" },
  { id: "sch_01J1B9YH", name: "Billing notices", target: "/jobs/billing/notices", expression: "0 9 1 * *", timezone: "UTC", nextRun: "Aug 1, 09:00", lastRun: "Jul 1, 09:00", status: "healthy" }
];
