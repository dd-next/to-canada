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

## Current status

- Implementation commit `a3b9896`; latest-main integration commit `5218a81` incorporates merged neighbourhood PR #4 / main `158c084` (Toronto/Vancouver) and retains its dynamic builder and validator discovery. No neighbourhood-owned modules were edited by this workstream.
- Services: 1,908 of 1,908 upstream resources; 35 categories, 163 source jurisdictions, 6 original levels, zero quarantine. Upstream commit `6ea942a7d3df9d4a0922015105b5263057fdb175`. Full original objects and MIT notice verified. Stable duplicate IDs and retirements tested; live no-change check preserved content/event history.
- LMIA: genuine partial coverage, 12,823 named-employer records / 35,006 approved positions in official 2021 Q2 and Q3 files (April–September), NOC 2011. Approved LMIA counts are absent and remain null. Independent every-row workbook audit passed. Official current catalogue/download host returns HTTP 503; 38 additional secondary discovery references are explicit gaps, not claims of verified current completeness. Automatic official discovery remains enabled.
- Local repository checks all pass: build, model/scenario/unchanged CRS, snapshot validators, existing refresh/IRCC/neighbourhood regression suites, 16 Services tests, 18 LMIA tests, directory UI model tests and three combined publication tests. Build succeeds with `/to-canada/` base and 954 static entries.
- Initial production-build browser run passed 32 checks / 21 screenshots at 1440, 768 and 375 px. Final combined/base-path browser pass underway; evidence in `dev/validation/services-immigration`.
- Independent reviewers found and fixed duplicate multiplicity ID churn, retired-only filter discoverability, previous successful statistics-check retention, NOC header recognition, separate occupation fields and publisher-revision precedence. CRS scoring, fixtures and answer privacy remain unchanged.
- Remaining: commit complete LMIA/evidence, push PR, passing CI, reconcile any further main changes, merge/deploy, live browser validation and manual Services/LMIA workflow execution. Do not claim full LMIA coverage until its source availability blocker clears.
