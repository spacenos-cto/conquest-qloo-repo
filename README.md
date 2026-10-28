# Rehearsal

**A focus group of a thousand, in thirty seconds. Grounded in Qloo.**

Name an audience — a show, a team, a podcast, a person — and something to test:
a joke, a sponsor read, a trailer, a poster. Rehearsal samples a thousand
synthetic respondents from Qloo's taste graph (every trait carries a receipt),
lets them react, and returns the vote, the split by city and age, and why. It
refuses to simulate audiences Qloo can't see.

Built for the Qloo Agentic Hackathon.

## Status — Day 1

The Qloo pipeline works end to end in **mock mode** (no API key needed yet):
resolve a name → build the audience fingerprint → enforce the coverage refusal →
log every call to an evidence ledger.

Swap mock → live with one env var once the event API key arrives.

## Run it

```bash
npm install
npm run fingerprint "Cedric the Entertainer"     # strong coverage
npm run fingerprint "This Week in Startups"       # JCal's show
npm run fingerprint "Los Angeles Dodgers"         # Boehly's team
npm run fingerprint "some unknown band"           # the coverage refusal
npm test
```

## Going live (when the Qloo key arrives)

The key takes about one business day. Do **not** put it in a file.

```bash
npm install --global @qloo/qloo-harness
qloo setup --qloo       # paste the event key at the hidden prompt
qloo setup --status     # expect: "Qloo data: ready"
```

Then set `QLOO_MODE=live` (see `.env.example`). The gateway shells out to
`qloo exec <workflow>`; nothing else changes. Confirm one workflow's JSON shape
and adjust the parse points flagged in `src/qloo/fingerprint.ts` if the live
envelope differs from the mock.

## Layout

```
src/
  qloo/
    types.ts         envelope + fingerprint types (zod)
    gateway.ts       one gateway: cache, bounded retry, ledger logging
    mock.ts          mock backend — kit-shaped envelopes, three judge cases
    live.ts          live backend — shells out to the qloo harness
    resolve.ts       name -> entity, confirm chips on ambiguity
    fingerprint.ts   the ~40 calls + the coverage refusal rule
  ledger/
    ledger.ts        SQLite evidence ledger + private response cache
  cli.ts             day-1 end-to-end runner
tests/               coverage + caching tests
docs/BUILD-SPEC.md   the full plan (Qloo + TRIBE layers, screens, build order)
```

## Rules we hold (from the Qloo kit)

- Only aggregate Qloo affinities. No names, emails or IDs ever sent to Qloo.
- Results describe what groups tend to like — never an individual or a forecast.
- Qloo responses cached privately; **never** committed to this repo.
- Every number has a receipt (a ledger row → the Qloo call behind it).
- Thin coverage → refuse, don't guess.

MIT licensed. TRIBE v2 (a later layer) is Meta FAIR's, CC BY-NC 4.0, research use.
