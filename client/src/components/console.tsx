"use client";

import { Command } from "cmdk";
import {
  CalendarClock,
  ChevronDown,
  Command as CommandIcon,
  LayoutList,
  ListFilter,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Status } from "@/components/status";
import { schedules as initialSchedules, type Schedule, type ScheduleStatus } from "@/lib/schedules";

type Filter = "all" | ScheduleStatus;

const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "healthy", label: "Healthy" },
  { value: "attention", label: "Needs attention" },
  { value: "paused", label: "Paused" },
];

const navigation = [
  { label: "Schedules", icon: CalendarClock, active: true },
  { label: "Executions", icon: LayoutList, active: false },
  { label: "Settings", icon: Settings, active: false },
];

function navItemClass(active: boolean) {
  return active ? "nav-item nav-item--active" : "nav-item";
}

export function Console() {
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setIsNavOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleSchedules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return schedules.filter((schedule) => {
      const matchesFilter = filter === "all" || schedule.status === filter;
      const matchesQuery = !normalized || [schedule.name, schedule.target, schedule.id]
        .some((value) => value.toLowerCase().includes(normalized));
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, schedules]);

  const counts = useMemo(() => schedules.reduce<Record<Filter, number>>(
    (all, schedule) => ({ ...all, all: all.all + 1, [schedule.status]: all[schedule.status] + 1 }),
    { all: 0, healthy: 0, attention: 0, paused: 0 },
  ), [schedules]);

  const refresh = () => {
    setIsRefreshing(true);
    window.setTimeout(() => setIsRefreshing(false), 650);
  };

  const addSchedule = (schedule: Schedule) => {
    setSchedules((current) => [schedule, ...current]);
    setIsComposerOpen(false);
    setFilter("all");
    setQuery("");
  };

  return (
    <div className="console-shell">
      <aside className={isNavOpen ? "sidebar sidebar--open" : "sidebar"} aria-label="Primary navigation">
        <div className="sidebar__top">
          <a className="wordmark" href="#schedules" aria-label="Chronix schedules">
            <span className="wordmark__glyph" aria-hidden="true">C</span>
            Chronix
          </a>
          <button className="icon-button sidebar__close" onClick={() => setIsNavOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <nav className="nav-list">
          {navigation.map(({ label, icon: Icon, active }) => (
            <a className={navItemClass(active)} href={active ? "#schedules" : "#"} key={label} aria-current={active ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <button className="organization-switcher" type="button">
            <span><strong>Quartz Labs</strong><small>Production</small></span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="console-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setIsNavOpen(true)} aria-label="Open navigation">
            <Menu size={19} />
          </button>
          <div className="breadcrumbs"><span>Quartz Labs</span><span aria-hidden="true">/</span><strong>Schedules</strong></div>
          <div className="topbar__actions">
            <button className="command-trigger" onClick={() => setIsCommandOpen(true)} type="button">
              <Search size={16} aria-hidden="true" /><span>Search</span><kbd>⌘ K</kbd>
            </button>
            <motion.button className="button button--primary" onClick={() => setIsComposerOpen((open) => !open)} whileTap={{ scale: 0.98 }} type="button">
              <Plus size={17} aria-hidden="true" /> New schedule
            </motion.button>
          </div>
        </header>

        <motion.main className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <section className="page-heading" id="schedules">
            <div>
              <h1>Schedules</h1>
              <p>Timezone-aware jobs and their next intended execution.</p>
            </div>
            <button className="button button--secondary" onClick={refresh} type="button" disabled={isRefreshing} aria-live="polite">
              <RefreshCw className={isRefreshing ? "spin" : undefined} size={16} aria-hidden="true" />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
          </section>

          {isComposerOpen && <ScheduleComposer onCancel={() => setIsComposerOpen(false)} onCreate={addSchedule} />}

          <section className="schedule-panel" aria-labelledby="schedule-list-heading">
            <div className="schedule-panel__toolbar">
              <div className="segmented-control" role="tablist" aria-label="Schedule status">
                {filters.map(({ value, label }) => (
                  <button
                    className={filter === value ? "segment segment--active" : "segment"}
                    key={value}
                    onClick={() => setFilter(value)}
                    role="tab"
                    type="button"
                    aria-selected={filter === value}
                  >
                    {label} <span>{counts[value]}</span>
                  </button>
                ))}
              </div>
              <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <span className="sr-only">Search schedules</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter schedules" />
              </label>
            </div>

            <div className="table-heading">
              <h2 id="schedule-list-heading">Configured schedules</h2>
              <button className="text-button" type="button"><ListFilter size={15} aria-hidden="true" /> Filters</button>
            </div>
            {isRefreshing ? <ScheduleSkeleton /> : <ScheduleList schedules={visibleSchedules} />}
          </section>
        </motion.main>
      </div>

      <CommandMenu open={isCommandOpen} onOpenChange={setIsCommandOpen} onCreate={() => { setIsCommandOpen(false); setIsComposerOpen(true); }} />
    </div>
  );
}

function ScheduleList({ schedules }: { schedules: Schedule[] }) {
  if (schedules.length === 0) {
    return <div className="empty-state"><CalendarClock size={22} aria-hidden="true" /><h3>No schedules found</h3><p>Try a different filter or create a schedule.</p></div>;
  }

  return (
    <>
      <div className="schedule-table-wrap">
        <table className="schedule-table">
          <thead><tr><th>Schedule</th><th>Expression</th><th>Next run</th><th>Last run</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{schedules.map((schedule) => <ScheduleRow schedule={schedule} key={schedule.id} />)}</tbody>
        </table>
      </div>
      <div className="schedule-cards">{schedules.map((schedule) => <ScheduleCard schedule={schedule} key={schedule.id} />)}</div>
    </>
  );
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  return <tr>
    <td><a className="schedule-name" href={`#${schedule.id}`}>{schedule.name}</a><span className="target-path">{schedule.target}</span></td>
    <td><code>{schedule.expression}</code><span className="timezone">{schedule.timezone}</span></td>
    <td className="tabular">{schedule.nextRun}</td><td className="tabular">{schedule.lastRun}</td><td><Status status={schedule.status} /></td>
    <td><button className="icon-button icon-button--quiet" aria-label={`Open actions for ${schedule.name}`}><MoreHorizontal size={18} /></button></td>
  </tr>;
}

function ScheduleCard({ schedule }: { schedule: Schedule }) {
  return <article className="schedule-card"><div className="schedule-card__header"><div><a className="schedule-name" href={`#${schedule.id}`}>{schedule.name}</a><span className="target-path">{schedule.target}</span></div><button className="icon-button icon-button--quiet" aria-label={`Open actions for ${schedule.name}`}><MoreHorizontal size={18} /></button></div><dl><div><dt>Expression</dt><dd><code>{schedule.expression}</code><span className="timezone">{schedule.timezone}</span></dd></div><div><dt>Next run</dt><dd className="tabular">{schedule.nextRun}</dd></div><div><dt>Last run</dt><dd className="tabular">{schedule.lastRun}</dd></div><div><dt>Status</dt><dd><Status status={schedule.status} /></dd></div></dl></article>;
}

function ScheduleSkeleton() {
  return <div className="skeleton-list" aria-label="Refreshing schedules" aria-busy="true">{Array.from({ length: 5 }).map((_, index) => <div className="skeleton-row" key={index}><span /><span /><span /><span /></div>)}</div>;
}

function ScheduleComposer({ onCancel, onCreate }: { onCancel(): void; onCreate(schedule: Schedule): void }) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const target = String(form.get("target") ?? "").trim();
    const expression = String(form.get("expression") ?? "").trim();
    const timezone = String(form.get("timezone") ?? "UTC");
    if (!name || !target || !expression) { setError("Name, target, and cron expression are required."); return; }
    setError(null); setIsSaving(true);
    window.setTimeout(() => {
      onCreate({ id: `sch_local_${Date.now()}`, name, target, expression, timezone, nextRun: "Awaiting scheduler", lastRun: "Not run", status: "healthy" });
    }, 420);
  };
  return <motion.section className="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} aria-labelledby="new-schedule-heading"><div className="composer__heading"><div><h2 id="new-schedule-heading">New schedule</h2><p>This local form will use the Express API once it is available.</p></div><button className="icon-button" onClick={onCancel} aria-label="Close new schedule form"><X size={18} /></button></div><form onSubmit={onSubmit}><label>Name<input name="name" placeholder="Nightly ledger close" autoFocus /></label><label>Target<input name="target" placeholder="/jobs/ledger-close" /></label><label>Cron expression<input name="expression" defaultValue="0 2 * * *" /></label><label>Timezone<select name="timezone" defaultValue="UTC"><option>UTC</option><option>America/New_York</option><option>Europe/London</option><option>America/Los_Angeles</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="composer__actions"><button className="button button--secondary" onClick={onCancel} type="button">Cancel</button><motion.button className="button button--primary" whileTap={{ scale: 0.98 }} disabled={isSaving} type="submit">{isSaving ? "Creating" : "Create schedule"}</motion.button></div></form></motion.section>;
}

function CommandMenu({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange(open: boolean): void; onCreate(): void }) {
  return <Command.Dialog className="command-dialog" label="Command palette" open={open} onOpenChange={onOpenChange}><div className="command-dialog__backdrop" /><div className="command-dialog__surface"><div className="command-search"><CommandIcon size={18} aria-hidden="true" /><Command.Input autoFocus placeholder="Search Chronix" /></div><Command.List><Command.Empty>No matching action.</Command.Empty><Command.Group heading="Navigate"><Command.Item onSelect={() => onOpenChange(false)}><CalendarClock size={16} /> Schedules</Command.Item><Command.Item onSelect={() => onOpenChange(false)}><LayoutList size={16} /> Executions</Command.Item></Command.Group><Command.Group heading="Actions"><Command.Item onSelect={onCreate}><Plus size={16} /> New schedule</Command.Item><Command.Item onSelect={() => onOpenChange(false)}><RefreshCw size={16} /> Refresh data</Command.Item></Command.Group></Command.List></div></Command.Dialog>;
}
