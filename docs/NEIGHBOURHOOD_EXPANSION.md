# Neighbourhood expansion

Working branch: `codex/neighbourhoods-expansion`, based on `fb072af`.
Lead owns shared contracts, UI, build/check integration, source registry,
manifests, CI, commits, PRs, merges and deployment. City workers edit only
their assigned adapter, fixtures, evidence and processed city bundle.

## Adapter contract

Each `pipeline/neighbourhoods/<city>.py` exports `build()` returning the existing
`NeighbourhoodBundle` schema version 1. It may run independently to save ONLY
`data/processed/neighbourhoods/<city>.json`. Do not edit `sources.json` or
`public/data`; the lead integrates these after validation. Preserve source
metadata inside the bundle. Use `common.fetch.fetch` and `meta_for` for cached
downloads, retain official source labels and actual retrieval timestamps.

The existing schema is in `src/types/neighbourhoods.ts`. Extensions:

- `NeighbourhoodDefinition.geographicScope?: string`: explicit geography or
  spatial attribution method; `note` must still explain the measure.
- `NeighbourhoodBundle.coverageNote?: string`: gaps and municipal scope.
- `NeighbourhoodBundle.areaType?: 'neighbourhood' | 'census tract' | 'comparison area'`:
  names the displayed geographic unit in search and profile headings.
- `NeighbourhoodBundle.transportLabel?: string`: e.g. Rail stations, TTC subway stations.
- `Neighbourhood.amenities?: {name: string, category: string, sourceId: string}[]`.
- `Neighbourhood.description?: {verifiedAt: string, sections:
  {heading: string, text: string, kind: 'measured' | 'editorial', sourceIds: string[]}[]}`.
  Every section cites bundle source IDs. Use at least four substantive sections
  for each of at least ten Toronto and ten Vancouver neighbourhoods: housing,
  everyday setting, getting around/amenities, and practical considerations.
  Household composition and occupations require evidence about residents.

Metric keys remain flexible. Preferred common keys: population, households,
children, householdSize, livingAlone, apartments, renters, tenantShelter,
transit, walkCycle, parkland, parks, rail, libraries, communityCentres.
Only include a definition when the metric is meaningful; every row includes
every defined metric with null + missingReason when absent/suppressed.
Missing park/rail datasets must not become zero. `parks` and `stations` lists
may be empty when unavailable; the corresponding metric must then be missing.
`rail` is reserved for rail. Use `busStops` for bus stops. Distances in
`stations` are to the polygon (0 inside), at most 800 m, not walking distances.
Include data period in every definition; never hardcode 2021 when a source is older.

Geometry is WGS84, exterior rings clockwise for D3. Do spatial calculations
on original geometries in a suitable LOCAL projected CRS; simplify for display
afterwards. Neighbourhood boundaries and census observations must match the
publisher's geographic vintage; no silent join from historical census tables
to changed boundaries. Do not copy CMA metrics into neighbourhood bundles.

## Validation and evidence

Each worker documents source URLs, vintages, geography joins, gaps, representative
source values and commands in `docs/neighbourhoods/<city>.md`. Store raw downloads
in the shared ignored `data/raw/` cache. Use
`/workspace/.venvs/to-canada/bin/python` for GIS dependencies. Meaningful parser
or calculation tests can live in `pipeline/neighbourhoods/test_<city>.py` with
small fixtures in `pipeline/neighbourhoods/fixtures/<city>/`.

No recursive delegation, independent commit, merge or deployment. Send concise
handoffs to the lead. If capacity fails, save a checkpoint before requesting
the user's fallback model GPT-6.1 Sol with Max reasoning.

## Release sequence

1. Toronto and Vancouver with at least ten descriptions each.
2. Halifax and Victoria with substantive, correctly scoped data.
3. Additional existing application cities with suitable official data.

Each release requires data checks, build, browser checks, successful PR CI,
merge with current main, GitHub Pages deployment and public-route verification.
