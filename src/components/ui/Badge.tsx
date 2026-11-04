import type { ReactNode } from 'react';
import type { Flag } from '../../types/contract';

export type BadgeVariant = 'sourced' | 'estimate' | 'user' | 'regional' | 'missing' | 'caution' | 'neutral';

const LABELS: Record<BadgeVariant, string> = {
  sourced: 'Sourced',
  estimate: 'Estimate',
  user: 'User input',
  regional: 'Regional value',
  missing: 'Missing',
  caution: 'Use with caution',
  neutral: '',
};

const TITLES: Partial<Record<BadgeVariant, string>> = {
  sourced: 'Read directly from an official source',
  estimate: 'Calculated by Northward from official inputs; see the method',
  user: 'Entered by you; stays in this browser',
  regional: 'Measured for a broader area than this place',
  missing: 'The source publishes no comparable value',
  caution: 'The source flags this estimate as lower quality',
};

export interface BadgeProps {
  variant: BadgeVariant;
  /** Override the default uppercase label. */
  children?: ReactNode;
  title?: string;
  className?: string;
}

/** Provenance badge: SOURCED / ESTIMATE / USER INPUT / REGIONAL VALUE / MISSING (+ caution). */
export function Badge({ variant, children, title, className }: BadgeProps) {
  return (
    <span className={['badge', `badge--${variant}`, className].filter(Boolean).join(' ')} title={title ?? TITLES[variant]}>
      {children ?? LABELS[variant]}
    </span>
  );
}

const REGIONAL: Flag[] = ['regional_value', 'provincial_value', 'national_value', 'cma_wide'];

/** Which provenance badge an observation deserves. */
export function provenanceOf(o: { value: number | null; flags?: Flag[] } | null | undefined): BadgeVariant {
  if (!o || o.value === null) return 'missing';
  const f = o.flags ?? [];
  if (f.some((x) => REGIONAL.includes(x))) return 'regional';
  if (f.includes('use_with_caution') || f.includes('small_sample')) return 'caution';
  return 'sourced';
}

/** Badge(s) for an observation; hides the plain SOURCED badge unless showSourced. */
export function ProvenanceBadges({ obs, showSourced = false }: { obs: { value: number | null; flags?: Flag[] } | null | undefined; showSourced?: boolean }) {
  const v = provenanceOf(obs);
  const f = obs?.flags ?? [];
  const out: ReactNode[] = [];
  if (v === 'missing') out.push(<Badge key="m" variant="missing" />);
  if (v === 'regional') {
    const label = f.includes('provincial_value') ? 'Province-wide' : f.includes('cma_wide') ? 'Whole CMA' : f.includes('national_value') ? 'Canada-wide' : 'Regional value';
    out.push(
      <Badge key="r" variant="regional">
        {label}
      </Badge>,
    );
  }
  if (v !== 'missing' && (f.includes('use_with_caution') || f.includes('small_sample'))) out.push(<Badge key="c" variant="caution" />);
  if (v === 'sourced' && showSourced) out.push(<Badge key="s" variant="sourced" />);
  if (f.includes('preliminary')) out.push(<Badge key="p" variant="neutral">Preliminary</Badge>);
  return out.length ? <span className="badges">{out}</span> : null;
}
