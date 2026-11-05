# Northward v0.1.0 — release notes (2026-11-05)

**Live:** https://dd-next.github.io/to-canada/ · **Code:** `main` · **Data snapshot:** official releases as of 2026-11-05

Northward is an English-language explorer of 31 Canadian urban areas for people
deciding where to move, what work to pursue and what life they could afford. Every
number comes from an official source (Statistics Canada, CMHC, ESDC Job Bank, IRCC,
ECCC, provincial/community program pages) and shows its period, geography and source.
It is a static site: no accounts, no tracking, no paid map keys, no live calls to
government servers while browsing.

---

## 1. Guided tour (what to click)

### Explore — the map (`/`)
- Switch **map layers** by group: Housing, Work, Cost, Immigration, Climate, People.
- **Housing type** buttons (Studio / 1 / 2 / 3+) change the rent layers.
- **Profession lens:** type "nurse" or a NOC code, pick an occupation → the map shows
  Job Bank median wages by economic region, and the **Rent ÷ gross pay** layer
  (labelled CALCULATION, 37.5 h/week assumption shown).
- **Climate** layers have a **Jan–Dec month selector**.
- **Region presets** (West, Prairies, Ontario, Quebec, Atlantic, **North**) and
  zoom/pan reach the territories and smaller places.
