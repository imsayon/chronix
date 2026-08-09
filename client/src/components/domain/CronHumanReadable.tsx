interface Props {
  expression: string;
  timezone?: string;
}

export function CronHumanReadable({ expression, timezone }: Props) {
  return (
    <span className="cron-summary">
      <code>{expression}</code>
      {timezone !== undefined && <span className="timezone">{timezone}</span>}
    </span>
  );
}
