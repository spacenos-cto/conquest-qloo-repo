> **Note:** this is the original build spec, from when the product was called *Rehearsal* (a 1,000-fan focus group). It grew into **Conquest**; the panel described here now powers the Room reader and battles. See `README.md` and `docs/FEATURES.md` for what's built today.

# REHEARSAL — build spec v1

*A focus group of a thousand, in thirty seconds. Grounded in Qloo. Heard by a brain (TRIBE v2).*

Qloo Agentic Hackathon · judges: Calacanis, Diolosa (Qloo CTO), Seligman, Boehly, Cedric, Abrams · finalists pitch live Nov 5 · JCal invests $25K in his favourite.

---

## 0. What we claim / never claim

| We claim | We never claim |
|---|---|
| Synthetic respondents are *sampled from Qloo's aggregate affinity distributions*, every trait has a receipt | "These are real people", or anything about an individual's identity, traits or future behaviour (Qloo SAFE_USE rule) |
| Qloo-grounded panels reproduce real demographic splits better than LLM-only panels (number from our backtest) | "This predicts sales" |
| TRIBE shows *where a generic brain responds* to sight/sound, second by second | "Brain-level personalization", "engagement", "memorability", "conversion" |
| Two independent receipts per recommendation: perception (TRIBE) + preference (Qloo) | Anything without a ledger row behind it |

TRIBE v2 is © Meta, **CC BY-NC 4.0** — research use. Shown in UI, README and pitch. Commercial path = "what's next: license or train our own". Qloo is the load-bearing layer and the business.

---

## 1. Product

**Input:** an audience (a show, a team, a podcast, a person, or metro × age band) + a thing to test (text bit, sponsor-read script, audio read, trailer/ad video, poster image).

**Output:** vote (1–5), split by metro / age / gender, top reasons, quotes, "what to change"; for audio/video a TRIBE response strip; a **Verdict card** per segment: brain ↑ / flat, panel fit / misfit, agreement badge.

**Refusal:** if Qloo coverage for the audience is thin → `INSUFFICIENT_COVERAGE`, no panel. "Rehearsal doesn't guess."

---

## 2. Architecture

```
Web (Next.js, Vercel — UI only) ── Rehearsal MCP server (same 5 tools) ── Email-in (later)
                 │
         API + Worker on a container (Railway/Nebius CPU; harness installed; QLOO_API_KEY secret)
                 │   (qloo mcp / qloo exec are not serverless-compatible — keep all Qloo calls here)
                 │                    │
        Postgres ledger (Neon)   Qloo gateway (rate-limit, cache, log every call)
                 │                    │
        Persona sampler (pure code)   Respondent runner (Claude Haiku, 1000 calls)
                 │
        TRIBE service (Python FastAPI, Nebius GPU) ◄── video/audio/text/image
```

**API routes**
- `POST /audiences` — resolve name → Qloo entity (ambiguous → confirm chips)
- `POST /panels` — build fingerprint + sample N personas → `panel_id`
- `POST /rehearsals` — panel_id + stimulus → run respondents (+ TRIBE if media) → `rehearsal_id`
- `GET /rehearsals/{id}` — results, splits, quotes, verdict cards, receipts
- `GET /receipts/{id}` — the Qloo call (or TRIBE run) behind any number

---

## 3. Qloo layer (the company)

### 3.0 Kit alignment (from qloo/qloo-hackathon-kit — read before coding)
- **Use the official surfaces** for every live call: `qloo exec <workflow>` / `qloo api` from the worker, and `qloo mcp` for the agent. Install `@qloo/qloo-harness` ≥ 0.1.26; `qloo setup --qloo`; on the server set `QLOO_API_KEY`; export `QLOO_BASE_URL` and `QLOO_TRUSTED_BASE_URL` = `https://hackathon.api.qloo.com`.
- **Serverless is not a supported route** for `qloo mcp` → the worker runs on a VM/container (Railway or Nebius CPU), never Vercel functions. The web app only talks to our API.
- **Submission (docs/SUBMISSION.md) must include:** problem statement · *which Qloo workflows/MCP tools and why* · a redacted request-to-result walkthrough incl. entity/tag choices · demo/screenshots with no key or PII · clean-environment setup steps · known limitations ("what the result does not establish"). Judges weigh usefulness, technical execution, provenance & user clarity, responsible data handling, reproducibility.
- **Quota rules:** smallest request that answers the question; bounded retries; no bulk scraping. Prefer one workflow call over many raw calls (e.g. `where_popular` instead of 30 heatmap calls). Ask #api-help for headroom before the backtest.
- **Result envelope** has six statuses: `ok | empty | needs_input | partial | degraded | error`. `needs_input` → show candidates and ask (our confirm chips). Retry only when `error.retryable`.
- **Workflow → Rehearsal step mapping** (cite this table in the write-up):

