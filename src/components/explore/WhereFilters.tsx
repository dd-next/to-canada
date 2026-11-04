import { useCallback } from 'react';
import type { Place, ProvinceCode, RegionCode } from '../../types/contract';
import { describeMatch, PROVINCE_ORDER, PROVINCES, REGIONS, searchPlaces, type PlaceMatch } from '../../lib/places';
import { ToggleChip } from '../ui/Chip';
import { Combobox, type ComboOption } from '../ui/Combobox';
import { Select } from '../ui/Select';

export interface RegionChipsProps {
  region: RegionCode | null;
  onRegion: (r: RegionCode | null) => void;
  places: Place[];
  size?: 'sm' | 'md';
}

/** Region presets (All Canada · West · Prairies · Ontario · Quebec · Atlantic · North). Filter the list and frame the map. */
export function RegionChips({ region, onRegion, places, size = 'sm' }: RegionChipsProps) {
  const count = (r: RegionCode) => places.filter((p) => p.region === r).length;
  return (
    <div className="region-chips" role="group" aria-label="Region">
      <ToggleChip size={size} pressed={!region} onPressedChange={() => onRegion(null)} count={places.length}>
        All Canada
      </ToggleChip>
      {REGIONS.map((r) => (
        <ToggleChip key={r.code} size={size} pressed={region === r.code} onPressedChange={(on) => onRegion(on ? r.code : null)} count={count(r.code)} title={r.title}>
          {r.label}
        </ToggleChip>
      ))}
    </div>
  );
}

export interface WhereFiltersProps {
  region: RegionCode | null;
  prov: ProvinceCode | null;
  onProv: (p: ProvinceCode | null) => void;
  places: Place[];
  onPick: (placeId: string) => void;
}

/** Province filter + alias-aware city search ("Mississauga" -> Toronto CMA). */
export function WhereFilters({ region, prov, onProv, places, onPick }: WhereFiltersProps) {
  const provinces = PROVINCE_ORDER.filter((c) => (!region || PROVINCES[c].region === region) && places.some((p) => p.province === c));
  const search = useCallback(
    (q: string): ComboOption<PlaceMatch>[] =>
      searchPlaces(places, q, 12).map((m) => ({
        key: m.place.id,
        label: m.place.name,
        item: m,
        description: describeMatch(m),
        meta: m.place.province,
      })),
    [places],
  );
  return (
    <div className="where">
      <Combobox
        label="Find a city"
        placeholder="City or municipality, e.g. Mississauga"
        search={search}
        clearOnSelect
        onSelect={(o) => o && onPick(o.item.place.id)}
        emptyMessage={(q) => <>No place matches “{q}”. Statistics here cover {places.length} metropolitan areas and larger towns.</>}
      />
      <Select
        label="Province or territory"
        size="sm"
        value={prov ?? ''}
        onChange={(v) => onProv((v || null) as ProvinceCode | null)}
        options={[
          { value: '', label: region ? 'All in region' : 'All provinces and territories' },
          ...provinces.map((c) => ({ value: c, label: `${PROVINCES[c].name} (${places.filter((p) => p.province === c).length})` })),
        ]}
      />
    </div>
  );
}
