# Synthetic development fixtures — NOT DATA

Files here are invented for interface development only. They are served at
`/__fixtures/` by the Vite dev server when you run
`VITE_DATA_BASE=/__fixtures/ npm run dev`, and are never included in a build.
Real snapshots live in `public/data/` and are produced by `npm run data:build`.
