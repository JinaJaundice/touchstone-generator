# The data dictionary

Written by `web/scripts/write-dictionary.ts` from `web/src/lib/gen/dictionary.ts`
for generator release 2026-09-23.2. Do not edit by hand: change the
dictionary module and run the script. In the working repository a check reads
every record of every data set in its matrix against the same definitions and
fails on a field missing, of the wrong kind, or holding a value not listed here.

A field marked **truth** is the answer key. It travels on the record for the
marking and for the files, and no rule may read it.

The transaction file and the account file hold one column for each field of the
tables Transactions and Accounts below. A field of the session, the payee, the
card payment or the crypto leg has a column named after both, such as
`session_channel` or `crypto_label`. The transaction file also holds the column
`date`, which gives the calendar date of `day`.

## Transactions

One record per payment, card authorisation, cash movement, crypto leg or
opening balance. A declined card authorisation is a record that moved no money.
The date of a day is the data set's calendar: period 1 day 0 is Monday
6 July 2026, and the minute is UK clock time.

| Field | Kind | Meaning |
|---|---|---|
| `id` | int | the record's number, in time order from 0 |
| `day` | int | the day, 0 to days - 1; day 0 is the data set's day0 date |
| `minute` | int | the minute of the day in UK clock time, 0 to 1439 |
| `type` | enum | what the money did<br>`TRANSFER`: account to account, here or at another bank; `INCOME`: a credit from outside the data set; `SPEND`: a payment to a merchant or a biller; `CASH_IN`: cash paid in; `CASH_OUT`: cash taken out; `CRYPTO_OUT`: bitcoin bought with pounds and sent to a wallet; `CRYPTO_IN`: bitcoin received from a wallet and sold into the account; `INITIAL`: an opening balance |
| `rail` | enum | the payment system<br>`FPS`: Faster Payments; `BACS`: Bacs (Direct Debit and Bacs Direct Credit); `CHAPS`: CHAPS; `CARD`: a card scheme; `CASH`: cash; `INTL`: SWIFT, abroad; `CRYPTO`: the Bitcoin chain, through the bank's crypto service; `INTERNAL`: an entry inside the bank |
| `method` | enum | how the payment was made on its rail<br>`fps`: a single immediate Faster Payment; `standing-order`: a repeating Faster Payment; `forward-dated`: a Faster Payment set up for a date; `direct-debit`: collected by a biller through Bacs, on a working day; `bacs-credit`: paid in bulk through Bacs, on a working day; `chaps`: CHAPS, on a working day from 6am to 5.40pm; `swift`: SWIFT, in the payee's currency; `card-chip`: card present, chip and PIN; `card-contactless`: card present, contactless, up to GBP 100; `card-online`: card not present; `card-magstripe`: card present, magnetic stripe; `atm`: a cash machine, up to GBP 500 a day; `counter`: a branch counter; `partner-counter`: a partner counter such as the Post Office; `crypto`: on-chain; `internal`: an entry inside the bank |
| `status` | enum | whether money moved<br>`settled`: the payment went through; `declined`: a card authorisation was refused; no money moved |
| `amount` | number | the value in pounds, two decimal places, above zero |
| `currency` | string | the currency the payee receives: GBP, or the payee's currency on a SWIFT payment (ISO 4217) |
| `orig` | int | the paying account's id, or -2 for money from outside the data set |
| `dest` | int | the receiving account's id, -1 for money leaving the data set, or a wallet slot (-1000 or below), one slot per address |
| `cpRef` | string, may be null | a stable id for the counterparty outside the data set: a merchant, a biller, an employer, a payee at another bank, or a wallet address. Set when the counterparty is outside the data set and is not cash. |
| `wallet` | string, may be null | the counterparty wallet's full Bitcoin address. Set when rail is CRYPTO. |
| `walletClass` | enum, may be null | the class the rail uses for the wallet: the wallet pool's behaviour class mapped onto the rail's classes, or sanctioned for an OFAC-listed address. Set when rail is CRYPTO.<br>`exchange`: classed as an exchange; `personal`: classed as a self-hosted or peer-to-peer wallet; `mixer`: classed as a tumbler; `darknet`: classed as a darknet market, extortion or cyber service; `gambling`: classed as gambling; `sanctioned`: on the OFAC list; `unknown`: any other class |
| `bankOrig` | string | the payer's bank: Bank A to F for an account here, external, or wallet |
| `bankDest` | string | the payee's bank, the same way |
| `country` | string | the counterparty's jurisdiction (ISO 3166 alpha-2); the merchant's country for a card payment; GB for a domestic leg |
| `newPayee` | bool | the first payment from this payer to this payee |
| `newPayer` | bool | the first credit into this account from this payer: a customer here, a wallet, or a payer at another bank. An established customer's regular payers (pay, pension, invoices, their own wallet) count as seen before the period with the chance their own rate gives. Always false for cash paid in, which has no payer |
| `recentCredentialChange` | bool | the payer changed a password, phone number or email, added a device, or had a SIM swap in the 48 hours before |
| `destSegment` | enum, may be null | the receiving account's segment, where it is an account here<br>`retail`: a personal customer; `sme`: a small firm; `corporate`: a corporate; `private`: a private client |
| `balOrigAfter` | number | the payer's balance after the payment (0 for money from outside) |
| `balDestAfter` | number | the payee's balance after the payment (0 for money leaving) |
| `session` | object, may be null | the session the customer paid from. Set when type is CRYPTO_OUT, or type is TRANSFER and method is fps, chaps or swift, or type is SPEND and method is fps. |
| `payee` | object, may be null | the payee of a push payment. Set when type is TRANSFER, or type is SPEND and method is fps. |
| `card` | object, may be null | the card payment's facts. Set when rail is CARD. |
| `crypto` | object, may be null | the crypto leg's facts. Set when rail is CRYPTO. |
| `patternId` | int, truth | the planted pattern this leg belongs to, or -1 |
| `typology` | enum, may be null, truth | the crime pattern<br>`fan_in`: Fan-in: many senders into one account (money laundering); `fan_out`: Fan-out: one account paying out to many (money laundering); `cycle`: Cycle: money that comes back round (money laundering); `bipartite`: Bipartite: a group paying another group (money laundering); `stack`: Stacked layers: funds passed layer to layer (money laundering); `random`: Random: unstructured transfers inside a ring (money laundering); `scatter_gather`: Scatter then gather (money laundering); `gather_scatter`: Gather then scatter (money laundering); `structuring`: Structuring: cash deposits kept under the GBP 10,000 line (money laundering); `smurfing`: Smurfing: many small cash placements into one account (money laundering); `deposit_send`: Cash in, sent straight on (money laundering); `behaviour_change`: Behaviour change: activity far above the account's own history (money laundering); `single_large`: One very large transfer against the profile (money laundering); `passthrough`: Rapid pass-through: in and out within two days (money laundering); `cash_out`: Cash-out: credits taken out in cash at machines and counters (money laundering); `over_invoicing`: Over-invoicing: a business pays inflated invoices abroad (money laundering); `dormant_reactivation`: A dormant account wakes and passes money through (money laundering); `scam_purchase`: Purchase scam: paying for goods that never arrive (fraud); `scam_investment`: Investment scam: payments into a fake investment, rising over weeks (fraud); `scam_romance`: Romance scam: many payments to someone the victim met online (fraud); `scam_advance_fee`: Advance fee scam: a fee to release a prize, a loan or goods (fraud); `scam_invoice`: Invoice and mandate scam: a supplier's bank details changed by a criminal (fraud); `scam_ceo`: CEO fraud: an urgent payment ordered by someone posing as the boss (fraud); `scam_impersonation_bank`: Impersonation of police or bank staff: money moved to a 'safe account' (fraud); `scam_impersonation_other`: Other impersonation: a fake fine, tax bill or refund (fraud); `ato_credentials`: Account takeover: stolen log-in details used from a new device (fraud); `ato_sim_swap`: Account takeover by SIM swap: the phone number moved to the criminal (fraud); `ato_remote_access`: Account takeover by remote access: the victim's own device controlled from outside (fraud); `card_remote`: Card not present: stolen card details spent online after a test payment (fraud); `card_lost_stolen`: Lost or stolen card: spent in shops and at a cash machine before it is stopped (fraud); `card_counterfeit`: Counterfeit card: a copied card used abroad (fraud); `bust_out`: First-party bust-out: a new account builds a history, then takes everything and stops (fraud); `mule_herd`: Mule network under one controller (mule accounts); `mule_account`: Mule account: receives a fraud's proceeds and passes them on (mule accounts); `offramp_layering`: Crypto sold into the account from illicit wallets, then sent on (crypto); `travel_rule_structuring`: Crypto transfers kept under the GBP 800 information line (crypto); `mixer_exposure`: Payment to a mixing service (crypto); `sanctioned_counterparty`: Transfer to an address on the OFAC sanctions list (sanctions) |
| `family` | enum, may be null, truth | which control owns the pattern<br>`aml`: Money laundering, owned by transaction monitoring; `mule`: Mule accounts, owned by fraud and transaction monitoring together; `fraud`: Fraud, owned by fraud prevention; `crypto`: Crypto, owned by crypto transaction monitoring; `sanctions`: Sanctions, owned by sanctions screening |
| `role` | enum, may be null, truth | what this leg is inside its pattern<br>`placement`: money arriving in a laundering pattern, as cash paid in or as a credit from outside the bank; `funding`: the customer's own money arriving before a payment of a sanctions or fraud pattern, which is no step of the crime; `layering`: money moving between two accounts inside a laundering pattern; `integration`: money leaving a laundering pattern for somewhere outside the bank; `victim-payment`: a push payment a scam victim made to the criminal's account; `account-drain`: a payment out of a taken-over account, made by the criminal; `card-test`: a small payment a criminal makes to check stolen card details work; `card-spend`: a payment or withdrawal on a stolen, lost or copied card; `mule-receipt`: money from a victim or a scheme arriving in a mule account; `mule-forward`: a mule passing money on: to another account, abroad or into crypto; `cash-out`: a mule or launderer taking money out in cash; `collector-forward`: a mule network's collector sending the pooled money on; `first-party-build`: a credit a first-party fraudster pays in to build a history; `first-party-take`: a first-party fraudster taking the balance and the overdraft; `tainted-receipt`: bitcoin from a wallet labelled illicit, sold into the account; `structured-purchase`: a crypto transfer kept just under the GBP 800 information line; `mixer-payment`: a crypto transfer to an address classed as a mixer; `offramp-forward`: crypto proceeds sent on by bank transfer; `sanctions-exposure`: a transfer to an address on the OFAC list |
| `caseId` | int, truth | the case the pattern belongs to (a scam and the mule accounts it paid are one case), or -1 |