| Official workflow / MCP tool | Rehearsal uses it for |
|---|---|
| `qloo_describe`, `qloo_find_tags` | resolve the audience and any test concept; confirm chips on `needs_input` |
| `qloo_audience_demographics`, `qloo_entity_tags` | fingerprint: age × gender over-index, taste tags |
| `qloo_where_popular` (entity, within) | metro weight vector for persona sampling |
| `qloo_recommend` (signals, target_type) | top artists / brands / shows / podcasts / films per audience |
| `qloo_trends` | momentum (flat → "not measured") |
| `qloo_rank` (options, option_type, signals) | **rank the things being tested** for this audience — 3 bits, 3 posters, 3 soundtrack options — the Qloo-native half of "Rehearse" |
| `qloo_compare_audiences` (group_a, group_b) | Atlanta vs Seattle / under-30 vs over-45 panel splits, with Qloo's own comparison as the receipt |

Direct REST (`qloo api …` or HTTP) only where a workflow doesn't cover it. Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. All GET. Invalid params are silently ignored → validate against the Entity Type Parameter Guide. Cache every response server-side (allowed); **never commit Qloo data**; never send names/emails/IDs to Qloo.

### 3.1 Resolve
`GET /search?query=<name>&types=urn:entity:person,urn:entity:podcast,urn:entity:tv_show,urn:entity:brand,urn:entity:artist,urn:entity:place`
No relevance score → if top-2 names are close, show confirm chips (human picks).

### 3.2 Fingerprint (≈40 calls per audience, cached)
| # | Call | Gives |
|---|---|---|
| a | `/v2/insights?filter.type=urn:demographics&signal.interests.entities=E` | age-band × gender over-index vector |
| b | `/v2/insights?filter.type=urn:tag&signal.interests.entities=E&take=50` | taste tags (rank matters; affinities cluster 0.98–1.0) |
| c | `qloo exec where_popular` (entity E, within = United States) — one call; fall back to per-metro heatmap only if the workflow can't give metro granularity | metro weight vector |
| d | `/v2/insights?filter.type=urn:entity:{artist,brand,tv_show,podcast,movie}&signal.interests.entities=E&take=25` (5 calls) | top entities per domain |
| e | `/v2/trending?...` for E | momentum (if flat → "not measured") |

Every call = one ledger row `qloo_calls(id, panel_id, endpoint, params, response_hash, cached_at)`.

### 3.3 Persona sampling (code, never the model)
N = 1000. For each persona:
1. **Metro** ~ Categorical(softmax(metro affinity / τ)), τ tuned so top metro ≤ 20%.
2. **Age band, gender** ~ base US shares × (1 + over-index), renormalised. (Base shares: ACS public table, committed as CSV.)
3. **Tastes:** 3 tags, 2 brands, 2 artists, 1 show, 1 podcast — weighted sampling by *rank position* (w = 1/(rank+2)), without replacement.
4. Store `persona(id, panel_id, metro, age, gender, traits[] → each trait carries ledger_row_id)`.

**Coverage rule:** need (a) + (b ≥ 20 tags) + (≥ 3 domains with ≥ 10 entities) + (≥ 10 metros with signal). Else refuse.

### 3.4 Respondent run
Claude Haiku, temp 0.8, one call per persona, batched. System prompt = persona card (city, age, gender, traits — nothing else) + rules: "answer only as this person; JSON `{score:1-5, reason:<=20 words, element:<which part>}`". Stimulus: text, transcript (for audio/video via Whisper), or image description + TRIBE strip summary (for media).

Aggregate in code: mean, % 4–5, splits by metro/age/gender, reasons clustered by `element`, 6 quotes with persona ids (hover → receipts).

### 3.5 Claim checker
Any number in the narrative must match a computed value in `results` → else struck and shown struck (Somm pattern).

### 3.6 Without Qloo (ablation as product)
Claude Opus: "Describe 1000 distinct listeners of <audience>" → personas with no data → same run. Show side by side: score distribution, metro split (none), **variance** (Qloo panels disagree like real cities; LLM-only collapses). This is the kill-shot screen.

### 3.7 Backtest (mandatory — decides the outcome)
- Freeze the method in a dated commit **before** any run.
- Source: YouGov Ratings public brand pages (popularity by age/gender/region — verify exact fields available).
- 50 brands across categories. Question to panel: "Do you have a positive opinion of {brand}?" → % positive per demographic cell.
- Score: Pearson r between panel cells and YouGov cells, Qloo-grounded vs LLM-only. Report both numbers, per-brand table, and the misses.
- Home page shows: "Qloo-grounded panels track real splits at r = X; without Qloo r = Y (50 brands, method frozen on <date>)."

---

## 4. TRIBE layer (the wow)

### 4.1 Service
- Python FastAPI on a Nebius GPU (A100/H100/L40S). Loads `facebook/tribev2` + feature extractors (Llama 3.2 text, Wav2Vec2-BERT audio, V-JEPA 2 video) — verify exact repo/model names and output format in the TRIBE v2 README before coding.
- `POST /tribe/run` with mp4 / wav / txt / png ≤ 90 s → predicted response per time step per cortical vertex → aggregate to **4 strips** via an atlas parcellation (Glasser or Schaefer): **Visual** (occipital), **Auditory** (STG), **Language** (IFG/STS), **Fronto-parietal (attention)**.
- Cache by file hash. Timeout 120 s → fall back to cached demo asset and say so.
- Precompute all demo assets; never run live if a cached result exists.

