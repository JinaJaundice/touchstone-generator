# Touchstone generator

This generator makes the transactions of a synthetic UK bank. The data holds accounts, payments on the UK rails, card and cash activity, and Bitcoin transfers. The generator plants financial crime patterns in the data and labels every planted transaction. Every record is generated. No record describes a real customer, a real account or a real payment. The only real identifiers in the data are 7 Bitcoin addresses from OFAC's public sanctions list, which one crime pattern pays.

## What the data is for

You apply your own monitoring rules or model to the data. You then mark the result against the labels. The generator applies no rule of its own.

## Run it

You need Node.js 22 or later, which is the oldest version that the tests have run on. Install the packages and start the page from the `web/` folder:

```
npm ci
npm run dev
```

The page opens at http://localhost:5178. To check a change, build the page and run the 4 generator tests:

```
npm run build
npm test
```

The dials allow up to 12,000 accounts over 180 days. At that size the 7 bank types, each with its own settings, hold between about 1.1 and 2.9 million transactions. Other dials, such as Activity, can raise the figure. Each of the 7 was made in the Chromium browser in under 30 seconds on one laptop. The browser used between about 2.2 and 4.1 GB of memory at its peak. No bank above 2.9 million transactions was tested, and no phone was tested. You can also try the generator without an install, on the Make data page at https://touchstone-tm.vercel.app/#/data. That site uses another wallet pool. Its wallet addresses differ from the addresses of this copy.

## What you can set

The page offers these settings:

- 7 bank types: high-street bank, challenger bank, building society, private bank, payments firm, business bank and crypto-linked bank
- dials in 5 groups: customers, products, countries, transactions and crime
- 4 difficulty steps: Easy, Normal, Hard and Brutal
- the rate of each of 37 patterns for each 1,000 accounts (17 money laundering, 16 fraud and 4 crypto)
- the seed number
- the period

Each make draws a new seed number unless you pin it. The next period keeps the bank and its customers and draws new days and new crime.

## What you get

The page offers 6 downloads:

- transactions as a CSV file
- accounts as a CSV file
- transactions as a Parquet file
- accounts as a Parquet file
- the planted patterns as a JSON file
- the settings as a JSON file

`docs/DATA_DICTIONARY.md` defines every field.

## The labels

Each transaction carries 5 answer key columns: `patternId`, `typology`, `family`, `role` and `caseId`. Each account carries 4: `isSar`, `isFraud`, `fraudRole` and `patterns`. Drop these columns before a rule or a model reads the data, because they hold the answer. Every field of the file of planted patterns is part of the answer key. A rule or a model must not read that file either.

## Repeating a data set

A seed number repeats a data set only with the same generator release and the same wallet pool. The page shows a fingerprint of 8 hexadecimal characters for each data set. Two data sets with the same fingerprint hold the same transactions. A link to a bank copied from another copy of the generator opens the same bank with the wallet addresses of this pool.

## Limits

- Generated crime is cleaner than real crime.
- The standard bank plants far more crime than a real bank holds.
- Crypto covers Bitcoin only.
- Apart from those 7 listed addresses, the wallet addresses of this copy are generated in fixed counts and belong to no one.

## Sources, licence and the working repository

`docs/SOURCES.md` lists the publications that the generator cites for a figure, a rate or a pattern shape. `THIRD_PARTY_NOTICES.md` lists the outside work that the generator draws on and the licence of each. The licence of this repository is the Apache License 2.0. `LICENSE` holds its text and `NOTICE` holds the copyright notice. `CONTRIBUTING.md` says how to propose a change, and `SECURITY.md` says how to report a security problem.

This repository is a public copy of the generator from a private working repository and is refreshed from it. Two things follow from that:

- A comment in the code may name a file of the working repository that this copy does not hold.
- The package file is the working repository's, so `npm ci` also installs the tools of its page tests. The scripts `prose` and `a11y` name files that this copy does not hold.
