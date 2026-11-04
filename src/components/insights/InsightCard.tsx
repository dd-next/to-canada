import { Link } from 'react-router-dom';
import { formatPeriod, formatValue, plural } from '../../lib/format';
import { chartDecimals } from '../../charts/text';
import { Icon } from '../ui/Icon';
import { TOPIC_LABELS, periodText, type InsightSummary } from './model';

/** The lead number of an insight: big value, its label and period. */
export function LeadStat({ stat, size = 'md' }: { stat: NonNullable<InsightSummary['leadStat']>; size?: 'md' | 'lg' }) {
  const decimals = chartDecimals(stat.unit, [stat.value]);
  return (
    <div className={`ins-stat ins-stat--${size}`}>
      <p className="ins-stat__value num">{formatValue(stat.value, stat.unit, decimals)}</p>
      <p className="ins-stat__label">
        {stat.label}
        {stat.period && <span className="ins-stat__period mono"> · {formatPeriod(periodText(stat.period))}</span>}
      </p>
    </div>
  );
}

export interface InsightCardProps {
  insight: InsightSummary;
  index: number;
  /** featured = lead story (full width, large stat); wide = alone in its row (stat beside the text). */
  layout?: 'featured' | 'wide' | 'normal';
}

/** Index card: topic, lead stat, data-derived title, the newcomer question. The whole card is one link. */
export function InsightCard({ insight, index, layout = 'normal' }: InsightCardProps) {
  const featured = layout === 'featured';
  return (
    <Link to={`/insights/${insight.id}`} className={['ins-card', `ins-card--${layout}`].join(' ')}>
      <div className="ins-card__top">
        <p className="ins-card__kicker">
          <span className="ins-card__num mono">{String(index + 1).padStart(2, '0')}</span>
          <span>{TOPIC_LABELS[insight.topic] ?? insight.topic}</span>
        </p>
        {insight.leadStat && <LeadStat stat={insight.leadStat} size={featured ? 'lg' : 'md'} />}
      </div>
      <div className="ins-card__body">
        <h3 className="ins-card__title">{insight.title}</h3>
        <p className="ins-card__question">
          <span className="ins-card__q" aria-hidden="true">
            Q.
          </span>{' '}
          {insight.question}
        </p>
        {featured && <p className="ins-card__dek">{insight.dek}</p>}
        <p className="ins-card__meta">
          <span>{insight.relatedPlaceIds.length ? plural(insight.relatedPlaceIds.length, 'place') : 'Canada-wide'}</span>
          <span aria-hidden="true">·</span>
          <span>{plural(insight.sourceIds.length, 'source')}</span>
          <span className="ins-card__read">
            Read
            <Icon name="arrowRight" size={16} />
          </span>
        </p>
      </div>
    </Link>
  );
}
