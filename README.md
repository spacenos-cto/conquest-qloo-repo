# Rehearsal

**A focus group of a thousand, in thirty seconds. Grounded in Qloo.**

Name an audience — a show, a team, a podcast, a person — and something to test:
a joke, a sponsor read, a trailer, a poster. Rehearsal samples a thousand
synthetic respondents from Qloo's taste graph (every trait carries a receipt),
lets them react, and returns the vote, the split by city and age, and why. It
refuses to simulate audiences Qloo can't see.

Built for the Qloo Agentic Hackathon.

## Status — complete (mock mode)

The whole product runs end to end in **mock mode** (no keys needed): resolve →
fingerprint (per-trait receipts) → refuse thin coverage → 1,000 personas sampled
in code → run the panel → aggregate (vote, city/age/gender splits, reasons,
quotes) → claim-check → Without-Qloo ablation → frozen-method backtest → TRIBE
perception strip + verdict cards. Served as a clickable web app and an MCP server.

Three swap points, each one env var:
- `QLOO_MODE=live` — real Qloo via the harness (needs the event key).
- `REHEARSAL_RESPONDENT_MODE=live` — real Claude Haiku respondents (needs
  `ANTHROPIC_API_KEY`; one call per persona, so it costs credits).
- TRIBE strip is a labelled stub (CC BY-NC) → wire the GPU service for the real one.

## Run it

```bash
npm install
npm run serve                                    # the web app → http://localhost:5173
npm run mcp                                       # the MCP server (stdio)
npm run rehearse "Cedric the Entertainer"        # CLI: the church bit
npm run rehearse "Los Angeles Dodgers"           # promo poster
npm run ablation "This Week in Startups"         # the Without-Qloo comparison
npm run backtest                                  # the proof harness
npm run fingerprint "some unknown band"          # the coverage refusal
npm run backtest-youtube                          # real-world backtest (free YouTube key)
npm run trends-check -- "Cedric the Entertainer" geoMap.csv   # Google Trends metro check
npm test                                          # 20 tests
```

## Real-world proof (free data only)

**YouTube backtest.** For each judge audience, Rehearsal takes the audience's
own channel, picks its 12 most recent settled uploads (≥14 days old, no
Shorts), and has the panel score each one from its title and description.
Those predictions are **sealed with a hash before any view, like or comment is
fetched**, then scored against real likes per 1,000 views (Spearman ρ with a
permutation p-value). It also counts **taste echoes**: real comments that name
one of the audience's Qloo neighbours (an artist, show or brand the video never
mentioned), against a control audience's neighbours. Fewer than 4 videos that
name a Qloo taste → it refuses to score, same as the coverage rule.

```bash
# free key: Google Cloud Console → enable "YouTube Data API v3" → Credentials → API key
$env:YOUTUBE_API_KEY = "<key>"      # PowerShell; bash: export YOUTUBE_API_KEY=<key>
npm run backtest-youtube            # ~350 of the 10,000 free daily units
npm run backtest-youtube -- "Cedric" @SomeHandle   # pin a channel after checking the one it found
```

Results go to `data/backtest-youtube.json` (committed: numbers and titles only,
no comment text or commenter names). Sealed predictions go to
`data/youtube/sealed/`. Raw API responses stay in `data/youtube/raw/`
(gitignored; YouTube's terms say to refresh or delete within 30 days, so rerun
with `--fresh`). The web app's Proof scene reads the saved result. The server
never spends quota.

**Google Trends metro check.** On trends.google.com, search the audience, set
United States → Interest by subregion → **Metro**, and download the CSV. Then
`npm run trends-check -- "<audience>" <file.csv>` compares the metro ranking
with Qloo's `where_popular` (Spearman ρ, top-5 overlap, biggest gaps). No
scraping, no key.

## Deploy (to satisfy "hosted externally")

Any Node host runs `npm run serve` (binds `PORT`). On Render/Railway: build
`npm install`, start `npm run serve`. The browser never calls Qloo directly —
all Qloo calls stay server-side behind the harness.

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
