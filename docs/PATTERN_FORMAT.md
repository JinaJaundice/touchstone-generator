# The format of a pattern file

This document sets out the 2 file formats of the pattern library of the generator, and the rules that turn a file into the payments of a case and plant the case in a data set. A part file holds one piece of a method, and a pattern file joins a source part, hiding parts and a cash-out part. The field names, the allowed values and the rules below are the ones that the code implements. A field that this document does not list is an error. The checks are in `web/src/lib/gen/patterns/validate.ts`, the expander is `expand.ts` and the planter is `plant.ts` in the same folder. The pages of the app call a leg a payment, and this document keeps the word leg because it is the word of the field names. `web/scripts/qa-library.ts` compares the expander with one stored case for each pattern under `web/scripts/fixtures/library-golden/`.

## 1. Shared values

| Name | Allowed values |
|---|---|
| Family | `aml`, `mule`, `fraud`, `crypto`, `sanctions` (the type `Family` in `gen/types.ts`) |
| Account role | `launderer`, `victim`, `mule`, `collector`, `first-party`, `exposed` (the type `AccountRole`) |
| Leg role | Any value of the type `LegRole` in `gen/types.ts`. The library adds none |
| Asset | `GBP`, `cash`, `BTC`, `ETH`, `USDT`, `USDC`, `XMR` |
| Chain | `bitcoin`, `ethereum`, `tron` |
| Asset on a chain | One of 5 pairs, written as `BTC@bitcoin`, `ETH@ethereum`, `USDT@ethereum`, `USDT@tron` and `USDC@ethereum` |
| End | `source` or `cash-out`. A pattern has these 2 ends, and its hiding parts are between them |
| Status | `draft`, `tested`, `stable`, `retired` |
| Range | An array `[low, high]` of 2 numbers with `low` at most `high` |
| Wait | An object with exactly one of `minutes`, `hours` or `days`, whose value is a Range |
| Basis | `{ "kind": "reported", "ref": "<source id>", "pages": "<text>", "note": "<text>" }` or `{ "kind": "assumed", "note": "<text>" }`. `pages` is optional. It holds page numbers, or another locator in words for a source without page numbers, such as `paragraphs 3.72 and 5.84`. A `note` is written in sentences of at most 30 words |
| Source id | `S` and 2 digits, which must be an entry of `gen/patterns/references.json` |

A part moves from `draft` to `tested` when it passes every check of `qa-library.ts`, and from `tested` to `stable` when the owner of the repository has read it. The generator plants a part of any status except `retired`.

A privacy coin has no public trail, so a leg in `XMR` has no chain and is recorded off the record.

### 1.1 Limits

A file must keep each count inside these bounds, and the validator rejects a file that does not:

| Value | Bound |
|---|---|
| `count` of a customer party | 1 to 40 |
| `times` of a move | 1 to 20 |
| `through.count` of a chain | 1 to 400 |
| `ways` of a split | 2 to 60 |
| Steps in a part, and parties in a part | 1 to 8 |
| Hiding parts in a pattern | 0 to 6 |
| A wait | 0 to 60 days |
| `per1k` | 0 to 5 |
| Legs of one case | At most 3,000, tested with every count at its upper end |

## 2. Part file, `touchstone-part/1`

One file holds one part. Its path is `web/src/lib/gen/patterns/parts/<id>.json`.

