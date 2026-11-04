import type { Origin } from '../../model/budget';
import { Badge } from '../ui/Badge';
import '../../styles/budget.css';

/** SOURCED / ESTIMATE / USER INPUT badge for a budget line. */
export function OriginBadge({ origin }: { origin: Origin }) {
  return <Badge variant={origin === 'sourced' ? 'sourced' : origin === 'estimate' ? 'estimate' : 'user'} />;
}

/** CALCULATION badge: derived by Northward from official inputs with a stated formula. */
export function CalcBadge({ title = 'Derived by Northward from the inputs shown; the formula is stated next to it' }: { title?: string }) {
  return (
    <span className="badge badge--calc" title={title}>
      Calculation
    </span>
  );
}
