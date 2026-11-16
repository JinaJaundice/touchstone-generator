# patterns

## Overview

This directory holds the pattern library of the generator: crime patterns that are written as files and not as code. A part file holds one piece of a method, which is a source of the funds, a way of hiding them or a cash-out. A pattern file joins a source part, hiding parts and a cash-out part. The expander turns a pattern into the parties and the payments of one case. This release holds the formats, the validator, the expander, the planter and 8 files. The planter places the cases of the patterns that a user switches on in a data set and writes the rows of the answer key. The specification of both file formats is `docs/PATTERN_FORMAT.md`.

## Interface

- `types.ts`: the types of a part file, a pattern file, a plan, a priced case, a party and a leg, the lists of allowed values, `resolveAssets`, `PAIRS` and `RAILS`. The families, the account roles and the leg roles come from the generator's own tables, and the methods, the reasons of a payment and the segments are checked against the unions of `../types`, so a new value there stops the build.
- `validate.ts`: `validatePart(json, known)` and `validatePattern(json, partsById, known)`, which apply the 10 checks of the specification and return the file or a list of errors. Each error names the file's id and the field. `known` is the set of source ids of `references.json`.
- `expand.ts`: `drawPlan(pattern, partsById, settings, r)` makes every random draw of one case, `price(plan, facts, fixed)` turns the plan into amounts and makes no draw, `expandCase` applies one to the other, and `typicalCase(pattern, partsById, settings)` draws the same case each time for a page.
- `plant.ts`: `scheduleLibrary(w)` places the cases of every pattern that is switched on with a rate above 0 and `settleLibrary(w)` writes the parties and the planned payments of each case after the days have run, following the 13 rules of section 6 of `docs/PATTERN_FORMAT.md`. `patternsOn(cfg)` lists the patterns that are on, `needSentence(pick)` words the need of a customer party, `LIBRARY_ROW_CAP` is 20,000 rows for each pattern and `setRowCap(n)` changes it for a test.
- `index.ts`: imports each file by name, checks it once and exports `PARTS`, `PATTERNS` (in the order of their ids), `partOf(id)` and `patternOf(id)`. A file that fails a check stops the module with an error that names the file and the field.
- `labels.ts` and `labels.json`: `labelsOf(patterns, parts)` gives, for each pattern, its title, its short name, the values of `bankSees` that it allows and, for each end that has a customer, the key `lib.<id>.<end>` with its family, label and short name. `labels.json` holds those entries.
- `version.ts`: `LIBRARY_VERSION`, which changes when a file of the library changes.
- `parts/` holds the part files, `library/` holds the pattern files, and `references.json` holds the identifier and title of each source that a file of the generator cites.

## Invariants

- The expander makes its draws in a fixed order, which the header of `expand.ts` states, and the order does not depend on the size, the speed or the end that the bank sees. The stored cases in `scripts/fixtures/library-golden/` hold that order in place.
- `expand.ts` imports `types.ts` and `../../rng` only. `validate.ts` imports `types.ts` and, for check 10, `expand.ts`. No file here imports `generate.ts`, a rule, a view or a store. The generator's own `../types.ts` imports `labels.json` for `patternLabel`, `patternShort` and `patternFamily`, and `../config.ts` imports it for `normaliseLibrary`. The planter `plant.ts` imports `index.ts`, `expand.ts`, `labels.json`, `version.ts` and the generator's `address.ts`, `streams.ts`, `walletClass.ts`, `sources.json` and `../../rng`, and it keeps its working state for a world in a map of its own that never reaches the data set.
- A part or a pattern is a JSON file with the schema `touchstone-part/1` or `touchstone-pattern/1`, and a field that the specification does not list is an error.
- Every source id in a file is an entry of `references.json`, and each step of a part states the source and page of its figures or says that the value is an assumption.
- A pattern is off unless a user switches it on, so a data set made with no library pattern is the same as before. The planter plants a case only where a user has switched a library pattern on with a rate above 0, and it makes its draws from a stream of its own for each pattern, so that no other draw of the generator moves.

## Side Effects

- None. The modules read no file at run time and draw only from the generator that the caller passes in.

## Verification

- Run in `web/`: `npx esbuild scripts/qa-library.ts --bundle --platform=node --format=esm --outfile=.tmp/qa-library.mjs && node .tmp/qa-library.mjs`. It checks that every file is valid and imported, that the expander gives the stored cases, and that 200 cases of each pattern keep their steps, counts, waits and funds. It also makes 16 data sets and checks the planter, which takes about 50 to 95 seconds, depending on the load of the machine (53.5 s and 94.3 s in 2 runs on 16 November 2026). `npm test` runs it.
- Run in `web/`: `npm run build`, which type checks this directory.
- In the working repository, `scripts/write-references.ts` writes `references.json` and `labels.json`, and a second run leaves both unchanged.
