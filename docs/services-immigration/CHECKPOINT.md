# Services and Immigration delivery checkpoint

User brief: `/workspace/attachments/1fd4c427-a832-4923-9195-1c295383b53c/Pasted text.txt`.
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

Repository/documentation inspected; no applicable AGENTS.md found and no open PRs at start. Feature implementation pending. Source coverage, validation and publication evidence will be recorded here as obtained.
