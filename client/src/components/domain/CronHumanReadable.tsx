import React from 'react';

interface Props {
  expression: string;
  timezone?: string;
}

export function CronHumanReadable({ expression, timezone }: Props) {
  // Since cronstrue isn't currently in package.json and we want to avoid unhandled errors
  // while not failing if it's not installed yet, we'll try to dynamic import or just show text.
  const [text, setText] = React.useState<string>('Loading schedule...');

  React.useEffect(() => {
    // If we wanted to import cronstrue dynamically we could do it here
    // import('cronstrue').then(m => setText(m.default.toString(expression))).catch(() => ...)
    // For now we'll display a placeholder message
    setText(`Runs on schedule: ${expression}`);
  }, [expression]);

  return (
    <div style={{ fontSize: '13px', color: 'var(--ink-muted)', marginTop: '4px' }}>
      {text} {timezone && <span className="timezone">({timezone})</span>}
    </div>
  );
}
