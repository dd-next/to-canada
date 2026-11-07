# Services and Immigration delivery checkpoint

Scope: implement and publish the full Services directory, unified Immigration navigation and historical positive LMIA ingestion.
Start: current main `fb072afcc281f240f9319844e1568f008ff44d22`.
Branch: `codex/services-immigration-hub`; isolated checkout `/workspace/services-immigration`.

## Ownership

- Lead: shared routing/navigation/Layout, global styles/state, standalone feed preservation in both publication paths, dependencies, workflows, static route generation, integration, browser QA, PR/merge/deploy.
- Services ingestion agent: `pipeline/services/**`, `public/data/services/**`, `third_party/awesome-canada/**`, `docs/SERVICES.md`.
- Services UI agent: `src/components/services/**`, `src/types/services.ts`, `src/pages/Services*.tsx`, `src/styles/services.css`, and program taxonomy changes in `src/pages/ImmigrationPage.tsx` / `src/components/immigration/programGroups.ts` only.
- LMIA ingestion agent: `pipeline/lmia/**`, `public/data/lmia/**`, `docs/LMIA.md`.
- LMIA UI agent: `src/components/lmia/**`, `src/types/lmia.ts`, `src/pages/LmiaPage.tsx`, `src/styles/lmia.css`.

Feature modules export default pages; the lead wires routes and secondary navigation.
Feeds are standalone directories `public/data/services` and `public/data/lmia`.
Agents agree JSON contracts directly, document them in their README, and do not edit shared files or commit/push.

## Parallel neighbourhood work

Active chat `01a1b736-4c1b-7092-828d-2b5d6d49f0be` (host durable), title `Locate /goal`, is implementing neighbourhood expansion. Cross-chat messaging tools are not available; no ownership or merge agreement has been made. Its isolated checkout is `/workspace/northward-neighbourhoods` in its own environment, branch `codex/neighbourhoods-expansion`. Monitor compact status, open PRs and latest main before integration/merge. Preserve all neighbourhood paths and additive changes to shared publication, manifest and workflow files.

## Required completion

Full Services ingestion and honest persistent history; complete discoverable LMIA historical series with coverage gaps; canonical routes plus query/hash-preserving aliases; published license notices; daily Services and weekly LMIA workflows; shared-lock staged atomic preservation; required tests and real production-build browser QA; independent review; push PR, passing CI, protected merge and GitHub Pages deployment; live verification and manual refresh execution.

## Current status: LMIA recovery continuation

- Initial implementation was merged and published in [PR #6](https://github.com/dd-next/to-canada/pull/6), merge `d1df089`. Services imports all 1,908 current upstream records across 35 categories, 163 jurisdiction labels and six levels. Its manual refresh passed without creating a content event. Daily Services and weekly LMIA workflows are active.
- Neighbourhood PRs #4, #5 and #7 are incorporated: Edmonton, Calgary, Toronto, Vancouver, Halifax, Victoria, Winnipeg and Québec City. No neighbourhood-owned files were edited by this task. Main reached `0022457` after the latest LMIA data refresh.
- The official catalogue genuinely recovered at **2026-11-07 19:23:13 UTC**: 80 official resources, 40 selected non-overlapping periods from 20 June 2014 through 30 June 2026. Its exact verified package and retrieval provenance are retained in `public/data/lmia/catalogue.json`.
- [Manual run 42405867318](https://github.com/dd-next/to-canada/actions/runs/42405867318) downloaded the canonical series and deployed **261,651 records / 1,012,937 approved positions across 28 periods**, June 2014–December 2025. Twelve periods failed parsing; the source-failure reporter correctly failed while validation and deployment succeeded.
- [PR #8](https://github.com/dd-next/to-canada/pull/8) fixes French footers, reversible legacy-byte decoding, unnamed publisher rows, French geography aliases and shortened NOC codes. Commit `87ccf26` implements those fixes. Independent replay verified all 1,572 affected 2016 occupation codes and preserved names, addresses, approvals and known location identities.
- Commit `b67431f` retains the verified catalogue during API outages, without advancing successful-check clocks or claiming current catalogue completeness. Cached discovery remains partial; failed resource downloads retain valid partition bytes and provenance. Thirty-two ingestion tests and three combined publication tests pass. Independent cache review found no actionable issues.
- Updated UI checks, unchanged CRS/model checks, snapshot validation and production build pass. The combined build produces 1,296 static route entries. Local production-build browser acceptance passes 35 checks with 22 screenshots against the 28-period data. `scripts/check-lmia-recovery-browser.cjs` adds focused real-data checks for unnamed identities, unresolved source bytes, corrected NOC filters and publisher geographies.
- The catalogue API timed out again in both attempts of [live validation 42406962520](https://github.com/dd-next/to-canada/actions/runs/42406962520). That job did not reach parsing or publish. Current source validation of the cache-capable branch is [run 42408199401](https://github.com/dd-next/to-canada/actions/runs/42408199401); normal PR validation is [run 42408201656](https://github.com/dd-next/to-canada/actions/runs/42408201656).
- Remaining: inspect live-source results, retain honest coverage/freshness status, complete PR #8 CI/merge/deployment, execute the supported production refresh, and verify actual public counts, edge cases and all eight neighbourhood cities. Do not claim all 40 periods or a successful fresh catalogue check until verified. Local live evidence is under `dev/validation/services-immigration/live/`; continuation evidence is under `lmia-recovery-local/`.
