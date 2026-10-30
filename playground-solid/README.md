# Solid playground

From the repository root, run `pnpm install` and `pnpm play:solid`, then open http://localhost:4178.

Edit the source, select a chunk size and interval, stream from the start, pause/resume, restore the whole document, or load a 1,000-node fixture. Dark mode and custom reasoning components are included. The source and output panes scroll independently.

`pnpm play:solid:build` creates the production playground. `pnpm test:e2e:solid-playground` runs correctness, virtualization, hydration and Vue 3/Solid performance checks against that build. Results are saved in `.tmp/solid/` at the repository root.
