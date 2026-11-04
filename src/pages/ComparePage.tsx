import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import type { Occupation, Place, WageTable } from '../types/contract';
import { CompareTable } from '../components/compare/CompareTable';
import { DotStrips } from '../components/compare/DotStrips';
import { buildMeasures, type Measure } from '../components/compare/measures';
import { ProfessionPicker } from '../components/explore/ProfessionPicker';
import { buildModel, MAX_HOUSEHOLD, UNIT_TYPES, useScenario, type Scenario, type UnitType } from '../components/budget/scenario';
import { ButtonLink } from '../components/ui/Button';
import { Combobox, type ComboOption } from '../components/ui/Combobox';
import { EmptyState } from '../components/ui/EmptyState';
import { SectionHeader } from '../components/ui/SectionHeader';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { ToggleChip } from '../components/ui/Chip';
import { SourceNote } from '../components/ui/SourceNote';
import { compareColor } from '../lib/colors';
import { formatCAD } from '../lib/format';
import { unitTypeButton, unitTypeSlug } from '../lib/layers';
import { describeMatch, provinceName, searchPlaces } from '../lib/places';
import { useCompareSelection, useFavourites, useUrlState } from '../lib/state';
import '../styles/compare.css';

const SUGGESTIONS: { label: string; ids: string[] }[] = [
  { label: 'Toronto · Calgary · Halifax', ids: ['toronto', 'calgary', 'halifax'] },
  { label: 'Vancouver · Edmonton · Winnipeg', ids: ['vancouver', 'edmonton', 'winnipeg'] },
  { label: 'Montréal · Ottawa · Québec City', ids: ['montreal', 'ottawa', 'quebec-city'] },
  { label: 'Kitchener-Waterloo · London · Windsor', ids: ['kitchener-waterloo', 'london', 'windsor'] },
];
const STRIP_PREFERENCE = ['rent_asking_', 'noc_wage', 'rent_share', 'rent_vacancy_rate', 'lfs_unemployment_rate', 'cost_mbm_total', 'cpi_rent_change_1y', 'imm_retention_5y'];

function pickStripMeasures(measures: Measure[], unit: string): Measure[] {
  const out: Measure[] = [];
  const add = (m?: Measure) => m && !out.includes(m) && out.length < 8 && out.push(m);
  for (const p of STRIP_PREFERENCE) add(measures.find((m) => (p.endsWith('_') ? m.id.startsWith(p) && !m.id.includes('change') : m.id === p)));
  // new domains (climate, people, immigration) fill remaining slots
  for (const c of ['climate', 'people'] as const) for (const m of measures.filter((x) => x.category === c)) add(m);
  void unit;
  return out;
}

