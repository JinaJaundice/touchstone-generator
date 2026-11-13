# gen

## Overview

This directory is the synthetic data generator. It builds a seeded UK bank (accounts, a payment graph, ordinary life on a real calendar), plants labelled crime patterns in it and returns one `Dataset` with the transaction log, the truth flags and the pattern register. It also holds the bank builder model, the data dictionary, the Parquet writer and the worker that runs the generator off the main thread.

## Interface

- `generate.ts`: `generate(config, walletPool, progress?, poolAbout?)` returns a `Dataset`. Also `readWalletPool`, `classOf`, `streamSeed(seed, period, tag)`, `STREAMS` and a re-export of `GENERATOR_VERSION`.
- `version.ts`: `GENERATOR_VERSION`, kept in its own file so a page can read it without loading the generator.
- `types.ts`: the data model (`GenConfig`, `Dataset`, `Account`, `Tx`, `AccountEvent`, `PatternInstance`, the typology and family types) and the label tables such as `TYPOLOGY_FAMILY`, `TYPOLOGY_LABEL` and `HIGH_RISK_COUNTRIES`.
- `config.ts`: `DEFAULT_CONFIG`, `PRESETS`, the typology defaults, `normaliseConfig`, `cashFactor` and `abroadShare`.
- `client.ts` and `worker.ts`: `runGenerator(config, onProgress?)`, `loadWalletPool()` and `loadWalletPoolFile()` (the wallets, the file's own account of its origin and whether the pool is generated) on the page side, and `TX_SLICE` with the message handler on the worker side.
- `world.ts`, `population.ts`, `normal.ts`, `aml.ts`, `fraud.ts`, `crypto.ts`, `scheduler.ts`, `calendar.ts`, and `address.ts`: the `World` class, `buildAccounts`, `buildGraph`, `scheduleNormalModels`, `scheduleAml`, `scheduleFraud`, `scheduleCrypto`, `makeCalendar` and `makeSegwitAddress`.
- `archetypes.ts`: the seven bank archetypes, the `DIALS`, `DIFFICULTY`, `estimate`, `stats`, and the share-link and saved-bank functions `encodeBank`, `decodeBank`, `loadSavedBanks` and `storeSavedBanks`.
- `calibrate.ts`: `calibrate`, `readFigures` and `figuresTemplate` (format `touchstone-figures/1`).
- `dictionary.ts`: the field specifications and `checkRecord`. `message.ts`: `renderMessage` and `messageText`. `parquet.ts`: `txParquet` and `accountsParquet`. `fingerprint.ts`: `fingerprint(ds)`.
- Data files: `sources.json` holds every figure the generator is calibrated to, with its register identifier.
- The shared helpers `rng.ts` and `stats.ts` are in `web/src/lib/`. The screening list `lib/lists/ofac.json` has no README because it holds data only.

## Invariants

- The generator must not import code that tests or scores its data, and such code may import only from `gen/types.ts` in this directory. In the working repository `scripts/lib/wall.mjs` enforces both limits and `node scripts/design-check.mjs` exits 1 on a breach. That script is not part of `npm run build`.
- The truth (pattern, family, leg role) travels on the record for marking and for the files, and no rule may read it (header of `types.ts`).
- Every random draw comes from a seeded stream. `streamSeed` mixes the seed, the period and one of the `STREAMS` (`life`, `aml`, `fraud`, `crypto`, `days`), so a change to one family's dials changes only that family's draws.
- A seed gives the same bank only under the same release. `GENERATOR_VERSION` must be bumped whenever the output of a seed changes (comment in `generate.ts`).
- Period 1 starts on the date in `sources.json` (`calendar.day0`), and period n starts `(n - 1) * days` later (`periodStart` in `calendar.ts`).
- The worker sends transactions in slices of `TX_SLICE` (200,000) because a single message of 2.4 million records fails to clone, and `runGenerator` rejects when the count received differs from the count sent.
- Every record must satisfy the specifications in `dictionary.ts`, which `scripts/qa-gen.ts` checks and `scripts/write-dictionary.ts` turns into `docs/DATA_DICTIONARY.md`.
- Counterparty wallets come from the wallet pool file `public/wallet_pool.json`, which states its own origin, and a customer's own wallet is a made segwit address with a valid checksum (`address.ts`).

## Side Effects

- `client.ts` fetches `./wallet_pool.json` once and starts a module worker from `./worker.ts`. A failed fetch resolves to an empty pool.
- `archetypes.ts` reads and writes `localStorage` under `touchstone-banks-v1`, keeps at most 12 banks and ignores storage errors.
- `worker.ts` posts progress, transaction slices, completion and error messages and reads `performance.now()`.
- `calendar.ts` reads `Date` for calendar arithmetic only.
- The generator code is otherwise deterministic for a given configuration and release.

## Verification

- `scripts/qa-gen.ts` runs in the working repository only, because it imports files that the public copy does not hold.
- Run in `web/`: `npx esbuild scripts/qa-gen.ts --bundle --platform=node --format=esm --outfile=.tmp/qa-gen.mjs && node .tmp/qa-gen.mjs --matrix=quick`
- Run in `web/`: `npx esbuild scripts/smoke-gen.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke.mjs && node .tmp/smoke.mjs`
- Run in `web/`: `npm run build`, which type checks the directory.
