# Third-party notices

This file lists the outside work that the Touchstone generator draws on, with the licence of each.

## AMLGentex

AMLGentex is a generator of synthetic transactions for research on money laundering. AI Sweden published it with
Handelsbanken and Swedbank under the Apache License, Version 2.0, at https://github.com/aidotse/AMLGentex. Its
repository names no copyright holder and holds no notice file. The statements below refer to its commit 4b9a69d,
read on 10 November 2026.

Three parts of this repository are translations of AMLGentex code into TypeScript, and each was changed:

- web/src/lib/gen/scheduler.ts is a translation of the class PatternScheduler in
  src/data_creation/temporal_simulation/alert_patterns.py. It draws from this repository's seeded generator, and it
  leaves out the case of more transactions than days.
- The function truncNormal in web/src/lib/rng.ts is a translation of the class TruncatedNormal in
  src/data_creation/temporal_simulation/utils.py. It draws from a seeded generator.
- The function lognormalLinear in web/src/lib/rng.ts is a translation of the function linear_to_lognormal_params in
  src/data_creation/temporal_simulation/simulator.py.

Other parts follow the design of AMLGentex with code that was written for this repository. They are the first 8
laundering patterns in web/src/lib/gen/aml.ts, which follow the algorithms of the alert patterns in
src/data_creation/temporal_simulation/alert_patterns.py, the 6 ordinary transaction models in
web/src/lib/gen/normal.ts, and the payment network and the customer demographics in web/src/lib/gen/population.ts.

## Wallet labels and behaviour classes

The wallet pool of this repository holds generated Bitcoin addresses that belong to no one. Its scheme of labels
(illicit, licit and unknown) follows the Elliptic++ data set (Elmougy and Liu, 2023), and the names of its behaviour
classes follow the BABD-13 data set (Xiang and others, 2024). This repository holds no record of either data set.

## Pattern names and shapes

Seven laundering patterns in web/src/lib/gen/aml.ts follow laundering types that the paper on the SAML-D data set
describes (Oztas and others, 2023), which docs/SOURCES.md lists as S49. They are structuring, smurfing,
deposit-and-send, behavioural change, single large, cash-out and over-invoicing. The code of each pattern was written
for this repository, which holds no record of that data set.

## Fonts

The site loads the fonts Bitter and Archivo from the npm packages @fontsource-variable/bitter and
@fontsource-variable/archivo. Each font is licensed under the SIL Open Font License, Version 1.1, and each package
carries the licence text. Bitter: Copyright 2011 The Bitter Project Authors. Archivo: Copyright 2020 The Archivo
Project Authors.

## Public sector information

The bank holiday dates in web/src/lib/gen/sources.json are from GOV.UK, and the figures on inheritances and gifts in
that file are from a publication of the Office for National Statistics. They contain public sector information
licensed under the Open Government Licence v3.0. The take-home pay of the age bands in
web/src/lib/gen/population.ts is an assumption of this repository, which was checked against the earnings figures
that docs/SOURCES.md lists as S56.

## Sanctions list

The file web/src/lib/lists/ofac.json holds entries copied from the Specially Designated Nationals list that the
Office of Foreign Assets Control of the US Department of the Treasury publishes. The file states the date and the
SHA-256 hash of the list it was copied from. A sanctions list changes over time, so the file must not be used for
screening.

## Cited figures

docs/SOURCES.md lists the publications that the generator cites for a figure, a rate or a pattern shape. Those
publications remain the work of their publishers.

This repository holds no figure of the 3 UK Finance publications that docs/SOURCES.md lists as S01, S02 and S11. For
the Annual Fraud Report 2025, the file web/src/lib/gen/sources.json holds ratios that this repository computed from
the totals of the report, such as the mean value of a payment for a type of scam.
