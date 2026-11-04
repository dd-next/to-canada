# Synthetic development fixtures — NOT DATA

Files here are invented for interface development only. They are served at
`/__fixtures/` by the Vite dev server when you run
`VITE_DATA_BASE=/__fixtures/ npm run dev`, and are never included in a build.
Real snapshots live in `public/data/` and are produced by `npm run data:build`.

Regenerate them with:

```
node dev/fixtures/build-fixtures.mjs
```

What the generator writes (all contract-shaped, every record tagged `_note: SYNTHETIC FIXTURE`):

| file | contents |
|---|---|
| `manifest.json` | `DataManifest` with per-file byte/record counts |
| `places.json` | the 31 seed places (`pipeline/places_seed.json`), approx. coordinates, rounded synthetic populations (Iqaluit has none, to exercise the fixed-size marker) |
| `metrics.json` | asking-rent family (`dims.family='rent_asking'`, unit types Studio / 1 / 2 / 3 bedroom+), vacancy, LFS unemployment + employment, basket cost (MBM region, `regional_value`), PR admissions, January/July mean temperature as a month family (`dims.family='clim_mean_temp'`, `dims.month`), snowfall, population, 5-year growth (signed), plus one `mapLayer:false` metric |
| `observations.json` | seeded pseudo-random values; nulls with `not_available` / `suppressed` / `too_unreliable`; `cma_wide` for Ottawa–Gatineau rents; older periods for two places; `use_with_caution`, `rounded`, `station_proxy` |
| `sources.json` | one record per synthetic table (one `stale_snapshot`) |
| `occupations.json`, `wages.json` | 10 NOCs; `WageTable` keyed by ER code and province code; missing ER cells (province fallback), a null median, missing northern cells, and one annual-wage occupation with a single hourly cell |
| `geo/canada.topo.json` | Canada's outline from world-atlas `countries-50m` as one feature in object `provinces` (`{code:'CA', name:'Canada'}`); object `cmas` holds invented hexagons (not real CMA boundaries) |

The interface must work unchanged against the real files, which have 13
province/territory features and real CMA polygons.
