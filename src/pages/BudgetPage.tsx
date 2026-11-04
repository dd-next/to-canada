import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCore } from '../data/core';
import { BudgetResults } from '../components/budget/BudgetResults';
import { GrossBenchmark } from '../components/budget/GrossBenchmark';
import { NumberField } from '../components/budget/NumberField';
import { OriginBadge } from '../components/budget/Provenance';
import { RentLine } from '../components/budget/RentLine';
import {
  buildModel,
  decodeScenario,
  DEFAULT_SCENARIO,
  hasSharedNumbers,
  MBM_LINES,
  mbmAssumption,
  mbmRegionName,
  ONE_TIME_LINES,
  rentKey,
  stripSharedNumbers,
  UNIT_TYPES,
  USER_LINES,
  useScenario,
  type Scenario,
  type UnitType,
} from '../components/budget/scenario';
import { ShareBox } from '../components/budget/ShareBox';
import { Button } from '../components/ui/Button';
import { Combobox, type ComboOption } from '../components/ui/Combobox';
import { Disclosure } from '../components/ui/Disclosure';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { SourceNote } from '../components/ui/SourceNote';
import { Badge } from '../components/ui/Badge';
import { formatPeriod } from '../lib/format';
import { unitTypeButton } from '../lib/layers';
import { describeMatch, provinceName, searchPlaces } from '../lib/places';
import { useUrlState } from '../lib/state';
import type { Place } from '../types/contract';
import '../styles/budget.css';

const SHARE_PATCH = { hh: null, unit: null, income: null, savings: null, rent: null, noc: null } as const;

