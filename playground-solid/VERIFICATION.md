# playground-solid verification log

Historical playground-migration log from 2026-09-10 (git baseline `1f51247e`). It is not current product proof. Do not copy its old test counts, scratch-directory paths, or “all pages verified” sentences into README, docs, or a PR description.

Re-run current checks:

```sh
pnpm --filter markstream-solid-playground typecheck
pnpm --filter markstream-solid-playground test
pnpm play:solid:build
pnpm test:e2e:solid-playground
pnpm test:e2e:solid-hydration
pnpm test:smoke:solid
pnpm test:smoke:solid:optional
```

Capability table and limits: [`packages/markstream-solid/CAPABILITY.md`](../packages/markstream-solid/CAPABILITY.md).

The 2026-09-10 run stored command logs under a machine-local scratch directory that is not in git. Packed-consumer and hydration proofs now live in `scripts/smoke-solid-packed-package.mjs` and `scripts/e2e-solid-hydration.mjs`. In-process `disable*()` tests are not a missing-peer proof.