### 2.1 Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema` | text | yes | Fixed: `touchstone-part/1` |
| `id` | text | yes | Lower-case letters, digits and hyphens, 3 to 48 characters, unique among parts |
| `kind` | text | yes | `source`, `hiding` or `cash-out` |
| `title` | text | yes | At most 80 characters. It names the method and no person, firm or group |
| `short` | text | yes | At most 26 characters, for charts |
| `summary` | text | yes | 1 or 2 sentences of at most 30 words each |
| `status` | Status | yes | |
| `family` | Family | see notes | Required where the part has a party of kind `customer`. Not allowed in a hiding part |
| `references` | list | yes | At least 1 entry `{ "id": <source id>, "pages": <text>, "note": <text> }`, where `pages` and `note` are optional |
| `value` | object | source only | See 2.2 |
| `traceClass` | text | source only | The behaviour class that a screening tool reports when it links funds to this source. One of the class names that `classOf` in the generator knows |
| `gives` | list | source only | 1 to 3 assets on a chain, in order of preference |
| `routes` | list | hiding only | At least 1 entry `{ "from": <asset on a chain or "any">, "to": <asset on a chain or "same"> }` |
| `takes` | text or list | cash-out only | `any`, or a list of assets on a chain |
| `entry` | text | hiding and cash-out | The id of the party at which the funds arrive from the part before |
| `exit` | text | source and hiding | The id of the party that holds the funds when the part ends |
| `hides` | object | hiding only | `{ "chance": <number from 0 to 1>, "basis": <Basis> }`. The chance that a wallet screening tool loses the link to the source at this part |
| `parties` | list | yes | See 2.3 |
| `steps` | list | yes | See 2.4. The steps run in the order of the list |

### 2.2 Value of a source part

`value` is `{ "log": <Range>, "capByBalance": <number above 0 and at most 1>, "basis": <Basis> }` or `{ "from": "steps", "basis": <Basis> }`.

- With `log`, the value of a case is drawn evenly in the logarithm between the 2 ends, of which the lower is above 0, and multiplied by the size setting.
- `capByBalance` is optional. Where it is present and the planter supplies what the paying customers hold, the value is at most that share of the sum of their balances and overdrafts on the first day.
- With `from: "steps"`, the value of the case is the sum of the legs of the part that are paid with the sender's own money (2.5).

### 2.3 Party

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | text | yes | Unique in the part. It holds no `.` and no `#` |
| `kind` | text | yes | `customer`, `wallet`, `exchange`, `otc-desk`, `payment-platform`, `mixer`, `bridge`, `dex`, `pool`, `gambling-site`, `market`, `crypto-atm`, `broker`, `merchant`, `swap-service`, `cash` or `outside-account`. `cash` stands for cash in hand, and `outside-account` for an account at another bank |
| `label` | text | yes | A plain description of at most 60 characters, such as "the firm that pays". It names no real person or firm |
| `role` | Account role | customers | The role of the customer in the planted pattern |
| `count` | Range | customers | How many customers fill the party in one case. Default `[1, 1]` |
| `pick` | object | customers | Any of `segments` (list of `retail`, `sme`, `corporate`, `private`), `minAge`, `maxAge` (years), `openedWithinDays`, `hasWallet`, `hasCard`, `cashBusiness` (true or false) and `balance` (`top-quarter`) |
| `chain` | Chain | no | For a party on a chain. Without it the party is on the chain of the first payment with a chain that names it. A party that payments on more than one chain can name, by the files of the pattern, holds no chain |
| `reuse` | text | others | `leg` or `case`. A new party for each leg that names it, or one party for the case. Default `case` |
| `known` | object | wallets | `{ "chance": <0 to 1>, "class": <class name>, "basis": <Basis> }`. The chance that a screening tool already labels the wallet illicit with that class. It applies to a wallet that a customer pays through the bank's crypto service |
| `country` | text | others | `GB`, `ordinary`, `corridor` or `high-risk`. Default `GB`. It sets the country of an outside account |

`pick.balance: "top-quarter"` means the highest quarter, by balance and overdraft on the first day, of the accounts that meet the other needs. `pick.openedWithinDays` counts back from the day on which the case starts.

### 2.4 Step