### 4.2 Views
| View | Shows | Pairs with Qloo |
|---|---|---|
| **Strip** (trailer / ad) | 4 lines under the video; peaks & dead zones (> 1 SD below mean for ≥ 2 s) | per-segment panel fit |
| **Read A/B** (two audio reads of one script) | overlaid Auditory + Language curves; % difference in mean | panel scores wording + brand acceptance |
| **Comedy mode** (audio bit) | Language curve + detected pauses; where it sags before the punch | 300 Atlanta vs 300 Seattle references |
| **Poster** (image) | Visual + face-region response | which person the audience over-indexes on |

### 4.3 Verdict card (per segment)
`brain: ↑ / flat` · `panel: fit / misfit` · badge: **Agree → ship**, **Disagree → finding** (e.g. "the brain loves the drop; the crowd doesn't know the artist").

### 4.4 Wording rules
"Predicted response", "attention", "a generic brain". Never "engagement", "memorability", "conversion", "your audience's brain". Cite the ad-perception repo (LLMs can't hear music) and the memorability audit (cortex ≠ memorability) on the Proof page.

---

## 5. Screens (Design criterion)

1. **Audience** — type a name → fingerprint cards (demographics, tags, map, tops per domain), coverage badge.
2. **Panel** — 1000 dots on a US map, coloured by age band; hover → persona card → each trait's receipt.
3. **Rehearse** — paste / upload → progress ("912 of 1000 responded") → vote, splits, reasons, quotes; media gets the strip + verdict cards.
4. **Without Qloo** — side by side, variance metric.
5. **Proof** — backtest table, misses, TRIBE citations, licences.
6. **Receipts** — every call behind this run.
7. **Developers** — MCP config + 5 tools: `fingerprint_audience`, `build_panel`, `rehearse`, `compare_reads`, `explain_receipt`.

---

## 6. Judge cases (pre-run and cached)

| Judge | Audience | Stimulus | Moment |
|---|---|---|---|
| Cedric | Cedric the Entertainer | 3 short original bits, read by a team member (record your own; no copyrighted clips) | Atlanta vs Seattle split + language curve sagging on the long setup |
| JCal | This Week in Startups / All-In | 2 sponsor-read scripts × 2 voice reads | Read A/B + wording the panel accepts |
| Boehly | Los Angeles Dodgers | 2 promo-night posters | face vs text response + which person the fans love |
| Abrams | Coachella / a Live Nation club | a 30-s lineup teaser | strip + per-segment fit |
| Diolosa | any | — | Receipts page: ~40 Qloo calls per audience, sampling code |
| Seligman | any | — | Proof page: no PII, misses published, TRIBE licence |

On air: Cedric reads one bit live → live run on the cached Cedric panel (text path, no GPU) → result in < 30 s. GPU views only from cache.

---

## 7. Rigor checklist (how the favourites won)

- [ ] Scores and sampling in code; model only "answers as a persona" and writes prose
- [ ] Every number → ledger row; claim checker strikes the rest, visibly
- [ ] Refusal on thin coverage, with the reason
- [ ] "Without Qloo" side by side
- [ ] Backtest with frozen method, misses published
- [ ] Tests: sampler (distribution tests), checker, coverage rule, API; one browser test per screen
- [ ] MCP server exposed; MIT licence in About; no Qloo data in repo; dated build log
- [ ] TRIBE: CC BY-NC notice everywhere; "what's next" slide

---

## 8. Build order

| Day | Build |
|---|---|
| 1 | Qloo gateway + ledger + resolve + fingerprint (40 calls, cached) |
| 2 | Persona sampler + coverage rule + respondent runner + aggregation + claim checker |
| 3 | Without-Qloo run + **backtest** (freeze method first, commit) |
| 4 | UI: Audience, Panel, Rehearse, Without Qloo, Proof, Receipts |
| 5 | TRIBE service on Nebius GPU; Strip view; cache demo assets |
| 6 | Read A/B + Comedy mode; Verdict cards |
| 7 | Judge cases, MCP server, write-up (problem → what → how Qloo is used, call by call → scoring in code → why it beats an LLM alone → what's next → limits), polish, rehearse the pitch |

Deadline reality: Oct 30, 11:45 pm EDT. If that holds, days 1–4 are the entry; 5–7 are the live-pitch upgrade / next round.

---

## 9. Costs to approve before spending
- Nebius GPU hours for TRIBE (hackathon credits if available; otherwise ask first).
- Any paid TTS for the sponsor-read demo (free TTS or a human read is fine).
- Claude Haiku: ~1000 calls per rehearsal ≈ cents; Opus for the LLM-only baseline ≈ a few dollars per audience.