### The session a customer paid from (`session`)

| Field | Kind | Meaning |
|---|---|---|
| `channel` | enum | where the customer paid from<br>`mobile`: the mobile app; `online`: online banking; `telephone`: telephone banking; `branch`: a branch |
| `deviceId` | string | the device the session ran on |
| `newDevice` | bool | the device was first seen on this customer within the last seven days |
| `ipCountry` | string | the country the session's IP address resolves to |
| `vpn` | bool | the session came through a VPN or a proxy |
| `remoteAccess` | bool | a remote access tool was running on the device |
| `callActive` | bool | the customer was on a phone call while paying |
| `seconds` | int | seconds from log-in to confirming the payment |

### The payee of a bank payment (`payee`)

| Field | Kind | Meaning |
|---|---|---|
| `cop` | enum, may be null | the Confirmation of Payee result when the payee was set up; null for a payee already paid, a payment abroad or a Direct Debit<br>`match`: the name matched; `close-match`: a close match (the real name was shown), or the account type did not match; `no-match`: the name did not match; `unavailable`: the check could not run |
| `accountType` | enum | the kind of account the payment went to<br>`personal`: a personal account; `business`: a business account |
| `accountAgeDays` | int, may be null | days since the receiving account opened, where the bank can know it |
| `reason` | enum, may be null | the payment reason the customer picked for a new payee<br>`friends-family`: paying friends or family; `goods-services`: paying for goods or services; `bill`: a bill; `own-account`: moving money to my own account; `investment`: an investment; `invoice`: a supplier's invoice; `tax-or-fine`: a tax bill or a fine; `other`: something else |
| `cryptoExchange` | bool | the payee's account belongs to a UK crypto exchange the bank recognises (register S52) |

