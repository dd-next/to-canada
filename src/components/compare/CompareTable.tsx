import { Link } from 'react-router-dom';
import type { MetricCategory, Place } from '../../types/contract';
import { compareColor, compareShape, type CompareShape } from '../../lib/colors';
import { formatCAD, formatValue, qualityNotes } from '../../lib/format';
import { CATEGORY_LABELS, CATEGORY_ORDER, type LayerDatum } from '../../lib/layers';
import { runwayShort } from '../budget/BudgetResults';
import { CalcBadge } from '../budget/Provenance';
import type { ScenarioModel } from '../budget/scenario';
import { ProvenanceBadges, Badge } from '../ui/Badge';
import { MissingValue } from '../ui/EmptyState';
import { IconButton } from '../ui/Button';
import { bestWorst, periodLabel, type Measure } from './measures';

export function ShapeSwatch({ shape, color, size = 14 }: { shape: CompareShape; color: string; size?: number }) {
  const h = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="cmp__swatch">
      {shape === 'circle' && <circle cx={h} cy={h} r={h - 1} fill={color} />}
      {shape === 'square' && <rect x={1.5} y={1.5} width={size - 3} height={size - 3} fill={color} />}
      {shape === 'diamond' && <path d={`M${h} 0.5L${size - 0.5} ${h}L${h} ${size - 0.5}L0.5 ${h}Z`} fill={color} />}
    </svg>
  );
}

const flagWords = (d: LayerDatum) => qualityNotes(d.flags).filter((n) => !n.startsWith('Published as an annual'));

function Cell({ m, d, mark }: { m: Measure; d: LayerDatum | undefined; mark: 'best' | 'worst' | null }) {
  if (!d || d.shown === null || d.obs === null) {
    return (
      <td className="cmp__cell is-missing">
        <MissingValue compact reason={d?.reason ?? 'No observation for this place in the current snapshot'} />
      </td>
    );
  }
  const period = periodLabel(m, d);
  return (
    <td className={['cmp__cell', mark && `is-${mark}`].filter(Boolean).join(' ')}>
      <div className="cmp__val num">
        {formatValue(d.shown, d.shownUnit, m.decimals)}
        {mark && <span className="cmp__mark">{mark === 'best' ? 'Best' : 'Worst'}</span>}
      </div>
      <div className="cmp__sub">
        {period}
        {d.qualifier && <> · {d.qualifier}</>}
      </div>
      {d.value === null && d.reason && <div className="cmp__sub">{d.reason}</div>}
      {flagWords(d).length > 0 && <div className="cmp__sub cmp__caution">{flagWords(d).join(' · ')}</div>}
      <ProvenanceBadges obs={{ value: d.shown, flags: d.flags }} />
      {m.calculation && d.calc && (
        <div className="cmp__calc" title={d.calc}>
          <CalcBadge />
          <span className="cmp__sub">{d.calc}</span>
        </div>
      )}
    </td>
  );
}

interface Props {
  places: Place[];
  measures: Measure[];
  /** Budget scenario results, one per place (same order). null = no scenario rows. */
  scenario: { models: ScenarioModel[]; hasIncome: boolean; hasSavings: boolean; household: number; unit: string } | null;
  onRemove: (id: string) => void;
}

