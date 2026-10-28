# Rehearsal — Submission

Following the Qloo kit's submission guide (`docs/SUBMISSION.md` in the kit).

## 1. Product problem statement

Every creative decision — a joke, a sponsor read, a trailer, a promo poster, a
menu — is made blind and tested on the real audience, late and expensively. A
real focus group costs tens of thousands of dollars and weeks. Rehearsal is a
focus group of a thousand in thirty seconds: name an audience and something to
test, and a panel sampled from Qloo's taste graph reacts, with the vote split by
city and age, the reasons, and receipts for every number. It refuses to simulate
audiences Qloo can't see.

## 2. Qloo workflows / MCP tools used, and why

All live Qloo calls go through the official harness (`qloo exec` / `qloo mcp`).

| Workflow / tool | Why Rehearsal needs it |
|---|---|
| `describe` / `find_tags` | resolve the audience to a Qloo entity; confirm chips on `needs_input` |
| `audience_demographics` | age × gender over-index → how personas are drawn by age/gender |
| `entity_tags` | the taste tags each persona samples from |
| `where_popular` | metro weights → where the 1,000 personas live |
| `recommend` (×5 domains) | the artists / shows / brands / podcasts / films personas hold |
| `trends` | momentum (reported as "not measured" on a flat window, never guessed) |

Each call is logged to an evidence ledger; the Receipts screen shows the call
behind every part of the fingerprint. The agent-facing MCP server exposes
`fingerprint_audience`, `rehearse`, `compare_without_qloo`, `backtest`.

## 3. Redacted request → result walkthrough (one audience)

Audience: **Cedric the Entertainer** (entity resolved via `describe`).

1. `describe { name: "Cedric the Entertainer" }` → one entity (a `person`). No
   ambiguity, so no confirm chip. → receipt **E1**.
2. `audience_demographics { entity }` → over-index +0.41 for 30–44, +0.31 male. → **E2**.
3. `entity_tags { entity }` → 23 tags; "Church humor", "Soul food", "Southern
   culture" rank high. Rank matters (affinities cluster near 1.0). → **E3**.
4. `where_popular { entity, within: "United States" }` → Atlanta 0.96, Chicago
   0.91, …, Seattle 0.14. These become the metro sampling weights. → **E4**.
5. `recommend { entity, target_type: artist | tv_show | brand | podcast | movie }`
   → Outkast, Martin, Crown Royal, The Breakfast Club, Coming to America. → **E5–E9**.
6. Coverage check passes (demographics; 23 ≥ 20 tags; 3 domains ≥ 10; 18 metros).
7. 1,000 personas sampled **in code** from those distributions; each trait keeps
   the receipt (E3, E4, E5…) it came from.
8. The church bit runs through the panel → mean **3.8/5**, **Atlanta 4.3 vs
   Seattle/Washington ~3.3**, reasons cluster on "Church humor" / "Soul food";
   the narrative is claim-checked (0 struck — every number traces to a fact).

Entity/tag choices a human would confirm: an ambiguous name (e.g. "Pepsi" →
Pepsi vs PepsiCo) returns `needs_input` and the UI shows confirm chips.

## 4. Demo / screenshots

Live app (five scenes + Receipts) served by `npm run serve`. No credentials or
personal data appear anywhere; the demo runs in mock mode by default. To satisfy
the hackathon's "hosted externally" requirement, deploy `npm run serve` to any
Node host (Render / Railway / a VM) — see README.

## 5. Setup from a clean environment

```bash
git clone <repo> && cd Rehearsal_Qloo
npm install
npm test            # 12 tests
npm run serve       # http://localhost:5173
# CLI: npm run rehearse "Los Angeles Dodgers"  |  npm run backtest
# live Qloo: npm i -g @qloo/qloo-harness; qloo setup --qloo; QLOO_MODE=live
```

## 6. Known limitations — what the result does NOT establish

- Synthetic respondents are **samples from aggregate Qloo affinities**, not
  people. Nothing here is a claim about an individual or a prediction of one
  person's behaviour.
- Panel scores are **preference signals, not sales forecasts**.
- The TRIBE v2 "brain" strip is a **labelled stub**. The real strip needs Meta
  FAIR's model on a GPU and is CC BY-NC 4.0 (research use); it shows predicted
  attention/response, never liking, memorability or sales.
- The backtest reference is a **seeded sample**, not real YouGov, and the grounded
  path is a stand-in. The harness and method are real and frozen; swap in real
  YouGov + live Qloo for the citable figure.
- Respondents run on a **mock heuristic** by default; the live Claude Haiku
  backend is wired behind `ANTHROPIC_API_KEY` (one call per persona — costs).
- No names, emails or IDs are ever sent to Qloo.