### A card payment (`card`)

| Field | Kind | Meaning |
|---|---|---|
| `mcc` | int | the merchant category code (ISO 18245) |
| `merchant` | string | the merchant's id, the same across payments to it |
| `threeDS` | enum | 3-D Secure on a card-not-present payment<br>`authenticated`: the cardholder authenticated; `exempt-low-value`: exempt as GBP 25 or less; `exempt-recurring`: a recurring or merchant-initiated payment; `not-attempted`: the merchant did not ask; `not-applicable`: the card was present |
| `declineReason` | enum, may be null | why an authorisation was refused<br>`insufficient-funds`: not enough money; `invalid-details`: the card details were wrong; `card-blocked`: the card was stopped |
| `settledDay` | int | the working day the payment settles; balances move at authorisation |

### A crypto leg (`crypto`)

| Field | Kind | Meaning |
|---|---|---|
| `chain` | enum | the chain the wallet is on<br>`bitcoin`: Bitcoin mainnet |
| `label` | enum | the counterparty wallet's label<br>`illicit`: the wallet pool labels it illicit; `licit`: the wallet pool labels it licit; `unknown`: the wallet pool gives no label, or the wallet is a customer's own; `listed`: the address is on OFAC's list |
| `predicted` | string, may be null | the behaviour class that the wallet pool gives the wallet. The pool file states how its classes were made |
| `confidence` | number, may be null | the confidence that the wallet pool gives that class, 0 to 1 |
| `counterparty` | enum | what the counterparty is<br>`exchange`: another firm's wallet; `self-hosted`: a self-hosted wallet; `service`: a service with no firm behind it (a mixer, a market, a listed address) |
| `travelRule` | enum | the travel-rule exchange (MLR Part 7A)<br>`complete`: the information went with the transfer; `not-required`: below the GBP 800 line, or the customer's own wallet; `requested-received`: the bank asked its customer for it and got it; `requested-not-received`: the bank asked and it never came |
| `ownershipProven` | bool, may be null | for a self-hosted wallet, whether the customer proved they control it |

