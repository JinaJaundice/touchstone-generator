# generator

## Overview

This directory is the entry of the generator on its own. It renders the Make data view of the Touchstone generator with a masthead that holds no links, a data strip and a footer, and it carries no page that tests rules.

## Interface

- `main.tsx`: mounts `GeneratorApp` into the element `root` of the entry page. The entry page is `web/generator.html` in the working repository and `web/index.html` in the public copy.
- `GeneratorApp.tsx`: the default export `GeneratorApp`. It renders `Masthead`, `DataStrip`, `Generate` and `Foot` with their default texts, which are the texts of this page, and it passes the footer line through the property `line` of `Foot`.

## Invariants

- The page makes the default data set once on load through `bootGen(["bank"])`. A link of the form `#/data?bank=...` sets the bank type, and the page removes the key from the address after it reads it.
- A link that carries a run is ignored and the key is removed, so the page keeps the default data set.
- The footer says that wallet addresses are generated only when the wallet pool file states that it is generated. While the file has not loaded, or cannot be read, the footer holds the 2 sentences about generated data only.
- The page imports the generator store and the generator files only, never the rule tests or the bench store.

## Side Effects

- The page fetches `./wallet_pool.json` once through `loadWalletPoolFile` and starts the generator worker.
- The page writes the address hash when it removes a link key.

## Verification

- Run in `web/`: `npm run build`, which type checks this directory.
- Run in `web/`: `npm run dev` and open the entry page, which is `http://localhost:5178/generator.html` in the working repository and `http://localhost:5178/` in the public copy.