Every step has these fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | text | yes | Unique in the part. It holds no `.` and no `#`, and `handoff` is reserved |
| `kind` | text | yes | `move`, `chain` or `split` |
| `say` | text | yes | One sentence of at most 30 words, shown in the step list |
| `from`, `to` | text | yes | Party ids |
| `via` | text or list | yes | `fps`, `chaps`, `swift`, `cash-in`, `cash-out`, `card`, `bank-crypto`, `chain` or `off-record`. A list of 2 to 4 of them means that one is drawn evenly for each leg |
| `asset` | text | yes | An Asset, or `in` for the asset that entered the part, or `out` for the asset that the part's route gives |
| `amount` | object | yes | See 2.5 |
| `start` | object | yes | `after`, which is `case`, `entry` or a step id, the optional `per: "leg"`, and the field of one Wait, as in `{ "after": "entry", "hours": [1, 48] }`. See 2.6 |
| `need` | text | yes | `required` or `supporting` |
| `chance` | number | supporting | From 0 to 1. The share of cases in which the step is planted |
| `varies` | text | yes | `stable`, `rotating` or `ephemeral`. It states what changes between cases: nothing, the amounts and the timings, or the parties themselves |
| `legRole` | Leg role | see notes | Required where a `via` of the step is a rail of the bank |
| `facts` | object | no | Facts for a leg in the bank's records: any of `method`, `mcc`, `reason`, `payeeType`, `callActive`, `remoteAccess` and `newDevice`, with the values that `gen/types.ts` allows |
| `basis` | Basis | yes | |

The 3 kinds take these further fields:

- **move.** `times` (Range, default `[1, 1]`), `between` (a Wait between its legs, which is `{ "minutes": [0, 0] }` where it is absent), `split` (`even`, `uneven` or `rising`, default `even`), `pays` (`case` or `own`, default `case`) and `each` (the id of a customer party of the part). With `each` the step runs once for each member of that party, in order, and `from` or `to` that names the party means that member.
- **chain.** `through`, which is `{ "new": <party kind>, "count": <Range> }` or `{ "party": <id of a customer party> }`, and `between`. It may take `peel`, which is `{ "to": <party id>, "share": <Range>, "say": <text>, "via": <via>, "fromHop": <number> }`, where `via` defaults to the step's and `fromHop` defaults to 1. The funds pass from `from` through each hop in turn to `to`. The amount of the step is the sum that leaves `from`, and each hop passes on all that it holds after its peel. Each hop from hop `fromHop` first sends the peel share of what it holds to the peel party, at the minute of the leg that follows. A peel leg carries the `legRole` of the step.
- **split.** `ways` (Range), `over` (a Wait for the whole fan-out) and `gather` (true or false). The funds go from `from` to that number of new wallets in equal parts, spread evenly over the period. With `gather` each wallet then sends what it holds to `to`, after a further wait drawn from `over`. Without `gather` the last wallet is the part's exit and `to` names it.

### 2.5 Amount

| Form | Meaning |
|---|---|
| `{ "of": "value", "share": <Range> }` | A share of the value of the case |
| `{ "of": "held", "share": <Range> }` | A share of the case's funds that the sender holds when the step starts |
| `{ "of": "leg", "share": <Range> }` | A share of the leg that this step follows. Only with `start.per: "leg"` |
| `{ "gbp": <Range> }` | A sum in pounds for each leg, drawn evenly in the range and multiplied by the size setting |
| `{ "under": "cashThreshold" or "travelRuleThreshold", "share": <Range> }` | A share of that setting of the data set for each leg |

A step whose `pays` is `own` moves money that the sender brings to the case, such as a victim's payment, and raises the funds of the case. A step whose `pays` is `case` moves funds that the sender already holds in the case, and its amount is at most what the sender holds. `of: "value"` is allowed only with `pays: "own"`, and `of: "held"` and `of: "leg"` only with `pays: "case"`.

Where a step has more than one leg and its amount is a share, the share is the total of the legs and `split` divides it. `even` gives equal parts. `uneven` gives each leg a weight drawn evenly from 0.5 to 1.5. `rising` gives the legs the weights 1, 2, 3 and so on. What a service keeps as its fee is the share that its outward step does not move.

### 2.6 Timing

- `after: "case"` counts from the start of the case, `after: "entry"` from the arrival of the funds at the `entry` party of the use, and `after: <step id>` from the last leg of that step of the same use.
- With `per: "leg"` the step runs once for each leg of the named step, and each run counts from that leg. Where the named step runs for each member of a customer party, the run keeps that member.
- The expander divides every wait by the speed setting and rounds it to a whole minute, with a least value of 1 minute for a wait whose range reaches above 0.