## Security events

Something that happened on an account that is not a payment.

| Field | Kind | Meaning |
|---|---|---|
| `account` | int | the account |
| `day` | int | the day |
| `minute` | int | the minute |
| `kind` | enum | what happened<br>`device-added`: a new device was registered on the account; `password-reset`: the password was reset; `phone-changed`: the phone number on the account changed; `email-changed`: the email address changed; `sim-swap`: the mobile network reported the number moved to a new SIM; `notifications-off`: payment alerts were switched off; `login-new-location`: a log-in from a place the customer had not logged in from |
| `deviceId` | string, may be null | the device involved |
| `ipCountry` | string | the country the event came from |
| `patternId` | int, truth | the planted pattern the event belongs to, or -1 |
| `typology` | enum, may be null, truth | the crime pattern<br>`fan_in`: Fan-in: many senders into one account (money laundering); `fan_out`: Fan-out: one account paying out to many (money laundering); `cycle`: Cycle: money that comes back round (money laundering); `bipartite`: Bipartite: a group paying another group (money laundering); `stack`: Stacked layers: funds passed layer to layer (money laundering); `random`: Random: unstructured transfers inside a ring (money laundering); `scatter_gather`: Scatter then gather (money laundering); `gather_scatter`: Gather then scatter (money laundering); `structuring`: Structuring: cash deposits kept under the GBP 10,000 line (money laundering); `smurfing`: Smurfing: many small cash placements into one account (money laundering); `deposit_send`: Cash in, sent straight on (money laundering); `behaviour_change`: Behaviour change: activity far above the account's own history (money laundering); `single_large`: One very large transfer against the profile (money laundering); `passthrough`: Rapid pass-through: in and out within two days (money laundering); `cash_out`: Cash-out: credits taken out in cash at machines and counters (money laundering); `over_invoicing`: Over-invoicing: a business pays inflated invoices abroad (money laundering); `dormant_reactivation`: A dormant account wakes and passes money through (money laundering); `scam_purchase`: Purchase scam: paying for goods that never arrive (fraud); `scam_investment`: Investment scam: payments into a fake investment, rising over weeks (fraud); `scam_romance`: Romance scam: many payments to someone the victim met online (fraud); `scam_advance_fee`: Advance fee scam: a fee to release a prize, a loan or goods (fraud); `scam_invoice`: Invoice and mandate scam: a supplier's bank details changed by a criminal (fraud); `scam_ceo`: CEO fraud: an urgent payment ordered by someone posing as the boss (fraud); `scam_impersonation_bank`: Impersonation of police or bank staff: money moved to a 'safe account' (fraud); `scam_impersonation_other`: Other impersonation: a fake fine, tax bill or refund (fraud); `ato_credentials`: Account takeover: stolen log-in details used from a new device (fraud); `ato_sim_swap`: Account takeover by SIM swap: the phone number moved to the criminal (fraud); `ato_remote_access`: Account takeover by remote access: the victim's own device controlled from outside (fraud); `card_remote`: Card not present: stolen card details spent online after a test payment (fraud); `card_lost_stolen`: Lost or stolen card: spent in shops and at a cash machine before it is stopped (fraud); `card_counterfeit`: Counterfeit card: a copied card used abroad (fraud); `bust_out`: First-party bust-out: a new account builds a history, then takes everything and stops (fraud); `mule_herd`: Mule network under one controller (mule accounts); `mule_account`: Mule account: receives a fraud's proceeds and passes them on (mule accounts); `offramp_layering`: Crypto sold into the account from illicit wallets, then sent on (crypto); `travel_rule_structuring`: Crypto transfers kept under the GBP 800 information line (crypto); `mixer_exposure`: Payment to a mixing service (crypto); `sanctioned_counterparty`: Transfer to an address on the OFAC sanctions list (sanctions) |