- **Search** municipalities too: "Mississauga" finds *Toronto CMA* (statistics are for
  the whole CMA, never presented as Mississauga's own).
- Click a city → **detail drawer** (map stays visible); add to **Compare**, ★ **Save**.
- **"Start with a question"** presets set several filters at once.
- Phone: **Map | List** switch and a bottom sheet.

Try:
- https://dd-next.github.io/to-canada/?metric=rent_share&noc=31301 — rent vs a nurse's pay
- https://dd-next.github.io/to-canada/?metric=clim_m_temp_mean&month=01 — January temperatures
- https://dd-next.github.io/to-canada/?metric=lang_french_knowledge — where French is known

### City profiles (`/place/<id>`)
Key facts with period + source, computed **tradeoffs** (rank among comparable places),
wages for a chosen occupation (economic region vs province vs Canada), labour-market
trend, rents (advertised vs CMHC survey vs paid), Market Basket costs, climate,
language and commuting, immigration context and programs, Job Bank search links,
findings and sources.
- https://dd-next.github.io/to-canada/place/toronto?noc=31301
- https://dd-next.github.io/to-canada/place/sudbury — immigration-pilot community (RCIP + FCIP)
- https://dd-next.github.io/to-canada/place/ottawa and /place/gatineau — two provincial parts of one CMA
- https://dd-next.github.io/to-canada/place/whitehorse — sparse official data, shown as missing

### Compare (`/compare`)
Up to three places under the same occupation, housing type and budget scenario: dot
strips on fixed scales (all 31 places as context) and a provenance-aware table ("best /
worst" only where values are comparable). Selection is in the URL; favourites stay in
the browser.
- https://dd-next.github.io/to-canada/compare?compare=toronto,calgary,halifax&noc=31301

### Budget (`/budget`)
Arrival budget: take-home income, savings, household size, housing type. Rent starts
from the official asking rent (editable); everyday costs start from Statistics Canada's
Market Basket Measure scaled to the household. Every line is labelled **SOURCED**,
**ESTIMATE** or **USER INPUT**; one-time arrival costs are separate; results show
monthly balance and how long savings last with and without income. Inputs stay in the
browser unless you press **Share these numbers**.
- https://dd-next.github.io/to-canada/budget?place=montreal
- https://dd-next.github.io/to-canada/budget?place=whitehorse — no official asking rent: asks for your own

### Insights (`/insights`)
Eight explorations with computed findings, interactive charts (keyboard accessible,
"View data" tables), methodology and limitations. "Show on map" jumps to the cities.
`housing-rents`, `arrival-budget`, `work-wages`, `work-labour`, `immigrant-income`,
`settlement`, `language-life`, `climate` — e.g.
https://dd-next.github.io/to-canada/insights/housing-rents

### Immigration (`/immigration`)
Searchable reference directory of **68** federal, provincial, Quebec and community
program records from official pages, with filters (jurisdiction, category, job offer,
place). Open/paused/closed is shown **only** where the official page states it; each
record has its last-checked date. Reference only — no eligibility scoring.

### Sources & methods (`/sources`)
**Data freshness** (newest period, release and retrieval dates per dataset), the full
source registry with licences and transformations, a coverage matrix (places ×
domains) and methodology notes. The footer of every page shows the snapshot date.

---

## 2. Data in this release

| Data | Source | Newest period |
|---|---|---|
| Asking & paid rents | StatCan 46-10-0092-01 | 2026 Q2 |
| Average rent, vacancy | CMHC Rental Market Survey | Oct 2025 |
| Unemployment, employment, participation | StatCan LFS 14-10-0459-01 (3-month avg, SA) | Sep 2026 |
| Rent price change | StatCan CPI 18-10-0004-01 | Sep 2026 |
| Wages by occupation (515 NOC) | ESDC Job Bank, 2025 edition | 2023–24 reference |
| New permanent residents by CMA | IRCC open data | Jan 2015 – Aug 2026 |
| Immigrant income, retention | StatCan 43-10-0030-01, 43-10-0022-01 | tax year 2023 |
| Living-cost basket | StatCan MBM 11-10-0066-01 | 2025 |
| Population | StatCan 17-10-0148-01 | July 1, 2025 |
| Language, commuting, households | 2021 Census | 2021 |
| Climate normals | ECCC | 1991–2020 |

All updatable sources were the latest official releases on 2026-11-05. Census 2021,
the 1991–2020 normals and NOC 2021 are the current editions by design.

**Coverage:** 31 places — 26 CMAs (Ottawa and Gatineau as the Ontario and Quebec parts
of Ottawa–Gatineau), 4 census agglomerations (Charlottetown, Brandon, Whitehorse,
Yellowknife) and Iqaluit. 28 places have at least five of six headline measures.
Gaps are shown as missing with the reason (e.g. no StatCan asking rents for CAs and
territories; provincial/regional labour values are labelled).

## 3. How it works

```
official sources → pipeline/<domain>/run.py → data/processed/<domain>/  (contract-shaped JSON)
                 → pipeline/build_app_data.py (validates) → public/data/ → static React app
```
- Shared data contract: `src/types/contract.ts` (every value carries period, geography,
  source and quality flags). Budget/pay arithmetic: `src/model/`.
- Deployment: `.github/workflows/deploy-pages.yml` builds and publishes on every push
  to `main`.
- Freshness: `.github/workflows/refresh-data.yml` runs every Monday 10:23 UTC (and on
  demand via *Actions → Refresh data → Run workflow*). If a newer official release
  exists it refreshes rents, CPI, LFS, wages, immigration and population, validates,
  commits "Data refresh <date>" to `main` and redeploys.

## 4. How to check it yourself

```bash
npm install && npm run dev            # local app on http://localhost:5173
npm run build                         # type-check + production build
npm run data:check                    # 10 data checks incl. re-reads from raw downloads
node scripts/check-model.mjs          # 8 budget/pay arithmetic checks
npm run data:freshness                # compare every source with its latest official release
```
Things worth verifying by eye: each number shows period + source ("Details" expands
the source record); missing values say "No comparable data" and why; regional or
province-wide values are labelled; budget lines carry SOURCED / ESTIMATE / USER INPUT;
shared links such as `/place/toronto` open directly.

Last verification (2026-11-05): 17/17 spot-checked values match the live official
sources; 129/134 links OK (the rest are sites that block automated checks or have a
certificate error — links are official and left as is); full click-through on desktop
and iPhone with no console errors.

## 5. Known limitations / what's next

- **No live job postings** — Job Bank's terms forbid automated querying and no permitted
  feed exists; the app links to verified Job Bank searches (incl. "open to foreign
  candidates"). `src/adapters/jobs.ts` is ready for other boards.
- **No gross-to-net tax calculator** — the budget asks for take-home income.
- **Not ingested:** historical Job Bank posting counts.
- **New editions need a one-line URL update:** CMHC 2026 (due Dec 2026) and Job Bank
  2026 wages are detected by the freshness check but their file URLs are edition-specific
  (`pipeline/housing/cmhc.py`, `pipeline/work/wages.py`).
- **Program pages not readable automatically:** PEI, Yukon, Claresholm, Thunder Bay
  (bot protection) and Brandon (certificate error) — records are minimal and link to the
  official pages.
- **Assumptions labelled in the data:** Gatineau's MBM region (StatCan publishes no
  Quebec-part row); climate values come from one reference station per place; census
  commuting reflects May 2021.
- **Housekeeping:** delete the old branch `claude/inspiring-feynman-jjdn6y` on GitHub
  (fully contained in `main`). On GitHub Pro/Team plans a Pages site from a private
  repository is public to anyone with the link.