## 3. Pattern file, `touchstone-pattern/1`

One file holds one pattern. Its path is `web/src/lib/gen/patterns/library/<id>.json`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema` | text | yes | Fixed: `touchstone-pattern/1` |
| `id` | text | yes | As for a part, unique among patterns |
| `title`, `short`, `summary`, `status` | | yes | As for a part |
| `parts` | object | yes | `{ "source": <part id>, "hiding": [<part id>, ...], "cashOut": <part id> }` |
| `bankSees` | text | yes | `source`, `cash-out` or `both`. The end or ends at which the customers are customers of the generated bank by default |
| `per1k` | number | yes | Cases for each 1,000 accounts by default |
| `value` | object | no | `{ "log": <Range>, "basis": <Basis> }`. The size of the slice of the proceeds that one case of the pattern follows. It replaces the `log` range of the source part |
| `references` | list | yes | As for a part. The case that a source describes is cited here and never named in a title |

A pattern may name a hiding part more than once. Each place of a part in the order of the pattern is a use. The id of the first use of a part is the id of the part. The id of a later use is the id of the part, the character `~` and the number of the use, such as `mixer~2`. Each use has parties of its own. Where a rule of section 2, 5 or 6 speaks of the part of a step, a party, an asset or a wait in a case, it means that use.

Where both ends of a pattern have customers, its `short` has at most 15 characters, because the short name of each of its 2 keys adds ` (source)` or ` (cash-out)` and has at most 26.

A pattern's end can be seen by the bank only where the part at that end has a party of kind `customer`. The values of `bankSees` that a pattern can take are therefore `source`, `cash-out` and `both` where both ends have customers, and the one end that has customers otherwise.

A source part without a customer, such as a theft from an exchange, sets a wide range for one slice of the proceeds. A pattern gives `value` where its cash-out part suits a smaller sum, such as a chain of personal accounts. `value` is allowed only where the source part has no party of kind `customer` and a `log` value without `capByBalance`, because the value of any other source is what its customers pay.

## 4. Checks on a file

The validator `gen/patterns/validate.ts` returns a list of errors, and each error names the file's id and the field. A file with an error is not loaded. The 13 checks are:

1. Every field has its type and an allowed value, and no other field is present.
2. Every party id, step id and part id that a field names exists, and a step that another step follows comes before it in the list.
3. A step whose `via` includes `bank-crypto` has the asset written as `BTC`, and one end of it is a customer. A step or a peel whose `via` includes `card` is sent by a customer party whose `pick` holds `hasCard: true`.
4. A hiding part has no party of kind `customer` and no `via` that is a rail of the bank.
5. Every `legRole` and every value under `facts` is one that `gen/types.ts` allows.
6. Every source id is an entry of `gen/patterns/references.json`.
7. Each text is within its limit of length, and each count is within the limits of 1.1.
8. In a pattern, the assets join. The expander takes the first asset of the source's `gives` for which each hiding part has a route in turn and the cash-out part accepts the result.
9. In a pattern, each end that `bankSees` names has at least one party of kind `customer`, and `value` is present only where section 3 allows it.
10. In a pattern, a case has at most 3,000 legs where every count is at its upper end, every supporting step is planted and every customer party has its greatest number of members.
11. No party of the kind `wallet` can be named by payments on more than one chain. The chains follow from the files alone: the assets of each use, the ways of each step and of each peel, and the hand-off into each use.
12. No payment can name, on another chain, a party whose file names a chain.
13. No step whose `via` includes `bank-crypto` names a party, other than the customer, that payments on more than one chain can name.

A party whose `reuse` is `leg` is outside checks 11 and 13, because each payment gives it a party of its own with one chain. Check 12 still tests its file chain against each payment chain.

## 5. From a file to the legs of a case

The expander `gen/patterns/expand.ts` has 3 pure functions on the path of the planter, and a fourth, `typicalCase`, that makes the typical case that the page of a pattern shows. None reads a data set.

- `drawPlan(pattern, parts, settings, r)` makes every random draw of one case and returns a plan. `settings` is `{ size, speed, bankSees, cashThreshold, travelRuleThreshold }`. `size` and `speed` are numbers from 0.25 to 4, the 2 thresholds are the settings of the data set that an `under` amount names, and `r` is a random number generator of `lib/rng.ts`.
- `price(plan, facts, fixed)` turns a plan into the value of the case, its parties and its legs. `facts` may give what the members of a customer party hold on the first day, in the form `{ "<part id>.<party id>": [numbers] }`. `fixed` may give the written amount of some legs. Both are optional, and the function makes no draw.
- `expandCase(pattern, parts, settings, r, facts)` returns `price(drawPlan(pattern, parts, settings, r), facts)`.

### 5.1 The plan

`drawPlan` follows these 7 rules:

1. It resolves the asset at each join by check 8.
2. It draws a number from 0 to 1 for the value of the case, and the count of each customer party.
3. It walks the parts in order: the source part, each hiding part and the cash-out part. For each step it first decides whether a supporting step is planted. It then draws the number of legs, the wait before the first leg, the waits between legs, the share or the sum of each leg and the weights of the split.
4. Between 2 parts it adds one leg with the step id `handoff`, which belongs to the later use. The leg moves all the funds that the `exit` party of the earlier use holds to the `entry` party of the later use on a chain, 1 to 30 minutes after the last leg of the earlier use, with the sentence "The funds move to" and the label of the entry party.
5. It gives each party the key `<use id>.<party id>`. The key of a customer ends with `#` and the number of the member from 1, and a step that names a customer party without `each` means its first member. The key of a party whose `reuse` is `leg` ends with `#` and a running number. The new wallets of a chain or a split have the key `<use id>.<step id>`, `#` and a number.
6. It marks each leg as seen by the bank, by a chain or by no one. A leg is seen by the bank where its `via` is a rail of the bank and one of its ends is a customer on an end that `settings.bankSees` names. A leg whose `via` is `chain`, and whose asset is not `XMR`, is seen by a chain. Every other leg is seen by no one. On an end that the bank does not see, a customer party has the kind `outside-account`.
7. It gives each leg a running number in the order of its time, the id of its use and the id of its step.