## Accounts

| Field | Kind | Meaning |
|---|---|---|
| `id` | int | the account's number |
| `customerId` | string | the customer reference, CUST-000001 and on |
| `bank` | string | the bank the account is at, Bank A to F |
| `segment` | enum | who holds the account<br>`retail`: a personal customer; `sme`: a small firm; `corporate`: a corporate; `private`: a private client |
| `tier` | int | the identity-check tier, 1 (lightest) to 3 (full due diligence) |
| `age` | int | age in years for a person, years trading for a firm |
| `income` | number | monthly take-home pay, or monthly turnover for a firm |
| `declaredMonthlyOut` | number | what the customer said at onboarding they would send out a month |
| `country` | string | the customer's home country |
| `openedDay` | int | the day the account opened; negative means before the period |
| `quietDaysBefore` | int | days before day 0 since the account last moved money; above 0 means dormant |
| `initialBalance` | number | the balance at the start |
| `overdraftLimit` | number | the arranged overdraft in pounds; 0 for none |
| `deviceId` | string | the customer's device at the start; mule rings share one |
| `addressId` | string | a household id; people at one address share it |
| `wallet` | string, may be null | the customer's own self-hosted Bitcoin wallet, a made segwit address |
| `pep` | bool | a politically exposed person or a close associate |
| `cashBusiness` | bool | a firm that takes most of its money in cash |
| `channel` | enum | how the customer was taken on<br>`branch`: met in a branch; `digital`: online, without meeting them |
| `hasCard` | bool | holds a card with the bank |
| `isSar` | bool, truth | the account launders money (a launderer, a mule, a collector or a first-party fraudster) |
| `isFraud` | bool, truth | the account is in a fraud or a mule pattern (a victim, a mule or a first-party fraudster) |
| `fraudRole` | enum, may be null, truth | the account's role in fraud<br>`victim`: a victim; `mule`: a mule; `first-party`: a first-party fraudster |
| `patterns` | array, truth | the planted patterns the account is in |
| `daysInBank` | int | days the account has been open at the end of the period (the AMLGentex field) |
| `phoneChanges` | int | phone changes on record at the end of the period (the AMLGentex field) |

## Planted patterns