function ScenarioRows({ places, scenario }: { places: Place[]; scenario: NonNullable<Props['scenario']> }) {
  const { models, hasIncome } = scenario;
  const spend = models.map((m) => (m.rent.value === null ? null : m.result.monthlySpending));
  const bal = models.map((m, i) => (spend[i] === null ? null : m.result.monthlyBalance));
  const hi = (vals: (number | null)[], goodHigh: boolean): { best: Set<number>; worst: Set<number> } => {
    const best = new Set<number>();
    const worst = new Set<number>();
    if (vals.length < 2 || vals.some((v) => v === null)) return { best, worst };
    const nums = vals as number[];
    const mx = Math.max(...nums);
    const mn = Math.min(...nums);
    if (mx === mn) return { best, worst };
    nums.forEach((v, i) => {
      if (v === (goodHigh ? mx : mn)) best.add(i);
      if (v === (goodHigh ? mn : mx)) worst.add(i);
    });
    return { best, worst };
  };
  const sH = hi(spend, false);
  const bH = hi(bal, true);
  const rowHead = (title: string, sub: string) => (
    <th scope="row" className="cmp__rowhead">
      <span className="cmp__rowtitle">{title}</span>
      <span className="cmp__rowsub">{sub}</span>
      <span className="badges">
        <Badge variant="estimate">Scenario</Badge>
        <CalcBadge />
      </span>
    </th>
  );
  const mk = (set: { best: Set<number>; worst: Set<number> }, i: number) => (set.best.has(i) ? 'best' : set.worst.has(i) ? 'worst' : null);
  return (
    <>
      <tr>
        {rowHead('Monthly spending', `Rent + everyday costs for ${scenario.household} ${scenario.household === 1 ? 'person' : 'people'}, ${scenario.unit.toLowerCase()}`)}
        {places.map((p, i) =>
          spend[i] === null ? (
            <td key={p.id} className="cmp__cell is-missing">
              <MissingValue compact reason="No asking rent for this place — enter one on the Budget page" />
            </td>
          ) : (
            <td key={p.id} className={['cmp__cell', mk(sH, i) && `is-${mk(sH, i)}`].filter(Boolean).join(' ')}>
              <div className="cmp__val num">
                {formatCAD(spend[i])}/mo
                {mk(sH, i) && <span className="cmp__mark">{mk(sH, i) === 'best' ? 'Lowest' : 'Highest'}</span>}
              </div>
              <div className="cmp__sub">Sourced rent + MBM estimate</div>
            </td>
          ),
        )}
      </tr>
      <tr>
        {rowHead('Monthly balance', 'Your take-home income minus spending')}
        {places.map((p, i) =>
          bal[i] === null ? (
            <td key={p.id} className="cmp__cell is-missing">
              <MissingValue compact reason={!hasIncome ? 'Enter take-home income on the Budget page' : 'Needs a rent'} />
            </td>
          ) : (
            <td key={p.id} className={['cmp__cell', mk(bH, i) && `is-${mk(bH, i)}`].filter(Boolean).join(' ')}>
              <div className="cmp__val num">
                {formatCAD(bal[i])}/mo
                {mk(bH, i) && <span className="cmp__mark">{mk(bH, i) === 'best' ? 'Highest' : 'Lowest'}</span>}
              </div>
            </td>
          ),
        )}
      </tr>
      {[
        { k: 'runwayNoIncome' as const, t: 'Runway with no income', s: 'Months savings last while job searching' },
        { k: 'runwayWithIncome' as const, t: 'Runway with your income', s: 'Months savings last at your income' },
      ].map((r) => (
        <tr key={r.k}>
          {rowHead(r.t, r.s)}
          {places.map((p, i) => {
            const rw = models[i].result[r.k];
            return rw.kind === 'unknown' ? (
              <td key={p.id} className="cmp__cell is-missing">
                <MissingValue compact reason={`Needs ${rw.missing.map((x) => x.toLowerCase()).join(', ')} — see the Budget page`} />
              </td>
            ) : (
              <td key={p.id} className="cmp__cell">
                <div className="cmp__val num">{runwayShort(rw)}</div>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export function CompareTable({ places, measures, scenario, onRemove }: Props) {
  const groups = CATEGORY_ORDER.map((c) => ({ c, rows: measures.filter((m) => m.category === c && places.some((p) => m.data.get(p.id)?.obs)) }));
  const cols = places.length + 1;
  return (
    <div className="cmp__scroll" role="region" aria-label="Comparison table" tabIndex={0}>
      <table className="cmp">
        <thead>
          <tr>
            <th scope="col" className="cmp__corner">
              <span className="sr-only">Measure</span>
            </th>
            {places.map((p, i) => (
              <th key={p.id} scope="col" className="cmp__colhead">
                <div className="cmp__place">
                  <ShapeSwatch shape={compareShape(i)} color={compareColor(i)} size={16} />
                  <Link to={`/place/${p.id}`} className="cmp__name">
                    {p.name}
                  </Link>
                  <IconButton icon="close" label={`Remove ${p.name}`} size="sm" onClick={() => onRemove(p.id)} />
                </div>
                <div className="cmp__stat">{p.statLabel}</div>
              </th>
            ))}
          </tr>
        </thead>
        {groups.map(({ c, rows }) => {
          const showScenario = c === 'cost' && scenario;
          if (!rows.length && !showScenario) {
            if (c === 'climate' || c === 'people' || c === 'immigration')
              return (
                <tbody key={c}>
                  <tr className="cmp__group">
                    <th colSpan={cols}>{CATEGORY_LABELS[c as MetricCategory]}</th>
                  </tr>
                  <tr>
                    <td colSpan={cols} className="cmp__nodata">
                      No {CATEGORY_LABELS[c as MetricCategory].toLowerCase()} data in the current snapshot yet. It will appear here once published.
                    </td>
                  </tr>
                </tbody>
              );
            return null;
          }
          return (
            <tbody key={c}>
              <tr className="cmp__group">
                <th colSpan={cols}>{CATEGORY_LABELS[c]}</th>
              </tr>
              {rows.map((m) => {
                const cells = places.map((p) => m.data.get(p.id));
                const present = cells.filter((x): x is LayerDatum => !!x);
                const { best, worst, reason } = bestWorst(m.higherIs, cells.length === present.length ? present : []);
                return (
                  <tr key={m.id}>
                    <th scope="row" className="cmp__rowhead">
                      <span className="cmp__rowtitle">{m.shortLabel}</span>
                      {m.description && <span className="cmp__rowsub">{m.description}</span>}
                      {reason && <span className="cmp__rowsub cmp__rowsub--note">{reason}</span>}
                    </th>
                    {places.map((p, i) => (
                      <Cell key={p.id} m={m} d={cells[i]} mark={best.has(p.id) ? 'best' : worst.has(p.id) ? 'worst' : null} />
                    ))}
                  </tr>
                );
              })}
              {showScenario && <ScenarioRows places={places} scenario={scenario!} />}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
