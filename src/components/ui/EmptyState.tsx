import type { ReactNode } from 'react';
import type { Flag } from '../../types/contract';
import { missingReason } from '../../lib/format';
import { MISSING_LABEL } from '../../lib/colors';

export interface MissingValueProps {
  flags?: Flag[];
  note?: string;
  /** Explicit reason (overrides flags). */
  reason?: string | null;
  /** Headline, default "No comparable data". */
  label?: string;
  /** What is missing, e.g. "Asking rent, 1 bed for Iqaluit". */
  what?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Informative missing-data state: what is missing and why (from flags). Never renders 0. */
export function MissingValue({ flags, note, reason, label = MISSING_LABEL, what, compact, className }: MissingValueProps) {
  const why = reason ?? missingReason(flags, note);
  return (
    <div className={['missing', compact && 'missing--compact', className].filter(Boolean).join(' ')}>
      <span className="missing__mark" aria-hidden="true" />
      <span className="missing__text">
        <span className="missing__label">{label}</span>
        {what && <span className="missing__what"> · {what}</span>}
        <span className="missing__why">{why}</span>
      </span>
    </div>
  );
}

export interface EmptyStateProps {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Empty / no-results block with an optional action (e.g. "Clear filters"). */
export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div className={['empty', className].filter(Boolean).join(' ')}>
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
