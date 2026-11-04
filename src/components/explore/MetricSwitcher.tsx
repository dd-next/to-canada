import { useId } from 'react';
import type { MetricCategory, MetricDef } from '../../types/contract';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  monthIndex,
  MONTHS_LONG,
  monthSlug,
  unitTypeButton,
  unitTypeSlug,
  type LayerCatalog,
  type LayerEntry,
} from '../../lib/layers';
import { unitSuffix } from '../../lib/format';
import { SegmentedControl } from '../ui/SegmentedControl';

/** A layer that is not a MetricDef in metrics.json (profession wage, rent ÷ pay calculation). */
export interface VirtualLayer {
  key: string;
  category: MetricCategory;
  label: string;
  title?: string;
  /** Short tag on the tile, e.g. 'ER' or 'Calc'. */
  tag?: string;
  active: boolean;
  onSelect: () => void;
}

export type VariantControl =
  | { kind: 'unitType'; entry: LayerEntry; value: string }
  | { kind: 'month'; entry: LayerEntry; value: number }
  | null;

export interface MetricSwitcherProps {
  catalog: LayerCatalog;
  /** Active entry key (family or metric id); ignored while a virtual layer is active. */
  activeKey: string | null;
  activeMetric: MetricDef | null;
  onSelectEntry: (entry: LayerEntry) => void;
  onUnitChange: (unitSlug: string) => void;
  onMonthChange: (monthSlug: string) => void;
  virtuals?: VirtualLayer[];
  /** Which variant control to show (housing type or month), if any. */
  variant?: VariantControl;
}

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Layer picker: category grid → big layer tiles → housing-type (Studio/1/2/3+) or month (Jan–Dec) control. */
export function MetricSwitcher({ catalog, activeKey, activeMetric, onSelectEntry, onUnitChange, onMonthChange, virtuals = [], variant }: MetricSwitcherProps) {
  const listName = useId();
  const activeVirtual = virtuals.find((v) => v.active);
  const categories = CATEGORY_ORDER.filter((c) => (catalog.byCategory.get(c)?.length ?? 0) > 0 || virtuals.some((v) => v.category === c));
  const activeCat: MetricCategory = activeVirtual?.category ?? activeMetric?.category ?? categories[0] ?? 'housing';
  const entries = catalog.byCategory.get(activeCat) ?? [];
  const catVirtuals = virtuals.filter((v) => v.category === activeCat);
  const count = (c: MetricCategory) => (catalog.byCategory.get(c)?.length ?? 0) + virtuals.filter((v) => v.category === c).length;

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
          else virtuals.find((v) => v.category === c)?.onSelect();
        }}
        options={categories.map((c) => ({
          value: c,
          label: (
            <>
              <span className="cat-grid__name">{CATEGORY_LABELS[c]}</span>
              <span className="cat-grid__count num">{count(c)}</span>
            </>
          ),
          title: CATEGORY_LABELS[c],
        }))}
      />

      <fieldset className="layer-tiles">
        <legend className="sr-only">{CATEGORY_LABELS[activeCat]} layers</legend>
        {entries.map((e) => {
          const checked = !activeVirtual && activeKey === e.key;
          const m = e.variants[0];
          const meta = e.dim === 'month' ? 'by month' : e.family && e.variants.length > 1 ? `${e.variants.length} types` : unitSuffix(m.unit) || m.unit;
          return (
            <label key={e.key} className={['layer-tile', checked && 'is-on'].filter(Boolean).join(' ')} title={m.description}>
              <input type="radio" name={listName} checked={checked} onChange={() => onSelectEntry(e)} />
              <span className="layer-tile__label">{e.label}</span>
              <span className="layer-tile__meta">{meta}</span>
            </label>
          );
        })}
        {catVirtuals.map((v) => (
          <label key={v.key} className={['layer-tile', 'layer-tile--virtual', v.active && 'is-on'].filter(Boolean).join(' ')} title={v.title}>
            <input type="radio" name={listName} checked={v.active} onChange={() => v.onSelect()} />
            <span className="layer-tile__label">{v.label}</span>
            {v.tag && <span className="layer-tile__meta layer-tile__tag">{v.tag}</span>}
          </label>
        ))}
      </fieldset>

      {variant?.kind === 'unitType' && variant.entry.variants.length > 1 && (
        <div className="variant-switch">
          <span className="label" aria-hidden="true">
            Bedrooms
          </span>
          <SegmentedControl
            label="Bedrooms"
            block
            className="seg--tiles"
            value={variant.value}
            onChange={onUnitChange}
            options={variant.entry.variants.map((v) => ({
              value: unitTypeSlug(v.dims?.unitType ?? v.id),
              label: unitTypeButton(v.dims?.unitType ?? v.shortLabel),
              title: v.dims?.unitType,
            }))}
          />
        </div>
      )}

      {variant?.kind === 'month' && (
        <div className="variant-switch">
          <span className="label" aria-hidden="true">
            Month · <span className="variant-switch__value">{MONTHS_LONG[variant.value - 1]}</span>
          </span>
          <SegmentedControl
            label="Month"
            block
            size="sm"
            className="seg--months"
            value={monthSlug(variant.value)}
            onChange={onMonthChange}
            options={MONTH_INITIALS.map((initial, i) => {
              const has = variant.entry.variants.some((v) => monthIndex(v.dims?.month) === i + 1);
              return {
                value: monthSlug(i + 1),
                label: initial,
                title: has ? MONTHS_LONG[i] : `${MONTHS_LONG[i]} — not in this snapshot yet`,
                disabled: !has,
              };
            })}
          />
          {variant.entry.variants.length < 12 && (
            <p className="variant-switch__note">
              {variant.entry.variants.length} of 12 monthly normals in this snapshot; the others are greyed out until the climate series lands.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
