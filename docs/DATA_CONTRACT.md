# Data contract and workstream ownership

The TypeScript types in `src/types/contract.ts` are the contract. This page
explains how pipelines produce data in that shape and who owns which paths.

## Flow

```
official source ──► pipeline/<domain>/*.py ──► data/raw/ (cache, git-ignored)
                                         └──► data/processed/<domain>/*.json (committed, contract-shaped)
pipeline/build_app_data.py (lead) ──► public/data/*.json (what the app loads)
```

Run any pipeline script from the repository root with `python3 -I pipeline/<domain>/<script>.py`.
Scripts add `pipeline/` to `sys.path` themselves and import shared helpers:

```python
import sys; from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import fetch, fetch_json, fetch_text        # cached, locked, bounded retries
from common.statcan import read_table, cube_metadata, flags_for, clean_value, source_record
from common.contract import obs, geo, load_places, write_processed
```

## Files each data workstream writes (`data/processed/<domain>/`)

| file | type | notes |
|---|---|---|
| `sources.json` | `SourceRecord[]` | one per table/file actually used; ids like `statcan-46-10-0092-01`, `cmhc-rms-2025`, `jobbank-wages-2025` |
| `metrics.json` | `MetricDef[]` | ids are `snake_case`, prefixed by domain (`rent_`, `wage_`, `lfs_`, `imm_`, `clim_`, `pop_`, `lang_`, `commute_`, `cost_`) |
| `observations.json` | `Observation[]` | latest value per place × metric (plus a few comparison periods if useful). One row per `(placeId, metricId, period)`. |
| `series.json` | `Series[]` | time series / monthly normals for profiles and charts |
| `insights.json` | `Insight[]` | 1–2 explorations per workstream, 2–4 findings each, chart-ready `ChartSpec`s |
| `README.md` | text | what was ingested, how to refresh, limitations |

Domain extras: geo → `places.json` (`Place[]`, verified), `canada.topo.json`;
work → `occupations.json` (`Occupation[]`), `wages.json` (`WageTable`);
immigration → `programs.json` (`ProgramRecord[]`).

## Rules

* **Place ids are permanent** (`pipeline/places_seed.json`). Join on official
  codes (CMA/CA `id`, DGUID, ER code), never on fuzzy names alone.
* **Geography honesty.** `Observation.geo` is the geography the number is
  really for. Toronto CMA values are Toronto-CMA values (Mississauga is a
  search alias, not a separate statistic). Economic-region values carry
  `regional_value`; provincial values carry `provincial_value`. Ottawa and
  Gatineau are the Ontario and Quebec parts of CMA 505; use part-level values
  when published, otherwise CMA-wide values flagged `cma_wide`.
* **Missing stays missing.** `value: null` + a flag (`suppressed`,
  `too_unreliable`, `not_available`). Never zero-fill; never interpolate.
* **Keep the source's meaning.** Units, scalar factors (convert to units and say
  so in `transformations`), reference periods, seasonal adjustment, nominal vs
  constant dollars, hourly vs annual, individual vs household, gross vs net,
  employed-worker wages vs advertised pay.
* **Rank only comparable values** (same metric, same period, same method).
* **Findings are computed, not written from memory.** Each `Finding` cites
  `sourceIds`, `placeIds`, and a `calc` string precise enough to reproduce.
* **Never invent fallback statistics.** If a source fails, keep the previously
  retrieved snapshot (with its date) or leave the gap.

## Ownership (avoid concurrent edits)

| path | owner |
|---|---|
| `src/types/`, `src/data/`, `src/config.ts`, `src/nav.ts`, `src/App.tsx`, `src/main.tsx`, `src/adapters/`, `package.json`, `vite.config.ts`, `pipeline/common/`, `pipeline/build_app_data.py`, `pipeline/places_seed.json`, `public/data/` | lead |
| `pipeline/housing/`, `data/processed/housing/` | A — housing & costs |
| `pipeline/work/`, `data/processed/work/` | B — employment & earnings |
| `pipeline/immigration/`, `data/processed/immigration/` | C — immigration |
| `pipeline/geo/`, `data/processed/geo/` (incl. climate & census) | D — geography & everyday life |
| `src/components/`, `src/pages/`, `src/charts/`, `src/styles/`, `src/lib/`, `public/fonts` | E — design & interface |

Need a dependency or a change to a lead-owned file? Write it in your final
report; the lead applies it.

## Conventions the interface relies on

* **Metric families.** Variants of one measure share `dims.family`; the
  housing-type control switches `dims.unitType` within a family. Unit types use
  Canadian terms: `Studio`, `1 bedroom`, `2 bedroom`, `3 bedroom+`.
  e.g. `rent_asking_1br` → `dims: { family: 'rent_asking', unitType: '1 bedroom' }`.
* **Map layers** are metrics with `mapLayer: true`, grouped by `category`.
  The profession layer is virtual: the UI reads `wages.json` for the chosen
  NOC and each place's `geo.economicRegions[0]` (falling back to the province
  only when the ER cell is missing, flagged `provincial_value`).
* **Geometry** `public/data/geo/canada.topo.json` (WGS84 lon/lat, TopoJSON):
  object `provinces` (properties `code` 'ON', `pruid` '35', `name`) and
  optional object `cmas` (properties `placeId`, `cmaId`, `name`, `level`).
  Projection in the UI: Statistics Canada Lambert conformal conic
  (standard parallels 49°N and 77°N, central meridian 91°52′W).
* **Chart-ready insights.** `ChartSpec` points use `x` (category or period),
  `y` (value), optional `y0`/`y1` (ranges), `placeId` (enables highlighting and
  links). Periods sort lexicographically ('2024-Q4' < '2025-Q1').

## Explorer URL parameters

`/?metric=<metricId>|noc_wage|rent_share&unit=Studio|1 bedroom|2 bedroom|3 bedroom+&noc=<NOC>&month=01..12&region=<RegionCode>&province=<code>&place=<placeId>&compare=a,b,c&highlight=a,b,c&from=<finding headline>`

* `noc_wage` — virtual layer: Job Bank median wage for `noc` in each place's primary economic region.
* `rent_share` — virtual layer: asking rent for `unit` ÷ gross monthly pay for `noc` (37.5 h/week assumption, before tax).
* `month` — month selector for metric families that carry `dims.month`.
