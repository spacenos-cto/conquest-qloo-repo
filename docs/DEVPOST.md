# Rehearsal — a focus group of a thousand, in thirty seconds

**Name an audience and something to test — a joke, a sponsor read, a trailer, a
poster, a menu. Rehearsal samples a thousand synthetic respondents from Qloo's
taste graph, lets them react, and returns the vote, the split by city and age,
the reasons, and a receipt for every number. It refuses to simulate audiences
Qloo can't see.**

## Inspiration

Every focus group costs tens of thousands of dollars and three weeks, so almost
nobody runs one. The rest of us ship blind and find out from the real audience,
late. Synthetic focus groups exist, but they're built on ungrounded LLM personas
that all sound the same — ask a thousand of them and you get one bland opinion.
The missing ingredient is *taste*: a model of what different audiences actually
love, across music, film, food, places and brands. That's Qloo. Gartner now
classes Qloo under "synthetic popular simulation"; this is that, as a product.

## What it does

1. **Audience.** Type "Cedric the Entertainer", "This Week in Startups", a team,
   a podcast. Qloo builds a fingerprint — demographics, taste tags, the metros
   they're in, the artists/shows/brands/podcasts/films they love — each tile with
   a receipt. Thin coverage → it refuses: "Rehearsal doesn't guess."
2. **Panel.** 1,000 personas are sampled **in code** from those distributions —
   metro from `where_popular`, age/gender from the demographic over-index, tastes
   rank-weighted from the tag and entity lists. No model touches this step; every
   trait carries the Qloo call it came from.
3. **Rehearse.** A stimulus runs through the panel. You get the mean score, the
   split by city and age (Cedric's church bit: **Atlanta 4.3 vs Seattle 2.9**),
   the reasons clustered, six quotes tagged to personas, and verdict cards. The
   narrative is claim-checked — any number without a computed fact is struck.
4. **Without Qloo.** The same stimulus through ungrounded personas: they collapse
   to one opinion (city variance 0.003 vs 0.084, one reason vs five). Taste is
   where the disagreement lives.
5. **Proof.** A frozen-method backtest: how well Qloo-grounded vs flat LLM-only
   panels track real demographic splits (Pearson r), with the misses published.
6. **Receipts.** Every Qloo call behind the run, in order.

Plus a **brain layer**: a TRIBE v2 perception strip (predicted attention/response
over a stimulus) beside the taste panel — two receipts per recommendation, one
for *did a brain respond* and one for *does this audience like it*. Agree → ship.
Disagree → that's the finding.

## How Qloo is used

Every call goes through the official harness and is logged to an evidence ledger.
`describe` resolves the audience; `audience_demographics`, `entity_tags`,
`where_popular`, `recommend` (five domains) and `trends` build the fingerprint
that the persona sampler draws from. The Receipts screen and an agent-facing MCP
server (`fingerprint_audience`, `rehearse`, `compare_without_qloo`, `backtest`)
expose it all.

## Why it beats an LLM alone

- **Ablation (in product):** ungrounded personas collapse — near-zero city
  variance, one bland reason. Grounded ones disagree the way real cities do.
- **Backtest (frozen method):** Qloo-grounded panels track reference demographic
  splits far better than flat LLM-only guesses. *(The shipped figure uses sample
  data + a stand-in grounded model; the harness is real — swap in real YouGov and
  live Qloo to cite.)*

## How we built it

TypeScript, Node, no framework. One Qloo gateway (mock + live harness backends,
cache, bounded retry, ledger). A seeded persona sampler. A respondent runner
(mock heuristic, plus a live Claude Haiku backend). Aggregation, a claim checker,
the ablation and backtest harnesses, a TRIBE strip, an HTTP server + single-page
UI, and an MCP server. 12 tests, typecheck clean.

## What's next

Real Qloo key (mock → live is one env var); live Haiku respondents; the real
TRIBE v2 GPU service; a 500-brand backtest against real YouGov; `compare_audiences`
for a second, independent city-split receipt.

## Limitations (honest)

Synthetic respondents are samples from aggregate affinities — not people, never
an individual claim, not a sales forecast. TRIBE v2 is a generic brain model,
CC BY-NC 4.0, research use — predicted response, not memorability. The backtest
reference is sample data until real YouGov is wired. No PII is ever sent to Qloo.

## Try it

`npm install && npm run serve` → http://localhost:5173 ·
code: this repo (MIT) · `npm run backtest`, `npm run rehearse "<audience>"`.