export default function BudgetPage() {
  const core = useCore();
  const [params, updateUrl] = useUrlState();
  const [stored, setScenario] = useScenario();
  const [fromLink, setFromLink] = useState(false);

  // URL -> scenario, once on arrival: a shared link carries numbers; ?place= alone only picks the place.
  useEffect(() => {
    if (hasSharedNumbers(params)) {
      setScenario((s) => decodeScenario(params, s));
      setFromLink(true);
      const patch: Record<string, null> = { ...SHARE_PATCH };
      const probe = new URLSearchParams(params);
      stripSharedNumbers(probe);
      for (const k of params.keys()) if (!probe.has(k)) patch[k] = null;
      updateUrl(patch, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeParam = params.get('place');
  const urlPlace = placeParam && core.placeById.has(placeParam) ? placeParam : null;
  useEffect(() => {
    if (urlPlace && urlPlace !== stored.placeId) setScenario((s) => ({ ...s, placeId: urlPlace }));
  }, [urlPlace, stored.placeId, setScenario]);

  const placeId = urlPlace ?? (stored.placeId && core.placeById.has(stored.placeId) ? stored.placeId : null);
  const s: Scenario = useMemo(() => ({ ...stored, placeId }), [stored, placeId]);
  const place = placeId ? (core.placeById.get(placeId) ?? null) : null;
  const patch = useCallback((p: Partial<Scenario>) => setScenario((x) => ({ ...x, ...p })), [setScenario]);

  const model = useMemo(() => buildModel(core, place, s), [core, place, s]);
  const { result, rent, mbm } = model;

  // ---- place picker
  const placeOption = useCallback((p: Place): ComboOption<Place> => ({ key: p.id, label: p.name, item: p, description: `${p.statLabel} · ${provinceName(p.province)}` }), []);
  const search = useCallback(
    (q: string): ComboOption<Place>[] =>
      q.trim()
        ? searchPlaces(core.places, q, 12).map((m) => ({ key: m.place.id, label: m.place.name, item: m.place, description: describeMatch(m) }))
        : [...core.places].sort((a, b) => a.name.localeCompare(b.name)).map(placeOption),
    [core.places, placeOption],
  );
  const choosePlace = (o: ComboOption<Place> | null) => {
    patch({ placeId: o ? o.key : null });
    updateUrl({ place: o ? o.key : null }, { replace: true });
  };

  const region = mbmRegionName(mbm);
  const mbmPeriod = mbm.find((m) => m.obs)?.obs?.period;
  const setRecord = (field: 'mbm' | 'user' | 'oneTime', id: string, v: number | null) =>
    setScenario((x) => {
      const rec = { ...x[field] };
      if (v === null) delete rec[id];
      else rec[id] = v;
      return { ...x, [field]: rec };
    });

  const clearAll = () => {
    setScenario(() => ({ ...DEFAULT_SCENARIO, placeId }));
    setFromLink(false);
  };

  return (
    <div className="page budget">
      <header className="page-header">
        <SectionHeader
          level={1}
          kicker="Budget"
          title="Arrival budget"
          dek="How far could your savings go in a new city? Start from official rent and cost-of-living benchmarks, change anything that does not match your life, and see the runway."
        />
        <p className="budget__privacy">
          <strong>Your numbers stay in this browser.</strong> They are saved on this device only and are not sent anywhere or added to the page address. The address contains them only if you press “Share these numbers”.
        </p>
        {fromLink && (
          <p className="budget__notice" role="status">
            You opened a shared link, so these inputs came from it. <button type="button" className="linkbtn" onClick={clearAll}>Clear all numbers</button>
          </p>
        )}
      </header>

      <div className="budget__layout">
        <section className="budget__sit panel" aria-labelledby="sit-h">
          <h2 id="sit-h" className="h3">
            1 · Where and who
          </h2>
          <div className="budget__fields">
            <Combobox
              label="Place you are moving to"
              placeholder="Search a city or town"
              search={search}
              selected={place ? placeOption(place) : null}
              onSelect={choosePlace}
              openOnFocus
              hint={place ? `Statistics describe the ${place.statLabel}.` : 'Rent and cost estimates come from this place.'}
              emptyMessage={(q) => <>No place matches “{q}”.</>}
            />
            <div className="field">
              <span className="field__label label" id="hh-l">
                People in your household
              </span>
              <SegmentedControl
                label="People in your household"
                options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
                value={String(s.household)}
                onChange={(v) => patch({ household: Number(v) })}
                block
              />
            </div>
            <div className="field">
              <span className="field__label label">Housing you would rent</span>
              <SegmentedControl
                label="Housing type by bedrooms"
                options={UNIT_TYPES.map((u) => ({ value: u, label: unitTypeButton(u), title: u }))}
                value={s.unit}
                onChange={(v) => patch({ unit: v as UnitType })}
                block
              />
              <p className="field__hint">{s.unit === 'Studio' ? 'Studio / bachelor' : s.unit}</p>
            </div>
            <NumberField
              label="Household take-home income per month (net, after tax)"
              value={s.income}
              onChange={(v) => patch({ income: v })}
              hint="What reaches your bank account each month, for everyone in the household. Leave empty if you have no income yet."
            />
            <NumberField label="Savings on arrival" value={s.savings} onChange={(v) => patch({ savings: v })} hint="Money you can spend after you land." />
          </div>
        </section>

        <section className="budget__rec panel" aria-labelledby="rec-h">
          <h2 id="rec-h" className="h3">
            2 · Monthly costs
          </h2>
          <RentLine
            info={rent}
            placeName={place?.name ?? null}
            onChange={(v) =>
              setScenario((x) => {
                const key = rentKey(placeId, x.unit);
                return { ...x, rent: v === null ? null : { key, value: v } };
              })
            }
            onReset={() => patch({ rent: null })}
          />

          <div className="budget__sub">
            <h3 className="label">Everyday costs, estimated</h3>
            <p className="budget__assume">
              <Badge variant="estimate" /> {mbmAssumption(region, s.household)}{' '}
              {mbmPeriod && <>Basket year: {formatPeriod(mbmPeriod)}. </>}It is a benchmark for a modest basket of goods and services, not a forecast of what you will spend — change any line.
            </p>
            {!place && <p className="field__hint">Choose a place to load estimates, or type your own amounts.</p>}
            {place && mbm.every((m) => m.estimate === null) && <p className="field__hint">No basket values for {place.name} in this snapshot — enter your own amounts.</p>}
            <div className="budget__lines">
              {MBM_LINES.map((l, i) => {
                const info = mbm[i];
                const over = s.mbm[l.id];
                const eff = over ?? info.estimate;
                return (
                  <div key={l.id} className="budget__line">
                    <NumberField
                      label={l.label}
                      value={eff}
                      roundDisplay={over === undefined}
                      onChange={(v) => setRecord('mbm', l.id, v)}
                      badge={<OriginBadge origin={over !== undefined ? 'user' : 'estimate'} />}
                    />
                    {over !== undefined && info.estimate !== null && (
                      <button type="button" className="linkbtn budget__reset" onClick={() => setRecord('mbm', l.id, null)}>
                        Reset to estimate (${Math.round(info.estimate).toLocaleString('en-CA')})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {mbm.some((m) => m.obs) && <SourceNote sourceId={mbm.find((m) => m.obs)!.obs!.sourceId} period={mbmPeriod} periodType="year" />}
          </div>

          <div className="budget__sub">
            <h3 className="label">Your other monthly costs</h3>
            <p className="field__hint">Optional. Leave empty if they do not apply — empty lines are left out, not counted as zero.</p>
            <div className="budget__lines">
              {USER_LINES.map((l) => (
                <NumberField key={l.id} label={l.label} value={s.user[l.id] ?? null} onChange={(v) => setRecord('user', l.id, v)} badge={s.user[l.id] !== undefined ? <OriginBadge origin="user" /> : undefined} />
              ))}
            </div>
          </div>
        </section>

        <section className="budget__one panel" aria-labelledby="one-h">
          <h2 id="one-h" className="h3">
            3 · One-time arrival costs
          </h2>
          <p className="field__hint">Paid once. These come out of your savings before the monthly runway starts.</p>
          <div className="budget__lines">
            {ONE_TIME_LINES.map((l) => (
              <NumberField
                key={l.id}
                label={l.label}
                hint={l.hint || undefined}
                value={s.oneTime[l.id] ?? null}
                onChange={(v) => setRecord('oneTime', l.id, v)}
                badge={s.oneTime[l.id] !== undefined ? <OriginBadge origin="user" /> : undefined}
              />
            ))}
          </div>
        </section>

        <section className="budget__res" aria-labelledby="res-h">
          <div className="budget__res-in">
            <h2 id="res-h" className="h3">
              Results
            </h2>
            <BudgetResults result={result} income={s.income} savings={s.savings} placeName={place?.name ?? null} rentMissing={rent.value === null} />
            <div className="budget__actions">
              <ShareBox scenario={s} />
              <Button variant="ghost" onClick={clearAll}>
                Clear all numbers
              </Button>
            </div>
            <Disclosure summary="How this is calculated" variant="rule">
              <ul className="budget__method">
                <li>Monthly spending = rent + everyday costs + your other monthly costs.</li>
                <li>Monthly balance = take-home income − monthly spending.</li>
                <li>Savings after arrival = savings − one-time costs.</li>
                <li>Runway = savings after arrival ÷ the amount spending exceeds income each month (with no income: ÷ monthly spending).</li>
                <li>No taxes, benefits, inflation or income growth are modelled. Treat it as a planning aid, not a forecast.</li>
              </ul>
            </Disclosure>
          </div>
        </section>

        <div className="budget__bench">
          <GrossBenchmark place={place} noc={s.noc} onNoc={(noc) => patch({ noc })} rent={rent.value} />
        </div>
      </div>
    </div>
  );
}
