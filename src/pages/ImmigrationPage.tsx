import { useCallback, useMemo } from 'react';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import type { ProgramRecord } from '../types/contract';
import { jurisdictionName, ProgramCard, CATEGORY_LABEL } from '../components/immigration/ProgramCard';
import { Button } from '../components/ui/Button';
import { Combobox, type ComboOption } from '../components/ui/Combobox';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Select } from '../components/ui/Select';
import { SourceNote } from '../components/ui/SourceNote';
import { normalize, PROVINCE_ORDER, provinceName, searchPlaces } from '../lib/places';
import { plural } from '../lib/format';
import { useUrlState } from '../lib/state';
import type { Place } from '../types/contract';
import '../styles/immigration.css';

const SUPPORT: ProgramRecord['category'][] = ['pre_arrival', 'settlement_support'];
const JURIS_ORDER = ['federal', ...PROVINCE_ORDER];

function matchesText(p: ProgramRecord, q: string) {
  const hay = normalize([p.name, p.shortName, p.operator, p.purpose, p.audience, p.geography, ...(p.majorConditions ?? [])].filter(Boolean).join(' '));
  return q.split(' ').every((w) => hay.includes(w));
}

export default function ImmigrationPage() {
  const core = useCore();
  const programs = useJSON<ProgramRecord[]>('programs.json');
  const [params, update] = useUrlState();
  const juris = params.get('jurisdiction') ?? '';
  const category = params.get('category') ?? '';
  const job = params.get('job') ?? '';
  const programId = params.get('program') ?? '';
  const q = params.get('q') ?? '';
  const placeId = params.get('place') && core.placeById.has(params.get('place')!) ? params.get('place')! : '';
  const place = placeId ? core.placeById.get(placeId)! : null;

  const all = programs.data ?? [];
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const nq = normalize(q);

  const filtered = useMemo(
    () =>
      all.filter((p) => {
        if (programId && p.id !== programId) return false;
        if (juris && p.jurisdiction !== juris) return false;
        if (category && p.category !== category) return false;
        if (job && p.jobOfferRequired !== job) return false;
        if (place) {
          const ids = p.placeIds ?? [];
          const applies = ids.includes(place.id) || (ids.length === 0 && (p.jurisdiction === 'federal' || p.jurisdiction === place.province));
          if (!applies) return false;
        }
        return !nq || matchesText(p, nq);
      }),
    [all, juris, category, job, place, nq, programId],
  );

  const support = filtered.filter((p) => SUPPORT.includes(p.category));
  const main = filtered.filter((p) => !SUPPORT.includes(p.category));
  const groups = JURIS_ORDER.map((j) => ({ j, items: main.filter((p) => p.jurisdiction === j) })).filter((g) => g.items.length);
  const filtering = !!(juris || category || job || placeId || q || programId);

  const jurisOptions = useMemo(() => {
    const present = new Set(all.map((p) => p.jurisdiction as string));
    return [
      { value: '', label: 'All jurisdictions' },
      ...JURIS_ORDER.filter((j) => present.has(j)).map((j) => ({ value: j, label: j === 'federal' ? 'Federal (IRCC)' : j === 'QC' ? 'Québec (its own system)' : provinceName(j) })),
    ];
  }, [all]);
  const catOptions = useMemo(() => {
    const present = new Set(all.map((p) => p.category));
    return [{ value: '', label: 'All categories' }, ...(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).filter((c) => present.has(c)).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))];
  }, [all]);

  const search = useCallback(
    (qq: string): ComboOption<Place>[] =>
      (qq.trim() ? searchPlaces(core.places, qq, 10).map((m) => m.place) : [...core.places].sort((a, b) => a.name.localeCompare(b.name))).map((p) => ({
        key: p.id,
        label: p.name,
        item: p,
        description: `${p.statLabel} · ${provinceName(p.province)}`,
      })),
    [core.places],
  );

  const placeNames = (p: ProgramRecord) => (p.placeIds ?? []).map((id) => core.placeById.get(id)?.name).filter((n): n is string => !!n);
  const card = (p: ProgramRecord) => <ProgramCard key={p.id} p={p} parentName={p.parentId ? byId.get(p.parentId)?.name : undefined} placeNames={placeNames(p)} />;

  return (
    <div className="page imm">
      <SectionHeader
        level={1}
        kicker="Immigration"
        title="Immigration programs"
        dek="A reference directory of the main federal, provincial and community pathways to live in Canada, with links to the official page for each."
      />

      <aside className="imm__disclaimer" aria-label="Important">
        <Icon name="info" size={18} />
        <p>
          <strong>Reference information only — not legal or immigration advice, and not an eligibility assessment.</strong> Programs, streams, fees and intake change often. Always confirm the current rules on the official page before you decide or apply.
        </p>
      </aside>

      <section className="imm__filters" aria-label="Filter programs">
        {programId && <p>Linked program: {byId.get(programId)?.name ?? programId}. <Button variant="ghost" size="sm" onClick={() => update({ program: null })}>Show all programs</Button></p>}
        <div className="field imm__search">
          <label htmlFor="imm-q" className="field__label label">
            Search programs
          </label>
          <div className="imm__searchbox">
            <Icon name="search" size={16} />
            <input id="imm-q" type="search" value={q} placeholder="Name, purpose, who it is for, conditions…" onChange={(e) => update({ q: e.target.value || null }, { replace: true })} />
          </div>
        </div>
        <Select label="Jurisdiction" value={juris} onChange={(v) => update({ jurisdiction: v || null })} options={jurisOptions} />
        <Select label="Category" value={category} onChange={(v) => update({ category: v || null })} options={catOptions} />
        <Select
          label="Job offer"
          value={job}
          onChange={(v) => update({ job: v || null })}
          options={[
            { value: '', label: 'Any' },
            { value: 'yes', label: 'Job offer required' },
            { value: 'no', label: 'No job offer required' },
            { value: 'conditional', label: 'Job offer or qualifying alternative' },
            { value: 'varies', label: 'Depends on stream' },
          ]}
        />
        <Combobox
          label="Place"
          placeholder="Any place"
          search={search}
          selected={place ? { key: place.id, label: place.name, item: place } : null}
          onSelect={(o) => update({ place: o ? o.key : null })}
          openOnFocus
          hint="Community pilots plus province-wide and federal programs that apply there."
          emptyMessage={(s) => <>No place matches “{s}”.</>}
        />
      </section>

      <div className="imm__count" role="status">
        {programs.loading ? 'Loading programs…' : `${plural(filtered.length, 'program')}${filtering ? ' match your filters' : ''}`}
        {filtering && (
            <Button variant="ghost" size="sm" onClick={() => update({ jurisdiction: null, category: null, job: null, place: null, q: null, program: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {programs.loading && <p className="imm__state">Loading the program reference…</p>}
      {programs.error && (
        <EmptyState title="The program reference is not available yet">
          <p>
            <code>programs.json</code> could not be loaded ({programs.error.message}). It is produced by the immigration pipeline — run <code>npm run data:build</code> and reload.
          </p>
        </EmptyState>
      )}
      {programs.data && all.length === 0 && (
        <EmptyState title="No programs in this snapshot">
          <p>The reference file is empty. Rebuild the data with <code>npm run data:build</code>.</p>
        </EmptyState>
      )}
      {programs.data && all.length > 0 && filtered.length === 0 && (
        <EmptyState title="No programs match" action={<Button onClick={() => update({ jurisdiction: null, category: null, job: null, place: null, q: null, program: null })}>Clear filters</Button>}>
          <p>Try fewer filters or a broader word.</p>
        </EmptyState>
      )}

      {support.length > 0 && (
        <section className="imm__group" aria-labelledby="g-support">
          <h2 id="g-support" className="h2">
            Newcomer and pre-arrival support
          </h2>
          <p className="imm__lede">Free services that help before and after you arrive. These are not immigration pathways and do not grant status.</p>
          <div className="imm__cards">{support.map(card)}</div>
        </section>
      )}

      {groups.map(({ j, items }) => (
        <section key={j} className="imm__group" aria-labelledby={`g-${j}`}>
          <h2 id={`g-${j}`} className="h2">
            {jurisdictionName(j as ProgramRecord['jurisdiction'])}
            <span className="imm__n num">{items.length}</span>
          </h2>
          {j === 'QC' && <p className="imm__lede">Québec selects its own economic immigrants under a separate system from the rest of Canada. Check the Québec government’s pages first.</p>}
          <div className="imm__cards">{items.map(card)}</div>
        </section>
      ))}

      {programs.data && all.length > 0 && (
        <SourceNote lead="Sources" sourceId={[...new Set(all.map((p) => p.sourceId))].slice(0, 40)} />
      )}
    </div>
  );
}