The expander makes its draws in a fixed order, which the header of `expand.ts` states.

### 5.2 The price

`price` walks the legs in order of time and keeps the funds of the case that each party holds. It follows these 6 rules:

1. The value of the case is the drawn number mapped into the range of the pattern's `value.log`, or of the source part's `value.log` where the pattern gives none. It is multiplied by `size` and then capped by `capByBalance` where `facts` gives what the paying customers hold. With `value.from: "steps"` it is the sum of the legs that are paid with the sender's own money.
2. A leg with `pays: "own"` raises the funds of its receiver. A leg with `pays: "case"` lowers the funds of its sender and raises the funds of its receiver, and its amount is at most what the sender holds.
3. Where `fixed` gives the amount of a leg, the leg takes that amount, which is still at most what the sender holds, and an amount of 0 means that the leg did not happen.
4. An amount is rounded to the penny. A leg below 1 penny is left out, and the numbers of the other legs do not change. Because each amount is rounded, a leg of a case that is priced again can differ by 1 penny from its amount in the first price.
5. At the end of the case the funds that the parties hold add up to the funds that were raised, and the funds that were raised equal the value of the case, each within 1 penny for each leg.
6. A leg with `pays: "own"` that a customer sends is at most 90% of what that customer held on the first day, less the planned amounts of the customer's earlier legs of that kind in the case. A written amount does not change that budget. The rule applies where `facts` gives what the customer held, and 90% is the share to which the generator cuts a payment that an account cannot make in full. With `value.from: "steps"` the value of the case is what those legs moved.

## 6. Planting

The planter `gen/patterns/plant.ts` places the cases of the library patterns that are switched on. It follows these 13 rules:

1. It takes the patterns in the order of their ids. For each pattern it sets the generator's stream to `mulberry32(streamSeed(seed, period, "lib:" + id))` for every draw of that pattern, in every period, and it restores the stream that the generator held when it ends.
2. Before the first pattern it records which accounts a built-in pattern holds.
3. A pattern with a rate above 0 plants `Math.max(1, Math.round(per1k * accounts / 1000))` cases.
4. For each case it calls `drawPlan`, and it draws the first day of the case evenly so that the case ends inside the period where its length allows. The case starts at a minute drawn evenly from 09:00 to 19:00. Each payment follows at the waits of its step, so the first payment of a case can fall later. It then looks at the rail of each leg that the bank would see. The bank offers no cash at a counter where `products.cashServices` is `none`, no payment abroad where `products.international` is off, and no crypto service where `cryptoActiveShare` is 0. A leg on a rail that the bank does not offer takes the first rail of its step's `via` list that the bank offers. Where the step lists none, a supporting step is left out of the case. A required step without a rail means that the case is not planted, and the data set records the pattern, the reason `no-rail` and the rail.
5. On each end that the bank sees, it fills each member of each customer party with an account that was open on the first day of the case and meets `pick`. It leaves out an account that the pattern or the case already uses. It leaves out an account that a built-in pattern holds unless a draw is below `multiPatternShare`. It draws one of the remaining accounts evenly. An account that another library pattern uses is not left out. Where no account remains, the case is not planted, and the data set records the pattern, the reason `no-account`, the party and the need. The need is a sentence made from `pick` with the words of section 6.1.
6. It calls `price` with what each chosen customer holds on the first day of the data set, which is the balance and the arranged overdraft.
7. It makes one planted pattern for each end that the bank sees, through the existing `World.newPattern`. Its key is `lib.<pattern id>.<end>`, its family is the family of the part of the use at that end, its accounts and their roles are those of that end, its phrase is the title of the pattern and its sources are the source ids of the pattern and of that part. Where the bank sees both ends, the 2 planted patterns share one case number. The main account of a planted pattern is the first member of the first customer party of its end. Its first day and its last day are the days of the first and the last leg of the case that names a customer of its end.
8. It schedules each leg that the bank sees through `World.schedule`, in order of time, with the transaction that section 7 gives and the amount of the first price. A leg never tops an account up: it is scheduled so that `World.emit` pays it from what the account holds and its arranged overdraft, and may reduce or refuse it. The planter sets the method of a leg when it schedules it, from the amount of the first price. Where the rail moves a leg to a later slot, each later leg of the case that would come before that slot moves to it, so that the legs of a case are written in their order. No other leg moves. Where a counter is closed at the time of a cash leg, the planter asks for the counter's next opening, so that no leg moves before the leg that it follows. A leg whose time is after the last day did not happen, whether the bank would see it or not: it is not scheduled, and its amount is 0.
9. While the days run, `World.emit` tells the planter each time it has written or refused a leg of a case. The planter then calls `price` again with the amount of each leg written so far, and with 0 for each leg that was refused or not scheduled. It sets the amount of every leg of the case that still waits to its new price. A leg that the first price left out remains out in every later price. A leg therefore moves at most what the case holds when it is written, and a leg whose new price is below 1 penny is not written.
10. A wallet that pays the bank's crypto service at the cash-out end carries the label "illicit", the source part's `traceClass` and a confidence drawn evenly from 0.80 to 0.99, unless a draw is below the chance that the trail was lost, in which case it carries the label "unknown". That chance is 1 less the product of `1 - hides.chance` over the uses of the hiding parts. A wallet with `known` that a customer pays carries the label "illicit" and its class where a draw is below `known.chance`, and the label "unknown" otherwise.
11. A party that holds a chain receives a generated address in the format of that chain: a segwit address on Bitcoin, `0x` and 40 lower-case hexadecimal digits on Ethereum, and a Base58Check address with the first byte `0x41` on Tron. On a transaction by Faster Payments, CHAPS or SWIFT, the reference of an exchange is `VASP-` and a digit from 0 to 7, which is the form that the generator already uses, and the reference of any other outside party is `LIB-` and 8 hexadecimal digits drawn for that party. A transaction of the bank's crypto service carries the address of the wallet in that field, as section 7 says.
12. Before it plants a case, it stops the pattern where the rows of the pattern's case legs and the legs of the plan of the new case would pass 20,000. A case can write fewer rows than its plan has legs, so a pattern can stop shortly before the cap. The data set records that the pattern reached the cap.
13. After the days have run, it settles each case and writes its rows. Every leg of the first price has a row, which keeps the planned amount. The amount of a row is the amount of its transaction for a leg that the bank wrote, the last price for a leg outside the bank's records, and 0 for a leg that did not happen. A row that the bank wrote takes the day and the minute of its transaction. A case is marked as reduced where a transaction was written for less than its planned amount, and as cut short where a required step of a use has no leg that happened. Where the bank refused a payment of a step whose other payments happened, that payment marks the case as neither. The row of that payment keeps its planned amount, shows an amount of 0 and holds no transaction id. The amount of a leg can be above its planned amount where an earlier leg of the same sender moved less than planned. The first day and the last day of each planted pattern are set again from its transactions. A party row names the account that fills the party. Where the planted pattern of the party's end was removed because it wrote no transaction, the row names no account. A case whose planted patterns wrote no transaction is removed with its parties and its rows, and the data set records the pattern and the reason `no-transaction`.

