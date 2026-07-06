# eosio-contract-api indexer

Validated operational behavior of the eosio-contract-api / atomicassets-api indexer (filler): handler configuration, drain gating, data freshness, database migrations, and CI.

## The delphioracle handler is required everywhere

The AtomicMarket handler's schema setup declares a foreign key from `atomicmarket_symbol_pairs` to `delphioracle_pairs`. The `delphioracle_pairs` table is created only by the delphioracle handler's own bootstrap, so a filler configuration that omits the delphioracle handler fails during AtomicMarket table creation with a missing-relation error. This means the delphioracle handler must be registered in every chain's filler configuration, ordered before the atomicmarket handler, even on chains where no delphioracle contract is deployed — there it simply observes a non-existent account and stays idle. The failure surfaces as a schema/migration error on a fresh chain rather than anything pointing at handler configuration, which makes it a common trap when onboarding a new chain.

## Reader-priority drain gate and queue dedup

The eosio-contract-api filler protects block ingestion with a reader-priority gate on scheduled aggregator drains: drains are deferred while the reader is more than a stop threshold of blocks behind chain head (default 200) and resume only once it falls below a lower resume threshold (default 60); both are environment-tunable. The two thresholds form a hysteresis band so the gate does not flap between defer and resume on every block. The gate is only safe in combination with queue deduplication: unique partial indexes on the sales-filter update queue collapse repeated updates for the same sale, asset, or offer key, so a gated queue grows only to the number of distinct dirty keys rather than with raw event volume. Gating without dedup produces a doom loop — the deferred queue grows without bound, each eventual drain gets more expensive, the reader falls further behind, and the gate never releases.

## Sales-filter freshness is rest-gap dominated

The `update_atomicmarket_sales_filters` drain job is registered at a hardcoded 60-second interval in the AtomicMarket handler, while every other drain knob (batch size, time budget, statement timeout, work_mem) is environment-tunable. The filler's job queue schedules the next run at completion time plus the interval, so the 60 seconds is a rest gap between completions, not a fixed cadence. On a high-volume chain where a drain batch itself takes tens of seconds, steady-state sales-filter freshness is therefore dominated by the rest gap rather than by drain throughput: typical staleness is roughly the interval plus one batch time. Shortening the interval is only safe alongside a reader-priority drain gate and queue dedup; without those protections, a shorter interval degrades block ingestion under load.

## Migration directories never re-run

The atomicassets-api migration runner keys on a single `dbinfo` table row named `version`: at startup it compares that value against the versioned directories under `definitions/migrations/` and applies only directories whose version is strictly greater. A directory the database has already applied is never re-executed. This has a practical consequence for changing a migration that has already shipped in a tagged release: editing it in place does nothing for databases that already ran the original, because their `dbinfo.version` already covers it — those databases must be converged with manual SQL or a new higher-versioned migration. Editing a migration in place is only safe while no external deployment has applied it.

## CI runs only against main

The atomicassets-api CI workflow triggers on pushes to `main` and on pull requests targeting `main` only. A pull request opened against any other branch (for example a long-lived feature integration branch) starts no checks at all, so an all-green PR page does not mean the change was tested. Contributors working on integration branches should verify locally: run a PostgreSQL container, export `POSTGRES_TEST_HOST`, `POSTGRES_TEST_PORT`, `POSTGRES_TEST_USER`, `POSTGRES_TEST_PASSWORD`, and `POSTGRES_TEST_DATABASE` (with `PGSSLMODE=disable` if the container has no TLS), then run `pnpm test:integration:ci` alongside the lint, typecheck, build, and unit-test scripts that the CI workflow runs.
