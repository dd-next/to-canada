# Neighbourhoods: sources and implementation

The initial release covers Edmonton and Calgary. Open a city profile →
**Neighbourhoods**, or `/place/edmonton/neighbourhoods` and
`/place/calgary/neighbourhoods`. Each mapped area has its own shareable profile.
This is municipal coverage, not coverage of every municipality in either CMA.

## What is collected

The snapshot contains **403 Edmonton neighbourhoods** on the official 2021
census-day boundaries and **313 Calgary community records** on the boundaries
embedded in the city's census release (2022). Industrial, residual and other
non-residential areas remain in the map. Population is unavailable for 124
Edmonton and 107 Calgary records; an unavailable number is never replaced by zero.

| Source | Dataset | Use |
| --- | --- | --- |
| City of Edmonton | [2021 census boundaries](https://data.edmonton.ca/d/5bk4-5txu) | Stable neighbourhood codes, names and geometry |
| City of Edmonton / Statistics Canada | [2021 short form](https://data.edmonton.ca/d/rw8s-vqrs) | Population, children, household size, one-person households, apartment share |
| City of Edmonton / Statistics Canada | [2021 long form](https://data.edmonton.ca/d/9325-erna) | Renting, tenant shelter costs, commuting |
| City of Edmonton | [Parks](https://data.edmonton.ca/d/gdd9-eqv9) | Active park polygons and names |
| City of Edmonton | [LRT stations and stops](https://data.edmonton.ca/d/fhxi-cnhe) | Distinct named stations/stops |
| City of Calgary / Statistics Canada | [Population and dwellings](https://data.calgary.ca/d/f9wk-wej9) | Population in private households, children, community geometry |
| City of Calgary / Statistics Canada | [Families and households](https://data.calgary.ca/d/msjx-5ygv) | Household size and one-person households |
| City of Calgary | [Parks sites](https://data.calgary.ca/d/kami-qbfh) | Active park maintenance sites and names |
| City of Calgary | [Transit LRT stations](https://data.calgary.ca/d/2axz-xm4q) | Stations marked `Current` |

The UI shows the reference period, publisher's update date, actual retrieval
date, attribution and definition. Dataset metadata and downloads are cached
with the existing fetcher's URL, timestamp and checksum sidecars. A recent
download does not make census observations recent.

Important differences are visible in the product:

- Edmonton population includes the total population; Calgary's release covers
  people in private households and excludes collective dwellings.
- Census counts are rounded. Derived shares retain missing/suppressed inputs;
  an empty denominator or a numerator above its rounded denominator produces
  an unavailable value, not a clamped percentage.
- Edmonton's median tenant shelter cost is from 2021, includes utilities where
  applicable and covers all dwelling sizes. It is not a new-lease asking rent.
  Calgary neighbourhood rent and commuting measures are not collected yet.
- Commuting refers to pandemic-era 2021 and excludes home workers from the
  commuting denominator. It does not describe today's transit service.
- Parkland is the area of the union of active park polygons intersected with
  each neighbourhood, divided by its area. Calculations use original geometry
  in EPSG:32612; display geometry alone is simplified by 12 metres.
- Calgary's inventory describes park maintenance sites; Edmonton's describes
  park spaces. Neither is tree canopy or all green space. Cross-city park
  rankings would require a harmonised definition.
- Park counts use distinct publisher IDs, with a geometry hash for blank IDs,
  and an overlap above 1 square metre. A park can cross neighbourhood boundaries.
- Rail counts deduplicate exact station names and include stations inside or
  within 800 metres of the boundary. Distances are straight-line distances to
  the boundary, not walking distances from a residence, and ignore service
  frequency. Bus service is not included.
- Edmonton names follow 2021, so renamed neighbourhoods may use historical names.
  Neither city's census geography should silently be replaced with current
  geometry during an amenities refresh.

## Other useful services and data

The links below are source candidates or external reading, not imported feeds.
Rights and coverage must be verified for each intended integration.

| Source | What it can add | Integration approach |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Groceries, schools, cafés, clinics, playgrounds, roads, paths | ODbL data with attribution and applicable database obligations; regional extracts for recurring ingestion. POI completeness varies. Routing is a separate computation. |
| [Walk Score API](https://www.walkscore.com/professional/api.php) | Walkability and available transport scores | Official API supports US and Canada; obtain the appropriate access/licence and verify each score's city coverage. Not ingested. |
| [AreaVibes Edmonton](https://www.areavibes.com/edmonton-ab/) | Existing neighbourhood guides, categories and resident opinions | External reference; not an open data licence or a verified API. Do not import proprietary scores without permission. |
| [Hoodmaps](https://hoodmaps.com/edmonton-neighborhood-map) | Informal neighbourhood reputation and atmosphere | Current release links out. [Terms](https://hoodmaps.com/legal) permit embedding and do not grant unrestricted database reuse. Do not scrape or republish tags. |
| [r/Edmonton](https://www.reddit.com/r/Edmonton/) / [r/Calgary](https://www.reddit.com/r/Calgary/) | Specific recent experiences and recurring questions | Current release provides neighbourhood-scoped searches. A future collector needs approved access and a record of URL, date, location and viewpoint; posts are not representative surveys. |
| [Niche](https://www.niche.com/places-to-live/rankings/) / [Trulia](https://www.trulia.com/ny/new-york-neighborhoods/) | Examples of resident surveys and neighbourhood pages | Useful product references, primarily US-focused; not the source foundation for these two Canadian cities. |
| [StreetAdvisor](https://www.streetadvisor.com/) | Street and neighbourhood reviews | Canadian city coverage and reuse rights have not been verified; not integrated. |
| [Nextdoor](https://nextdoor.com/) | Neighbour discussions | Not an open neighbourhood-review dataset. No account-gated content is collected. |
| [CREB housing statistics](https://www.creb.com/Housing_Statistics/) | Calgary housing sales and market conditions | Verify report geography, permissions and units; sales prices and market districts are not neighbourhood asking rents. |
| Municipal GTFS and school-board data | Service frequency, journeys to work, attendance areas | Next adapters to investigate; school proximity does not establish attendance eligibility. |

## Recommended next collection work

1. Add address-based access to groceries, schools, clinics and parks using
   licensed POIs and walking routes. Distinguish distances from actual homes
   from distances from a neighbourhood centroid or boundary.
2. Add official GTFS schedules for bus/LRT service and commute destinations.
3. Expand Calgary housing facts from its full community profiles with a
   validated parser and preserved geography/period definitions.
4. Add editorial summaries supported by several dated, linked local sources,
   and later first-party resident reviews with moderation. Keep opinions
   distinct from measurements and expose disagreements and sparse coverage.
5. Add current neighbourhood asking rents only after obtaining a permitted
   listing feed, deduplicating listings and imposing a disclosed minimum sample.

## Maintenance

```bash
NORTHWARD_REFRESH=1 npm run neighbourhoods:refresh
npm run neighbourhoods:check
python3 -I pipeline/neighbourhoods/test_neighbourhoods.py
npm run build
```

Install `pipeline/requirements.txt` in the active Python environment first.
The refresh command uses the existing staging/publication lock and validates
the complete app before promoting it. Download or validation failure retains
the published snapshot. This domain is **manual** in this release; the existing
weekly statistics schedule does not fetch it. Do not represent that schedule
as refreshing the new park/transit data.

`pipeline/neighbourhoods/run.py` writes `data/processed/neighbourhoods/`.
`pipeline/build_app_data.py` includes the bundles in the manifest and merges
their source records. `npm run data:build` preserves/rebuilds the bundles.
The browser fetches a bundle only when a neighbourhood route is opened.
`scripts/spa-fallback.mjs` emits a static entry page for each known profile.
