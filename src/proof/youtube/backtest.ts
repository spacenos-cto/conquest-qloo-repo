import type { Fingerprint, Stimulus } from "../../qloo/types.js";
import { samplePanel } from "../../panel/sampler.js";
import { runPanel, runFlat, type RespondentMode } from "../../panel/respondent.js";
import { hash, stable } from "../../ledger/ledger.js";
import { spearman, permutationP, mean, round2, round3 } from "../stats.js";
import { YouTubeError, type YouTubeApi } from "./client.js";

/**
 * The real-world backtest: does Qloo taste-fit predict which of a channel's
 * own videos its audience engages with most?
 *
 * Frozen method (do not tune after seeing results — bump METHOD_VERSION instead):
 *  1. Take the channel's 50 most recent uploads. Keep videos at least 14 days
 *     old (engagement has settled) and longer than 60 s (no Shorts). Use the
 *     12 most recent that remain.
 *  2. For each video, the stimulus is its title plus the first 300 characters
 *     of its description. Its appeals are the audience's Qloo tastes (tags,
 *     artists, shows, podcasts, brands) named in that text.
 *  3. Run the 1,000-persona panel on every video and record the mean score.
 *  4. Seal the predictions (hash + timestamp) BEFORE fetching any view, like
 *     or comment count.
 *  5. Fetch likes, views and the top 100 comments per video.
 *  6. Score: Spearman rho between panel score and likes per 1,000 views, with
 *     a one-sided permutation p-value. Refuse to score when fewer than 4 of the
 *     videos name any Qloo taste, or fewer than 6 show like counts.
 *  7. Taste echoes: how often real commenters name the audience's Qloo
 *     neighbours (entities NOT in the video's own text), per 1,000 comments,
 *     against a control audience's neighbours.
 */
export const METHOD_VERSION = "yt-1";
export const METHOD =
  "Channel's 12 most recent uploads (≥14 days old, >60 s). Stimulus = title + 300 chars of description; " +
  "appeals = Qloo tastes named in it. Panel predictions sealed before any engagement data is fetched. " +
  "Score = Spearman rho vs likes per 1,000 views, one-sided permutation p. Refuse if <4 videos name a Qloo " +
  "taste. Taste echoes = Qloo neighbours named in real comments (not in the video text) vs a control audience.";

export const RULES = {
  uploads: 50,
  minAgeDays: 14,
  minSeconds: 61,
  videos: 12,
  minMatched: 4,
  minLiked: 6,
  comments: 100,
  descChars: 300,
};

export interface YtCase {
  slug: string;
  audience: string;
  /** "@handle" or "UC…" channel id. Leave empty to search by channelQuery. */
  channel?: string;
  channelQuery: string;
  /** slug of another case whose Qloo neighbours act as the control */
  control: string;
}

export interface VideoResult {
  id: string;
  title: string;
  publishedAt: string;
  appeals: string[];
  predicted: number;
  views: number | null;
  likes: number | null;
  likesPerK: number | null;
  commentsFetched: number;
  commentsDisabled: boolean;
  echoesOwn: number;
  echoesControl: number;
}

export interface CaseResult {
  slug: string;
  audience: string;
  channel: { id: string; title: string };
  sealedAt: string;
  sealHash: string;
  videos: VideoResult[];
  rankTest:
    | { testable: true; n: number; rho: number; p: number; flatRho: number }
    | { testable: false; reason: string; n: number };
  medianSplit: { higherMean: number; lowerMean: number; higherN: number; lowerN: number } | null;
  echoes: { comments: number; ownPer1k: number; controlPer1k: number; ownHits: number; controlHits: number; topOwn: string[] };
  misses: { title: string; predicted: number; likesPerK: number; kind: "overrated" | "underrated" }[];
}

export interface Seal {
  slug: string;
  sealedAt: string;
  sealHash: string;
  predictions: { id: string; title: string; appeals: string[]; predicted: number }[];
}

const GENERIC = new Set([
  "comedy", "culture", "music", "show", "shows", "specials", "talk", "classic", "family",
  "variety", "sports", "humor", "food", "night", "life", "the", "and", "pop", "new",
]);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}($|[^\\p{L}\\p{N}])`, "iu");

/** Does this taste name appear in the text? Entities match as whole phrases; tags by any distinctive word. */
export function mentions(taste: string, text: string, isTag: boolean): boolean {
  if (!isTag) return taste.length >= 4 && wordRe(taste).test(text);
  return taste
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !GENERIC.has(w))
    .some((w) => {
      const stem = w.endsWith("s") ? w.slice(0, -1) : w;
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(stem)}s?($|[^\\p{L}\\p{N}])`, "iu").test(text);
    });
}

/** The tastes a persona can hold (sampler's pools), named in this text. */
export function appealsIn(fp: Fingerprint, text: string): string[] {
  const out: string[] = [];
  for (const t of fp.tags) if (mentions(t, text, true)) out.push(t);
  for (const d of ["artist", "tv_show", "podcast", "brand"]) {
    for (const e of fp.domains[d] ?? []) if (mentions(e.name, text, false)) out.push(e.name);
  }
  return [...new Set(out)];
}