### 6.1 The sentence of a need

The sentence starts with the kind of customer and adds a phrase for each other need, in the order of the table. 2 or more segments are joined with "or".

| `pick` | Words |
|---|---|
| `segments` | "a personal customer" for `retail`, "a small firm" for `sme`, "a corporate" for `corporate`, "a private client" for `private`. Without `segments` the sentence starts with "a customer" |
| `minAge`, `maxAge` | "aged 60 or over", "aged 30 or under" |
| `openedWithinDays` | "with an account opened in the 365 days before the case" |
| `hasWallet` | "with a linked wallet" |
| `hasCard` | "with a card" |
| `cashBusiness` | "that takes most of its money in cash" |
| `balance` | "among the quarter that holds the most" |

For example, the need of a shell company is "a small firm with an account opened in the 365 days before the case".

### 6.2 The record of the planter

Rules 4, 5, 12 and 13 name what the data set records. The data set holds it in the field `library`, in the shape of `LibraryRecord` in `web/src/lib/gen/types.ts`. The field is absent where no library pattern was on. It holds:

- `version`, the library version of the run.
- `cases`, one entry for each case that remains, with its case number, pattern, the ends that the bank sees, its value in the first price, its first and last day, whether it is reduced, whether it is cut short, the number of its legs in the bank's records and the number of those that were written in full.
- `skipped`, one entry for each pattern and reason, with the party and the need, and the number of cases that it covers. The reason is `no-account`, `no-rail` or `no-transaction`. For `no-rail` the field `need` holds the rail.
- `capped`, the ids of the patterns that reached the cap of rule 12.

The summary of the data set repeats 4 counts of the record: `cases`, `legs` (the rows of the case legs), `skipped` and `capped`.

### 6.3 The settings of a pattern

A user sets, for each pattern, whether it is on, its rate, its size, its speed and the end that the bank sees. The switch and the rate are in the panel "Library patterns" and on the page of the pattern, and the size, the speed and the end are on that page. `normaliseLibrary` in `web/src/lib/gen/config.ts` brings each setting into range:

- A rate runs from 0 to 5, and a size and a speed run from 0.25 to 4. A value outside those limits becomes the nearest limit.
- A size or a speed that is no number takes 1, and a rate that is no number takes the pattern's own rate.
- A value of `bankSees` that the pattern does not allow takes the pattern's own value.
- A pattern that is switched off, or whose rate is 0, plants no case.

## 7. Legs in the bank's records

