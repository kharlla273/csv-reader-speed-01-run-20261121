# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kharlla273/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kharlla273/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` returns exactly csv-reader's
answer `{columns, rows, errors}` for every `{text, header}` input, about 3–4x
faster on the practice set (roughly 0.2 s of CPU against the reference's 0.7 s
for the six practice cases on this machine).

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`)
and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`), one answer per
case, in order.

## How it is fast

The reference reads one character at a time and builds every field a character
at a time. This entry scans instead:

- A record with no quote and no CR on its line is split on commas in one go
  (`String.split`), after one look for the line end.
- Other fields are found with `indexOf` for the next comma, line break, quote
  or CR, and taken as slices; a quoted field is found by its closing quote the
  same way, with doubled quotes and CR/LF handling only when they are present.
- The next-CR and next-LF positions are kept as cursors that only move forward,
  so the total scanning for either stays linear in the text.

Nothing is cached from one case to the next; `run` is pure.

## Correctness

Every rule of csv-reader 1.0.0's broken-row policy is kept: BOM dropped, LF/CRLF
record ends, blank lines are no records, stray CRs dropped with `stray_cr`,
quoted fields with `""` escapes and CR/LF read as LF, junk after a closing quote
(`quote_junk`), unterminated quotes re-read as unquoted (`unterminated_quote`),
and short/long rows padded or cut to the first record's width with their errors
in encounter order. Verified 6/6 on the kit's practice set against its expected
answers, 0 mismatches on 226 hand-built edge cases, and 0 mismatches on 48
fresh cases drawn with the kit's own generator.

---

<sub>Entered on [make.fun](https://make.fun/?ref=n305kcfc&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