/** Every entity name in the fingerprint (all domains), for taste echoes. */
export function neighbours(fp: Fingerprint): string[] {
  return [...new Set(Object.values(fp.domains).flatMap((xs) => xs.map((x) => x.name)))].filter(
    (n) => n.length >= 4 && n.toLowerCase() !== fp.audience.name.toLowerCase(),
  );
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function seconds(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
}

async function resolveChannel(api: YouTubeApi, c: YtCase): Promise<{ id: string; title: string; uploads: string }> {
  let params: Record<string, string>;
  if (c.channel?.startsWith("@")) params = { part: "snippet,contentDetails", forHandle: c.channel };
  else if (c.channel) params = { part: "snippet,contentDetails", id: c.channel };
  else {
    const s = await api.get("search", { part: "snippet", type: "channel", q: c.channelQuery, maxResults: "1" });
    const id = s?.items?.[0]?.snippet?.channelId ?? s?.items?.[0]?.id?.channelId;
    if (!id) throw new Error(`No YouTube channel found for "${c.channelQuery}"`);
    params = { part: "snippet,contentDetails", id };
  }
  const ch = (await api.get("channels", params))?.items?.[0];
  const uploads = ch?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error(`Channel for "${c.audience}" has no uploads playlist`);
  return { id: ch.id, title: ch.snippet?.title ?? "", uploads };
}

export async function runYouTubeCase(
  api: YouTubeApi,
  c: YtCase,
  fp: Fingerprint,
  controlFp: Fingerprint,
  opts: { respMode?: RespondentMode; now?: Date; panelN?: number; onSeal?: (s: Seal) => Promise<void> | void } = {},
): Promise<CaseResult> {
  const now = opts.now ?? new Date();
  const channel = await resolveChannel(api, c);

  // --- 1. pick the videos (metadata only: no engagement numbers yet) ---
  const pl = await api.get("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: channel.uploads,
    maxResults: String(RULES.uploads),
  });
  const uploads = (pl?.items ?? []).map((it: any) => ({
    id: String(it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId),
    title: String(it.snippet?.title ?? ""),
    description: String(it.snippet?.description ?? ""),
    publishedAt: String(it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? ""),
  }));
  const det = await api.get("videos", { part: "contentDetails", id: uploads.map((u: any) => u.id).join(",") });
  const dur = new Map<string, number>((det?.items ?? []).map((v: any) => [v.id, seconds(v.contentDetails?.duration)]));
  const cutoff = now.getTime() - RULES.minAgeDays * 86400_000;
  const picked = uploads
    .filter((u: any) => Date.parse(u.publishedAt) <= cutoff && (dur.get(u.id) ?? 0) >= RULES.minSeconds)
    .slice(0, RULES.videos);

  // --- 2–3. predict every video with the panel ---
  const { personas } = samplePanel(fp, opts.panelN ?? 1000, 42);
  const flat = runFlat(personas, 7);
  const predictions: Seal["predictions"] = [];
  const flatScores: number[] = [];
  for (const v of picked) {
    const text = `${v.title}\n${v.description.slice(0, RULES.descChars)}`;
    const appeals = appealsIn(fp, text);
    const stimulus: Stimulus = { id: v.id, label: v.title, text, appeals };
    const replies = await runPanel(personas, stimulus, opts.respMode ?? "mock", 7);
    predictions.push({ id: v.id, title: v.title, appeals, predicted: round3(mean(replies.map((r) => r.score))) });
    flatScores.push(mean(flat.map((r) => r.score))); // the ungrounded panel never reads the video
  }

  // --- 4. seal before looking ---
  const sealedAt = now.toISOString();
  const sealHash = hash(stable({ METHOD_VERSION, slug: c.slug, channel: channel.id, predictions }));
  await opts.onSeal?.({ slug: c.slug, sealedAt, sealHash, predictions });

  // --- 5. the outcomes ---
  const st = picked.length
    ? await api.get("videos", { part: "statistics", id: picked.map((v: any) => v.id).join(",") })
    : { items: [] };
  const stats = new Map<string, any>((st?.items ?? []).map((v: any) => [v.id, v.statistics ?? {}]));
  const own = neighbours(fp);
  const ownSet = new Set(own.map((x) => x.toLowerCase()));
  const control = neighbours(controlFp).filter((x) => !ownSet.has(x.toLowerCase()));

  const videos: VideoResult[] = [];
  const ownHitCount = new Map<string, number>();
  for (let i = 0; i < picked.length; i++) {
    const v = picked[i]!;
    const p = predictions[i]!;
    const s = stats.get(v.id) ?? {};
    const views = s.viewCount != null ? Number(s.viewCount) : null;
    const likes = s.likeCount != null ? Number(s.likeCount) : null;

    let comments: string[] = [];
    let disabled = false;
    try {
      const ct = await api.get("commentThreads", {
        part: "snippet",
        videoId: v.id,
        maxResults: String(RULES.comments),
        order: "relevance",
        textFormat: "plainText",
      });
      comments = (ct?.items ?? []).map((t: any) => String(t.snippet?.topLevelComment?.snippet?.textDisplay ?? ""));
    } catch (e) {
      if (e instanceof YouTubeError && e.reason === "commentsDisabled") disabled = true;
      else throw e;
    }

    // Echoes only count neighbours the video itself never named (no parroting the title).
    const videoText = `${v.title}\n${v.description}`;
    const ownHere = own.filter((n) => !mentions(n, videoText, false));
    const ctlHere = control.filter((n) => !mentions(n, videoText, false));
    let echoesOwn = 0;
    let echoesControl = 0;
    for (const text of comments) {
      const hit = ownHere.find((n) => mentions(n, text, false));
      if (hit) {
        echoesOwn++;
        ownHitCount.set(hit, (ownHitCount.get(hit) ?? 0) + 1);
      }
      if (ctlHere.some((n) => mentions(n, text, false))) echoesControl++;
    }

    videos.push({
      id: v.id,
      title: v.title,
      publishedAt: v.publishedAt,
      appeals: p.appeals,
      predicted: p.predicted,
      views,
      likes,
      likesPerK: views && likes != null ? round2((likes / views) * 1000) : null,
      commentsFetched: comments.length,
      commentsDisabled: disabled,
      echoesOwn,
      echoesControl,
    });
  }

  // --- 6. score ---
  const scored = videos.map((v, i) => ({ v, flat: flatScores[i]! })).filter((x) => x.v.likesPerK != null);
  const matched = videos.filter((v) => v.appeals.length > 0).length;
  let rankTest: CaseResult["rankTest"];
  if (matched < RULES.minMatched)
    rankTest = { testable: false, n: scored.length, reason: `only ${matched} of ${videos.length} videos name a Qloo taste (need ${RULES.minMatched})` };
  else if (scored.length < RULES.minLiked)
    rankTest = { testable: false, n: scored.length, reason: `only ${scored.length} videos show like counts (need ${RULES.minLiked})` };
  else {
    const pred = scored.map((x) => x.v.predicted);
    const real = scored.map((x) => x.v.likesPerK!);
    rankTest = {
      testable: true,
      n: scored.length,
      rho: round2(spearman(pred, real)),
      p: round3(permutationP(pred, real)),
      flatRho: round2(spearman(scored.map((x) => x.flat), real)),
    };
  }

  let medianSplit: CaseResult["medianSplit"] = null;
  const misses: CaseResult["misses"] = [];
  if (rankTest.testable) {
    // Only read the split and misses when the refusal rule passed; otherwise they'd imply a verdict.
    const sortedPred = scored.map((x) => x.v.predicted).sort((a, b) => a - b);
    const medPred = sortedPred[Math.floor((sortedPred.length - 1) / 2)]!;
    const hi = scored.filter((x) => x.v.predicted > medPred).map((x) => x.v);
    const lo = scored.filter((x) => x.v.predicted <= medPred).map((x) => x.v);
    if (hi.length && lo.length)
      medianSplit = {
        higherMean: round2(mean(hi.map((v) => v.likesPerK!))),
        lowerMean: round2(mean(lo.map((v) => v.likesPerK!))),
        higherN: hi.length,
        lowerN: lo.length,
      };
    const sortedReal = scored.map((x) => x.v.likesPerK!).sort((a, b) => a - b);
    const medReal = sortedReal[Math.floor((sortedReal.length - 1) / 2)]!;
    for (const v of hi) if (v.likesPerK! < medReal) misses.push({ title: v.title, predicted: v.predicted, likesPerK: v.likesPerK!, kind: "overrated" });
    for (const v of lo)
      if (v.likesPerK! > medReal && v.appeals.length === 0)
        misses.push({ title: v.title, predicted: v.predicted, likesPerK: v.likesPerK!, kind: "underrated" });
  }

  // --- 7. taste echoes ---
  const total = videos.reduce((s, v) => s + v.commentsFetched, 0);
  const ownHits = videos.reduce((s, v) => s + v.echoesOwn, 0);
  const controlHits = videos.reduce((s, v) => s + v.echoesControl, 0);
  const per1k = (h: number) => (total ? round2((h / total) * 1000) : 0);

  return {
    slug: c.slug,
    audience: c.audience,
    channel: { id: channel.id, title: channel.title },
    sealedAt,
    sealHash,
    videos,
    rankTest,
    medianSplit,
    echoes: {
      comments: total,
      ownHits,
      controlHits,
      ownPer1k: per1k(ownHits),
      controlPer1k: per1k(controlHits),
      topOwn: [...ownHitCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, k]) => `${n} (${k})`),
    },
    misses: misses.slice(0, 6),
  };
}