| Field | Kind | Meaning |
|---|---|---|
| `id` | int, truth | the pattern's number |
| `typology` | enum, truth | the crime pattern<br>`fan_in`: Fan-in: many senders into one account (money laundering); `fan_out`: Fan-out: one account paying out to many (money laundering); `cycle`: Cycle: money that comes back round (money laundering); `bipartite`: Bipartite: a group paying another group (money laundering); `stack`: Stacked layers: funds passed layer to layer (money laundering); `random`: Random: unstructured transfers inside a ring (money laundering); `scatter_gather`: Scatter then gather (money laundering); `gather_scatter`: Gather then scatter (money laundering); `structuring`: Structuring: cash deposits kept under the GBP 10,000 line (money laundering); `smurfing`: Smurfing: many small cash placements into one account (money laundering); `deposit_send`: Cash in, sent straight on (money laundering); `behaviour_change`: Behaviour change: activity far above the account's own history (money laundering); `single_large`: One very large transfer against the profile (money laundering); `passthrough`: Rapid pass-through: in and out within two days (money laundering); `cash_out`: Cash-out: credits taken out in cash at machines and counters (money laundering); `over_invoicing`: Over-invoicing: a business pays inflated invoices abroad (money laundering); `dormant_reactivation`: A dormant account wakes and passes money through (money laundering); `scam_purchase`: Purchase scam: paying for goods that never arrive (fraud); `scam_investment`: Investment scam: payments into a fake investment, rising over weeks (fraud); `scam_romance`: Romance scam: many payments to someone the victim met online (fraud); `scam_advance_fee`: Advance fee scam: a fee to release a prize, a loan or goods (fraud); `scam_invoice`: Invoice and mandate scam: a supplier's bank details changed by a criminal (fraud); `scam_ceo`: CEO fraud: an urgent payment ordered by someone posing as the boss (fraud); `scam_impersonation_bank`: Impersonation of police or bank staff: money moved to a 'safe account' (fraud); `scam_impersonation_other`: Other impersonation: a fake fine, tax bill or refund (fraud); `ato_credentials`: Account takeover: stolen log-in details used from a new device (fraud); `ato_sim_swap`: Account takeover by SIM swap: the phone number moved to the criminal (fraud); `ato_remote_access`: Account takeover by remote access: the victim's own device controlled from outside (fraud); `card_remote`: Card not present: stolen card details spent online after a test payment (fraud); `card_lost_stolen`: Lost or stolen card: spent in shops and at a cash machine before it is stopped (fraud); `card_counterfeit`: Counterfeit card: a copied card used abroad (fraud); `bust_out`: First-party bust-out: a new account builds a history, then takes everything and stops (fraud); `mule_herd`: Mule network under one controller (mule accounts); `mule_account`: Mule account: receives a fraud's proceeds and passes them on (mule accounts); `offramp_layering`: Crypto sold into the account from illicit wallets, then sent on (crypto); `travel_rule_structuring`: Crypto transfers kept under the GBP 800 information line (crypto); `mixer_exposure`: Payment to a mixing service (crypto); `sanctioned_counterparty`: Transfer to an address on the OFAC sanctions list (sanctions) |
| `family` | enum, truth | which control owns it<br>`aml`: Money laundering, owned by transaction monitoring; `mule`: Mule accounts, owned by fraud and transaction monitoring together; `fraud`: Fraud, owned by fraud prevention; `crypto`: Crypto, owned by crypto transaction monitoring; `sanctions`: Sanctions, owned by sanctions screening |
| `caseId` | int, truth | the case it is part of |
| `accounts` | array, truth | the accounts in it |
| `roles` | object, truth | each account's role in it<br>`launderer`: an account a laundering or crypto pattern runs through; `victim`: a customer who lost money to a fraud; never suspicious; `mule`: an account that received a fraud's proceeds and passed them on; `collector`: the account a mule network pools its money into; `first-party`: a customer defrauding the bank with their own account; `exposed`: a customer who paid an address on the sanctions list |
| `main` | int, truth | the account the pattern centres on |
| `startDay` | int, truth | the first day |
| `endDay` | int, truth | the last day |
| `txCount` | int, truth | its transactions |
| `total` | number, truth | their value |
| `story` | string, truth | the phrase a reviewer would use |
| `sources` | array, truth | the entries of the register of sources that the shape comes from |

## Labels

### Families: which control owns a pattern

| Family | Name | The control that owns it |
|---|---|---|
| `aml` | Money laundering | transaction monitoring |
| `mule` | Mule accounts | fraud and transaction monitoring together |
| `fraud` | Fraud | fraud prevention |
| `crypto` | Crypto | crypto transaction monitoring |
| `sanctions` | Sanctions | sanctions screening |

### Crime patterns

