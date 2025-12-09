import type { EntitySource } from '@/types';

interface SourceBadgeProps {
  source?: EntitySource;
}

export default function SourceBadge({ source }: SourceBadgeProps) {
  if (!source) return null;

  const styles = {
    global: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    project: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    plugin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${styles[source.type ?? 'project']}`}>
      {source.type ?? 'project'}
    </span>
  );
}
