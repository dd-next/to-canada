import { useMemo } from 'react';
import { useJSON } from '../../data/useJSON';
import type { Occupation, Place, WageTable } from '../../types/contract';
import { formatCAD, formatPercent, formatPeriod, formatValue } from '../../lib/format';
import { lookupWage } from '../../lib/layers';
import { cleanGeoName } from '../../lib/format';
import { FULL_TIME_HOURS_PER_WEEK, grossMonthly, rentShareOfPay } from '../../model/pay';
import { ProfessionPicker } from '../explore/ProfessionPicker';
import { Badge } from '../ui/Badge';
import { SourceNote } from '../ui/SourceNote';
import { CalcBadge } from './Provenance';

interface Props {
  place: Place | null;
  noc: string | null;
  onNoc: (noc: string | null) => void;
  /** Rent used in the calculation, for the share-of-pay line. */
  rent: number | null;
}

/** Separate from the budget: gross pay benchmark for a profession. Never feeds the calculation. */
export function GrossBenchmark({ place, noc, onNoc, rent }: Props) {
  const occ = useJSON<Occupation[]>('occupations.json');
  const wages = useJSON<WageTable>(noc ? 'wages.json' : null);
  const cell = useMemo(() => (noc && place && wages.data ? lookupWage(wages.data, noc, place) : null), [noc, place, wages.data]);
  const title = noc ? occ.data?.find((o) => o.noc === noc)?.title : undefined;
  const monthly = cell ? grossMonthly(cell.median, cell.annual) : null;
  const share = rentShareOfPay(rent, monthly);
  return (
    <section className="bench" aria-labelledby="bench-h">
      <div className="bench__head">
        <h3 id="bench-h" className="h3">
          Pay benchmark for a profession
        </h3>
        <Badge variant="neutral">Gross, before tax</Badge>
      </div>
      <p className="bench__lead">
        Optional. For context only — <strong>gross, before tax — not take-home</strong>, and <strong>not used in the calculation</strong> above. Enter your own take-home income there.
      </p>
      <ProfessionPicker occupations={occ.data} loading={occ.loading} error={occ.error} noc={noc} onChange={onNoc} />
      {noc && !place && <p className="bench__note">Choose a place to see the wage for its economic region.</p>}
      {noc && place && wages.loading && <p className="bench__note">Loading wages…</p>}
      {noc && place && wages.error && <p className="bench__note">Wages could not be loaded ({wages.error.message}).</p>}
      {noc && place && wages.data && !cell && (
        <p className="bench__note">
          Job Bank publishes no median wage for {title ?? `NOC ${noc}`} in {place.geo.economicRegions[0] ? cleanGeoName(place.geo.economicRegions[0].name) : place.name} or {place.geo.province.name}.
        </p>
      )}
      {cell && wages.data && (
        <div className="bench__result">
          <dl className="bench__dl">
            <div>
              <dt className="label">Median wage, {title ?? `NOC ${noc}`}</dt>
              <dd className="bench__num num">{formatValue(cell.median, cell.annual ? 'CAD_year' : 'CAD_hour')}</dd>
            </div>
            <div>
              <dt className="label">Gross monthly pay</dt>
              <dd className="bench__num num">{formatCAD(monthly)}</dd>
            </div>
            {share !== null && (
              <div>
                <dt className="label">Rent above ÷ gross pay</dt>
                <dd className="bench__num num">
                  {formatPercent(share * 100, 0)} <CalcBadge />
                </dd>
              </div>
            )}
          </dl>
          <p className="bench__note">
            {cell.fallback === 'province' ? `Province-wide value (${cleanGeoName(cell.geo.name)}) — no economic-region wage published. ` : `Economic region: ${cleanGeoName(cell.geo.name)}. `}
            Wages of employed workers, {cell.referencePeriod ? formatPeriod(cell.referencePeriod) : 'reference period not recorded'}, not advertised pay. Method: {cell.methodology ?? 'Not recorded'}.{' '}
            {cell.annual ? 'Published as an annual wage; monthly = annual ÷ 12.' : `Monthly = hourly × ${FULL_TIME_HOURS_PER_WEEK} hours a week × 52 weeks ÷ 12.`} Gross pay is before income tax and deductions, so your take-home will be lower.
          </p>
          <SourceNote sourceId={wages.data.sourceId} period={cell.referencePeriod ?? 'Not recorded'} />
        </div>
      )}
    </section>
  );
}