| `via` | From a customer to an outside party | From an outside party to a customer | Between 2 customers |
|---|---|---|---|
| `fps` | `TRANSFER` to outside by Faster Payment, or by CHAPS where the amount is above the sender's Faster Payments limit | `INCOME` from outside by Faster Payment, with the party's reference, or by CHAPS where the amount is above the scheme limit of GBP 1,000,000 in `gen/sources.json` | `TRANSFER`, by the same rule |
| `chaps` | `TRANSFER` to outside by CHAPS | `INCOME` from outside | `TRANSFER` by CHAPS |
| `swift` | `TRANSFER` to outside by SWIFT, with a country from the party's `country` | `INCOME` from outside by SWIFT | not allowed |
| `cash-in` | not allowed | `CASH_IN` at a counter, or at a partner's counter where `products.cashServices` is `partner` | not allowed |
| `cash-out` | `CASH_OUT` at a counter, by the same rule | not allowed | not allowed |
| `card` | `SPEND` with the method and the merchant category code under `facts`, or with the generator's own choice of each where `facts` gives none | not allowed | not allowed |
| `bank-crypto` | `CRYPTO_OUT` to the party's address | `CRYPTO_IN` from the party's address | not allowed |

Each transaction carries the planted pattern of its end, the step's `legRole`, the case number and the facts under `facts`. On a `bank-crypto` leg the transaction's `wallet` and `cpRef` are the generated address of the party. Its wallet class is `classOf` of the predicted class where rule 10 gives the party the label "illicit", and "unknown" otherwise. The counterparty is "exchange" for a party of kind `exchange`, "self-hosted" for a party of kind `wallet` and "service" for any other kind. The travel-rule value is "complete" for an exchange and "not-required" otherwise, and the proof of ownership is false for a wallet and empty otherwise.

## 8. Rows of the answer key

The planter writes one row for each party and one row for each planned leg of each planted case. The rows of a case do not depend on which other library patterns are switched on, apart from `caseId`, `amount` and `tx`, and apart from the `account` of a party whose planted pattern was removed.

| Table | Field | Type | Meaning |
|---|---|---|---|
| `parties` | `caseId` | number | The case number |
| | `key` | text | The party's key in the case (5.1, rule 5) |
| | `group` | text | The key without `#` and its number, which the flow view uses to draw a run of wallets as one column |
| | `pattern`, `part` | text | The ids of the library pattern and of the use of the part |
| | `end` | text | One of `source`, `hiding` or `cash-out` |
| | `kind` | text | The party's kind, or `outside-account` for a customer on an end that the bank does not see |
| | `label` | text | The party's label from the file |
| | `account` | number or null | The account that fills the party, where the bank sees its end and the planted pattern of that end remains |
| | `chain` | text or null | The chain of a party that holds one. Empty for a party off every chain and for a service that payments on more than one chain can name |
| | `address` | text or null | The generated address of a party that holds a chain |
| `caseLegs` | `caseId`, `seq` | number | The case number and the leg's number in the case |
| | `pattern`, `part`, `step` | text | The ids of the library pattern, of the use of the part and of the step |
| | `day`, `minute` | number | When the leg happens, in the data set's days and minutes |
| | `from`, `to` | text | The keys of the 2 parties |
| | `via` | text | The rail, `chain` or `off-record` |
| | `asset` | text | The asset that moves |
| | `chain` | text or null | The chain of a leg on a chain |
| | `planned` | number | The amount of the leg in the first price, in pounds, before any transaction was written |
| | `amount` | number | The amount that moved, in pounds, or 0 where the leg did not happen |
| | `seenBy` | text | One of `bank`, `chain` or `none` |
| | `tx` | number or null | The id of the transaction, where the bank wrote the leg |
| | `say` | text | The step's sentence |

`caseLegsCsv` and `partiesCsv` in `web/src/lib/gen/csv.ts` write the 2 tables as CSV files, with one column for each field above in the order of the table. Neither table has a Parquet file. The Make data page offers the files as "Case payments" and "Parties" where the data set holds library cases. The payments outside the bank's records belong to planted cases only, and they are no record of a whole chain.