export default function ComparePage() {
  const core = useCore();
  const [params, updateUrl] = useUrlState();
  const validIds = useMemo(() => new Set(core.places.map((p) => p.id)), [core.places]);
  const tray = useCompareSelection('compare', validIds);
  const favourites = useFavourites();
  const [stored] = useScenario();

  const selected = useMemo(() => tray.ids.map((id) => core.placeById.get(id)!).filter(Boolean), [tray.ids, core.placeById]);

  // ---- shared controls (URL)
  const unitSlug = params.get('unit');
  const unit: UnitType = UNIT_TYPES.find((u) => unitTypeSlug(u) === unitSlug) ?? stored.unit;
  const noc = params.get('noc');
  const occupations = useJSON<Occupation[]>('occupations.json');
  const occupation = noc ? (occupations.data?.find((o) => o.noc === noc) ?? null) : null;
  const wages = useJSON<WageTable>(noc ? 'wages.json' : null);

  // ---- scenario: local Budget numbers, unless a shared link carries its own
  const urlScenario = params.has('hh') || params.has('income') || params.has('savings');
  const scenario: Scenario = useMemo(() => {
    const hh = Number(params.get('hh'));
    const n = (k: string) => {
      const v = params.get(k);
      const x = v === null ? NaN : Number(v);
      return Number.isFinite(x) && x >= 0 && x <= 1e9 ? x : null;
    };
    return {
      ...stored,
      unit,
      household: Number.isInteger(hh) && hh >= 1 && hh <= MAX_HOUSEHOLD ? hh : stored.household,
      income: params.has('income') ? n('income') : urlScenario ? null : stored.income,
      savings: params.has('savings') ? n('savings') : urlScenario ? null : stored.savings,
    };
  }, [stored, unit, params, urlScenario]);

  const measures = useMemo(() => buildMeasures(core, unit, noc ? (occupation ?? { noc, title: `NOC ${noc}` }) : null, wages.data), [core, unit, noc, occupation, wages.data]);
  const strips = useMemo(() => pickStripMeasures(measures, unit), [measures, unit]);
  const models = useMemo(() => selected.map((p) => buildModel(core, p, scenario, { overrides: false })), [core, selected, scenario]);

  // ---- add places
  const search = useCallback(
    (q: string): ComboOption<Place>[] => {
      const pool = core.places.filter((p) => !tray.ids.includes(p.id));
      const opts = (list: Place[]) => list.map((p) => ({ key: p.id, label: p.name, item: p, description: `${p.statLabel} · ${provinceName(p.province)}` }));
      if (!q.trim()) return opts([...pool].sort((a, b) => a.name.localeCompare(b.name)));
      return searchPlaces(pool, q, 10).map((m) => ({ key: m.place.id, label: m.place.name, item: m.place, description: describeMatch(m) }));
    },
    [core.places, tray.ids],
  );
  const favs = favourites.ids.filter((id) => validIds.has(id) && !tray.ids.includes(id));

  const shareScenario = params.has('hh');
  const toggleShare = (on: boolean) =>
    updateUrl(on ? { hh: scenario.household, income: scenario.income, savings: scenario.savings } : { hh: null, income: null, savings: null });

  const suggestions = SUGGESTIONS.filter((s) => s.ids.every((id) => validIds.has(id)));
  const ready = selected.length > 0;

  return (
    <div className="page compare">
      <header className="page-header">
        <SectionHeader
          level={1}
          kicker="Compare"
          title="Side by side"
          dek="Line up to three places on rent, work, cost of living and more. Every value keeps its period and the geography it was measured for."
        />
      </header>

      <section className="cmp-controls" aria-label="Places and shared settings">
        <div className="cmp-controls__places">
          <p className="label">Places ({selected.length} of {tray.max})</p>
          <ul className="cmp-chips">
            {selected.map((p, i) => (
              <li key={p.id}>
                <ToggleChip pressed swatch={compareColor(i)} onPressedChange={() => tray.remove(p.id)} aria-label={`Remove ${p.name} from the comparison`} title="Remove">
                  {p.name} ×
                </ToggleChip>
              </li>
            ))}
          </ul>
          <Combobox
            label="Add a place"
            hideLabel
            placeholder={tray.isFull ? 'Remove a place to add another' : 'Add a place — search a city or town'}
            search={search}
            clearOnSelect
            openOnFocus
            disabled={tray.isFull}
            onSelect={(o) => o && tray.add(o.key)}
            emptyMessage={(q) => <>No available place matches “{q}”.</>}
          />
          {favs.length > 0 && !tray.isFull && (
            <p className="cmp-fav">
              <span className="label">Saved:</span>{' '}
              {favs.slice(0, 6).map((id) => (
                <button key={id} type="button" className="linkbtn" onClick={() => tray.add(id)}>
                  + {core.placeById.get(id)!.name}
                </button>
              ))}
            </p>
          )}
        </div>
        <div className="cmp-controls__lens">
          <ProfessionPicker
            occupations={occupations.data}
            loading={occupations.loading}
            error={occupations.error}
            noc={noc}
            onChange={(n) => updateUrl({ noc: n })}
            summary="Adds the median wage and rent as a share of gross pay."
          />
          <div className="field">
            <span className="field__label label">Housing type</span>
            <SegmentedControl
              label="Housing type by bedrooms"
              options={UNIT_TYPES.map((u) => ({ value: u, label: unitTypeButton(u), title: u }))}
              value={unit}
              onChange={(v) => updateUrl({ unit: unitTypeSlug(v) })}
              block
            />
          </div>
        </div>
      </section>

      <section className="cmp-scenario" aria-label="Budget scenario used in this comparison">
        <p>
          <strong>Budget scenario:</strong> {scenario.household} {scenario.household === 1 ? 'person' : 'people'} · take-home {scenario.income === null ? 'not entered' : `${formatCAD(scenario.income)}/mo`} · savings{' '}
          {scenario.savings === null ? 'not entered' : formatCAD(scenario.savings)}.{' '}
          {urlScenario ? 'These numbers came from the link you opened.' : 'Taken from your Budget page; they stay in this browser.'}{' '}
          <Link to={selected[0] ? `/budget?place=${selected[0].id}` : '/budget'} className="link">
            Edit on Budget
          </Link>
        </p>
        <label className="cmp-share">
          <input type="checkbox" checked={shareScenario} onChange={(e) => toggleShare(e.target.checked)} />
          <span>
            Include household size, income and savings in this page’s link. <em>Off by default — your numbers are only added to the address if you tick this.</em>
          </span>
        </label>
      </section>

      {!ready ? (
        <EmptyState title="Choose places to compare" className="cmp-empty">
          <p>Search above, add places from the map, or start from a suggestion.</p>
          <ul className="cmp-suggest">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button type="button" className="btn btn--outline btn--md" onClick={() => tray.set(s.ids)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
          <ButtonLink to="/" variant="ghost" iconRight="arrowRight">
            Pick places on the map
          </ButtonLink>
        </EmptyState>
      ) : (
        <>
          {selected.length === 1 && <p className="cmp-hint">Add at least one more place to compare. Showing {selected[0].name} on its own.</p>}
          {noc && !occupation && occupations.data && <p className="cmp-hint">No occupation with NOC code {noc} in this snapshot.</p>}
          {noc && wages.loading && <p className="cmp-hint">Loading wages…</p>}

          <section className="cmp-section" aria-labelledby="strips-h">
            <h2 id="strips-h" className="h2">
              Where they sit among all {core.places.length} places
            </h2>
            <p className="cmp-lede">
              Faint dots are every place in the snapshot on one fixed scale; your places are the large coloured, labelled markers. Only values for the same period are placed on the scale.
            </p>
            <DotStrips measures={strips} selected={selected} />
          </section>

          <section className="cmp-section" aria-labelledby="table-h">
            <h2 id="table-h" className="h2">
              Full comparison
            </h2>
            <p className="cmp-lede">
              Best and worst are marked only when every place has a comparable value — same period, same type of geography. Regional and province-wide values are labelled, and never ranked against local ones.
              Budget rows are a scenario built from sourced rent and Statistics Canada’s cost benchmark, not a prediction.
            </p>
            <CompareTable
              places={selected}
              measures={measures}
              scenario={{ models, hasIncome: scenario.income !== null, hasSavings: scenario.savings !== null, household: scenario.household, unit }}
              onRemove={(id) => tray.remove(id)}
            />
            <SourceNote sourceId={[...new Set(measures.flatMap((m) => m.sourceIds))]} lead="Sources" />
          </section>
        </>
      )}
    </div>
  );
}