| Key | Name | Family |
|---|---|---|
| `fan_in` | Fan-in: many senders into one account | `aml` |
| `fan_out` | Fan-out: one account paying out to many | `aml` |
| `cycle` | Cycle: money that comes back round | `aml` |
| `bipartite` | Bipartite: a group paying another group | `aml` |
| `stack` | Stacked layers: funds passed layer to layer | `aml` |
| `random` | Random: unstructured transfers inside a ring | `aml` |
| `scatter_gather` | Scatter then gather | `aml` |
| `gather_scatter` | Gather then scatter | `aml` |
| `structuring` | Structuring: cash deposits kept under the GBP 10,000 line | `aml` |
| `smurfing` | Smurfing: many small cash placements into one account | `aml` |
| `deposit_send` | Cash in, sent straight on | `aml` |
| `behaviour_change` | Behaviour change: activity far above the account's own history | `aml` |
| `single_large` | One very large transfer against the profile | `aml` |
| `passthrough` | Rapid pass-through: in and out within two days | `aml` |
| `cash_out` | Cash-out: credits taken out in cash at machines and counters | `aml` |
| `over_invoicing` | Over-invoicing: a business pays inflated invoices abroad | `aml` |
| `dormant_reactivation` | A dormant account wakes and passes money through | `aml` |
| `scam_purchase` | Purchase scam: paying for goods that never arrive | `fraud` |
| `scam_investment` | Investment scam: payments into a fake investment, rising over weeks | `fraud` |
| `scam_romance` | Romance scam: many payments to someone the victim met online | `fraud` |
| `scam_advance_fee` | Advance fee scam: a fee to release a prize, a loan or goods | `fraud` |
| `scam_invoice` | Invoice and mandate scam: a supplier's bank details changed by a criminal | `fraud` |
| `scam_ceo` | CEO fraud: an urgent payment ordered by someone posing as the boss | `fraud` |
| `scam_impersonation_bank` | Impersonation of police or bank staff: money moved to a 'safe account' | `fraud` |
| `scam_impersonation_other` | Other impersonation: a fake fine, tax bill or refund | `fraud` |
| `ato_credentials` | Account takeover: stolen log-in details used from a new device | `fraud` |
| `ato_sim_swap` | Account takeover by SIM swap: the phone number moved to the criminal | `fraud` |
| `ato_remote_access` | Account takeover by remote access: the victim's own device controlled from outside | `fraud` |
| `card_remote` | Card not present: stolen card details spent online after a test payment | `fraud` |
| `card_lost_stolen` | Lost or stolen card: spent in shops and at a cash machine before it is stopped | `fraud` |
| `card_counterfeit` | Counterfeit card: a copied card used abroad | `fraud` |
| `bust_out` | First-party bust-out: a new account builds a history, then takes everything and stops | `fraud` |
| `mule_herd` | Mule network under one controller | `mule` |
| `mule_account` | Mule account: receives a fraud's proceeds and passes them on | `mule` |
| `offramp_layering` | Crypto sold into the account from illicit wallets, then sent on | `crypto` |
| `travel_rule_structuring` | Crypto transfers kept under the GBP 800 information line | `crypto` |
| `mixer_exposure` | Payment to a mixing service | `crypto` |
| `sanctioned_counterparty` | Transfer to an address on the OFAC sanctions list | `sanctions` |

### What one leg of a pattern is (`role` on a transaction)

| Role | Meaning |
|---|---|
| `placement` | money arriving in a laundering pattern, as cash paid in or as a credit from outside the bank |
| `funding` | the customer's own money arriving before a payment of a sanctions or fraud pattern, which is no step of the crime |
| `layering` | money moving between two accounts inside a laundering pattern |
| `integration` | money leaving a laundering pattern for somewhere outside the bank |
| `victim-payment` | a push payment a scam victim made to the criminal's account |
| `account-drain` | a payment out of a taken-over account, made by the criminal |
| `card-test` | a small payment a criminal makes to check stolen card details work |
| `card-spend` | a payment or withdrawal on a stolen, lost or copied card |
| `mule-receipt` | money from a victim or a scheme arriving in a mule account |
| `mule-forward` | a mule passing money on: to another account, abroad or into crypto |
| `cash-out` | a mule or launderer taking money out in cash |
| `collector-forward` | a mule network's collector sending the pooled money on |
| `first-party-build` | a credit a first-party fraudster pays in to build a history |
| `first-party-take` | a first-party fraudster taking the balance and the overdraft |
| `tainted-receipt` | bitcoin from a wallet labelled illicit, sold into the account |
| `structured-purchase` | a crypto transfer kept just under the GBP 800 information line |
| `mixer-payment` | a crypto transfer to an address classed as a mixer |
| `offramp-forward` | crypto proceeds sent on by bank transfer |
| `sanctions-exposure` | a transfer to an address on the OFAC list |

### A customer's part in a pattern (`roles` on a pattern)

| Role | Meaning |
|---|---|
| `launderer` | an account a laundering or crypto pattern runs through |
| `victim` | a customer who lost money to a fraud; never suspicious |
| `mule` | an account that received a fraud's proceeds and passed them on |
| `collector` | the account a mule network pools its money into |
| `first-party` | a customer defrauding the bank with their own account |
| `exposed` | a customer who paid an address on the sanctions list |
