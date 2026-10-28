import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger/ledger.js";
import { QlooGateway } from "../src/qloo/gateway.js";
import { resolve } from "../src/qloo/resolve.js";
import { fingerprint } from "../src/qloo/fingerprint.js";
import { runYouTubeCase, mentions, seconds, appealsIn } from "../src/proof/youtube/backtest.js";
import { YouTubeError, type YouTubeApi } from "../src/proof/youtube/client.js";
import { spearman, ranks } from "../src/proof/stats.js";

// Synthetic fixtures only — shaped like YouTube Data API v3 responses, not real data.
async function fps() {
  const gw = new QlooGateway("mock", new Ledger(":memory:"));
  const fp = async (n: string) => fingerprint(gw, (await resolve(gw, n, "t")).entity!, "t");
  return { cedric: await fp("Cedric the Entertainer"), dodgers: await fp("Los Angeles Dodgers") };
}

const NOW = new Date("2026-10-29T00:00:00Z");
const old = (d: number) => new Date(NOW.getTime() - d * 86400_000).toISOString();

function fakeApi(videos: { id: string; title: string; age: number; dur: string; views: number; likes: number; comments?: string[] | "off" }[]) {
  const calls: string[] = [];
  const api: YouTubeApi = {
    async get(endpoint, p) {
      calls.push(endpoint + (p.part ? ":" + p.part : ""));
      if (endpoint === "search") return { items: [{ id: { channelId: "UCfake" }, snippet: { channelId: "UCfake" } }] };
      if (endpoint === "channels")
        return { items: [{ id: "UCfake", snippet: { title: "Fake Channel" }, contentDetails: { relatedPlaylists: { uploads: "UUfake" } } }] };
      if (endpoint === "playlistItems")
        return { items: videos.map((v) => ({ snippet: { title: v.title, description: "" }, contentDetails: { videoId: v.id, videoPublishedAt: old(v.age) } })) };
      if (endpoint === "videos" && p.part === "contentDetails")
        return { items: videos.map((v) => ({ id: v.id, contentDetails: { duration: v.dur } })) };
      if (endpoint === "videos" && p.part === "statistics")
        return { items: videos.map((v) => ({ id: v.id, statistics: { viewCount: String(v.views), likeCount: String(v.likes) } })) };
      if (endpoint === "commentThreads") {
        const v = videos.find((x) => x.id === p.videoId)!;
        if (v.comments === "off") throw new YouTubeError("disabled", "commentsDisabled", 403);
        return { items: (v.comments ?? []).map((t) => ({ snippet: { topLevelComment: { snippet: { textDisplay: t } } } })) };
      }
      throw new Error("unexpected " + endpoint);
    },
  };
  return { api, calls };
}

const CASE = { slug: "cedric", audience: "Cedric the Entertainer", channelQuery: "Cedric", control: "dodgers" };

test("predictions are sealed before any engagement number is fetched", async () => {
  const { cedric, dodgers } = await fps();
  const { api, calls } = fakeApi([
    { id: "a", title: "Church folks at the cookout", age: 30, dur: "PT8M", views: 1000, likes: 90 },
    { id: "b", title: "Barbershop talk with the crew", age: 30, dur: "PT9M", views: 1000, likes: 80 },
    { id: "c", title: "Gospel brunch gone wrong", age: 30, dur: "PT7M", views: 1000, likes: 70 },
    { id: "d", title: "Soul food Sunday", age: 30, dur: "PT6M", views: 1000, likes: 60 },
    { id: "e", title: "Airport security", age: 30, dur: "PT5M", views: 1000, likes: 20 },
    { id: "f", title: "Parking ticket rant", age: 30, dur: "PT5M", views: 1000, likes: 25 },
  ]);
  let sealedAfter = -1;
  const r = await runYouTubeCase(api, CASE, cedric, dodgers, { now: NOW, panelN: 300, onSeal: () => void (sealedAfter = calls.length) });
  const firstStats = calls.indexOf("videos:statistics");
  assert.ok(sealedAfter >= 0 && firstStats >= sealedAfter, "seal happens before videos:statistics");
  assert.ok(calls.slice(0, sealedAfter).every((c) => c !== "commentThreads:snippet"), "no comments read before the seal");
  assert.equal(r.rankTest.testable, true);
  if (r.rankTest.testable) {
    assert.ok(r.rankTest.rho > 0.5, "taste-matched titles rank above the rest in this fixture");
    assert.equal(r.rankTest.flatRho, 0, "the ungrounded panel can't rank videos at all");
  }
  assert.match(r.sealHash, /^[0-9a-f]{16}$/);
});

test("refuses to score when too few videos name a Qloo taste", async () => {
  const { cedric, dodgers } = await fps();
  const vids = ["Airport", "Parking", "Traffic", "Weather", "Taxes", "Gym"].map((t, i) => ({
    id: "v" + i, title: t + " rant", age: 30, dur: "PT5M", views: 1000, likes: 10 + i,
  }));
  const r = await runYouTubeCase(fakeApi(vids).api, CASE, cedric, dodgers, { now: NOW, panelN: 200 });
  assert.equal(r.rankTest.testable, false);
});

test("drops Shorts and videos younger than 14 days", async () => {
  const { cedric, dodgers } = await fps();
  const { api } = fakeApi([
    { id: "short", title: "Church", age: 30, dur: "PT45S", views: 10, likes: 1 },
    { id: "new", title: "Church", age: 3, dur: "PT9M", views: 10, likes: 1 },
    { id: "ok", title: "Church", age: 30, dur: "PT9M", views: 10, likes: 1 },
  ]);
  const r = await runYouTubeCase(api, CASE, cedric, dodgers, { now: NOW, panelN: 100 });
  assert.deepEqual(r.videos.map((v) => v.id), ["ok"]);
});

test("taste echoes count neighbours the video didn't name, and handle disabled comments", async () => {
  const { cedric, dodgers } = await fps();
  const { api } = fakeApi([
    { id: "a", title: "Church folks", age: 30, dur: "PT8M", views: 1000, likes: 50,
      comments: ["this is giving Martin vibes", "Outkast playing in my head", "lol", "Martin again"] },
    { id: "b", title: "Outkast reunion talk", age: 30, dur: "PT8M", views: 1000, likes: 40,
      comments: ["Outkast forever", "In-N-Out after this"] },
    { id: "c", title: "Quiet one", age: 30, dur: "PT8M", views: 1000, likes: 30, comments: "off" },
  ]);
  const r = await runYouTubeCase(api, CASE, cedric, dodgers, { now: NOW, panelN: 100 });
  const [a, b, c] = r.videos;
  assert.equal(a!.echoesOwn, 3, "Martin ×2 + Outkast");
  assert.equal(b!.echoesOwn, 0, "Outkast is in this title, so it doesn't count");
  assert.equal(b!.echoesControl, 1, "In-N-Out is a Dodgers neighbour");
  assert.equal(c!.commentsDisabled, true);
});

test("matching: tag stems, whole words, durations, tied ranks", async () => {
  assert.ok(mentions("Startups", "My first startup failed", true));
  assert.ok(!mentions("Church humor", "Churchill speech", true), "whole words only");
  assert.ok(!mentions("Family comedy", "family comedy night", true), "generic words never match");
  assert.equal(seconds("PT1H2M3S"), 3723);
  assert.deepEqual(ranks([5, 1, 5]), [2.5, 1, 2.5]);
  assert.equal(spearman([1, 1, 1], [3, 1, 2]), 0);
  const { cedric } = await fps();
  assert.ok(appealsIn(cedric, "A Barbershop special with Outkast").includes("Outkast"));
});
