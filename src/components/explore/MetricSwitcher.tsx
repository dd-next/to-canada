import { useId } from 'react';
import type { MetricCategory, MetricDef } from '../../types/contract';
import { CATEGORY_LABELS, CATEGORY_ORDER, unitTypeShort, unitTypeSlug, type LayerCatalog, type LayerEntry } from '../../lib/layers';
import { unitSuffix } from '../../lib/format';
import { SegmentedControl } from '../ui/SegmentedControl';

export interface WageOption {
  label: string;
  title: string;
  active: boolean;
  onSelect: () => void;
}

export interface MetricSwitcherProps {
  catalog: LayerCatalog;
  /** Active entry key (family or metric id); ignored when the wage layer is active. */
  activeKey: string | null;
  activeMetric: MetricDef | null;
  onSelectEntry: (entry: LayerEntry) => void;
  onUnitChange: (unitSlug: string) => void;
  /** Virtual "Median wage: <occupation>" layer, shown under Work once a profession is chosen. */
  wage?: WageOption | null;
}

/** Layer picker: category grid → layers in that category → housing-type control for families. */
export function MetricSwitcher({ catalog, activeKey, activeMetric, onSelectEntry, onUnitChange, wage }: MetricSwitcherProps) {
  const listName = useId();
  const categories = CATEGORY_ORDER.filter((c) => (catalog.byCategory.get(c)?.length ?? 0) > 0 || (c === 'work' && wage));
  const activeCat: MetricCategory = wage?.active ? 'work' : (activeMetric?.category ?? categories[0] ?? 'housing');
  const entries = catalog.byCategory.get(activeCat) ?? [];
  const activeEntry = !wage?.active && activeKey ? catalog.byKey.get(activeKey) : undefined;
  const unitOptions = activeEntry?.family && activeEntry.variants.length > 1 ? activeEntry.variants : null;

  return (
    <div className="metric-switcher">
      <SegmentedControl
        label="Category"
        className="cat-grid"
        value={activeCat}
        onChange={(c) => {
          if (c === activeCat) return;
          const first = catalog.byCategory.get(c)?.[0];
          if (first) onSelectEntry(first);
          else if (c === 'work' && wage) wage.onSelect();
        }}
        options={categories.map((c) => ({
          value: c,
          label: (
            <>
              <span className="cat-grid__name">{CATEGORY_LABELS[c]}</span>
              <span className="cat-grid__count num">{(catalog.byCategory.get(c)?.length ?? 0) + (c === 'work' && wage ? 1 : 0)}</span>
            </>
          ),
          title: CATEGORY_LABELS[c],
        }))}
      />

      <fieldset className="layer-list">
        <legend className="sr-only">{CATEGORY_LABELS[activeCat]} layers</legend>
        {entries.map((e) => {
          const checked = !wage?.active && activeKey === e.key;
          const m = e.variants[0];
          return (
            <label key={e.key} className={['layer-opt', checked && 'is-on'].filter(Boolean).join(' ')}>
              <input type="radio" name={listName} checked={checked} onChange={() => onSelectEntry(e)} />
              <span className="layer-opt__label">{e.label}</span>
              <span className="layer-opt__meta mono">{e.family && e.variants.length > 1 ? `${e.variants.length} types` : unitSuffix(m.unit) || m.unit}</span>
            </label>
          );
        })}
        {activeCat === 'work' && wage && (
          <label className={['layer-opt', 'layer-opt--wage', wage.active && 'is-on'].filter(Boolean).join(' ')} title={wage.title}>
            <input type="radio" name={listName} checked={wage.active} onChange={() => wage.onSelect()} />
            <span className="layer-opt__label">{wage.label}</span>
            <span className="layer-opt__meta mono">ER</span>
          </label>
        )}
      </fieldset>

      {unitOptions && activeMetric && (
        <div className="unit-switch">
          <span className="label" aria-hidden="true">
            Housing type
          </span>
          <SegmentedControl
            label="Housing type"
            size="sm"
            block
            value={unitTypeSlug(activeMetric.dims?.unitType ?? '')}
            onChange={onUnitChange}
            options={unitOptions.map((v) => ({
              value: unitTypeSlug(v.dims?.unitType ?? v.id),
              label: unitTypeShort(v.dims?.unitType ?? v.shortLabel),
              title: v.dims?.unitType,
            }))}
          />
        </div>
      )}
    </div>
  );
}
