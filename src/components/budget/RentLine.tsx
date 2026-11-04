import { formatCAD, formatPeriod, formatValue, cleanGeoName } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { SourceNote } from '../ui/SourceNote';
import { NumberField } from './NumberField';
import { obsQualifier, type RentInfo } from './scenario';

interface Props {
  info: RentInfo;
  placeName: string | null;
  /** Current effective amount shown in the field. */
  onChange: (v: number | null) => void;
  onReset: () => void;
}

/** The rent line: starts from the sourced asking rent; editing flips it to USER INPUT; never silently substitutes. */
export function RentLine({ info, placeName, onChange, onReset }: Props) {
  const { sourced, reference, overridden } = info;
  const unit = info.unit.toLowerCase();
  const qual = obsQualifier(sourced);
  return (
    <div className="rent-line">
      <NumberField
        label={`Rent per month (${unit})`}
        value={info.value}
        onChange={onChange}
        placeholder={sourced ? undefined : 'Enter your expected rent'}
        badge={overridden || !sourced ? (overridden ? <Badge variant="user" /> : <Badge variant="missing">Required</Badge>) : <Badge variant="sourced" />}
      />
      {sourced && !overridden && (
        <div className="rent-line__meta">
          <p>
            Average asking rent for a {unit} unit in {cleanGeoName(sourced.geo.name)}, {formatPeriod(sourced.period, 'quarter')}
            {qual ? ` · ${qual}` : ''}. Asking rent is what units are advertised at now; people already renting often pay less.
          </p>
          <SourceNote sourceId={sourced.sourceId} period={sourced.period} periodType="quarter" />
        </div>
      )}
      {sourced && overridden && (
        <p className="rent-line__meta">
          You changed the rent. The sourced asking rent was {formatCAD(sourced.value)} ({formatPeriod(sourced.period, 'quarter')}).{' '}
          <button type="button" className="linkbtn" onClick={onReset}>
            Reset to sourced rent
          </button>
        </p>
      )}
      {!sourced && (
        <div className="rent-line__missing" role="note">
          <p>
            <strong>No comparable asking rent for {placeName ?? 'this place'}.</strong> {info.missingWhy}
          </p>
          <p>Enter the rent you expect to pay. The calculation needs it before it can show a runway.</p>
          {reference && (
            <p className="rent-line__ref">
              Reference only: CMHC’s average rent for a {unit} unit in {cleanGeoName(reference.geo.name)} is{' '}
              <strong className="num">{formatValue(reference.value, 'CAD_month')}</strong> ({formatPeriod(reference.period, 'month')}; covers existing rental units, not current asking rents).{' '}
              {!overridden && (
                <button type="button" className="linkbtn" onClick={() => onChange(reference.value)}>
                  Use this as my rent
                </button>
              )}
              <SourceNote sourceId={reference.sourceId} period={reference.period} />
            </p>
          )}
          {overridden && (
            <button type="button" className="linkbtn" onClick={onReset}>
              Clear my rent
            </button>
          )}
        </div>
      )}
    </div>
  );
}
