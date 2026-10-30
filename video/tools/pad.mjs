// An original ambient pad, synthesized here (no samples, no licensed music): four slow chords
// with soft harmonics, crossfaded, plus a quiet pulse. node pad.mjs <seconds> <out.wav>
import { writeFileSync } from "node:fs";
const secs = +(process.argv[2] || 161), out = process.argv[3] || "pad.wav", SR = 44100, N = Math.round(secs * SR);
const BAR = 6.4; // seconds per chord
const chords = [[110, 130.81, 164.81, 220], [87.31, 130.81, 174.61, 220], [130.81, 164.81, 196, 261.63], [98, 146.83, 196, 246.94]];
const L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR, b = Math.floor(t / BAR), ph = (t % BAR) / BAR;
  // crossfade the last 30% of each bar into the next chord
  const x = Math.max(0, (ph - 0.7) / 0.3), wA = Math.cos((x * Math.PI) / 2), wB = Math.sin((x * Math.PI) / 2);
  let l = 0, r = 0;
  for (const [w, c] of [[wA, chords[b % 4]], [wB, chords[(b + 1) % 4]]]) {
    if (w < 1e-4) continue;
    c.forEach((f, k) => {
      const v = w * (0.16 / (1 + k * 0.35));
      const s1 = Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t) + 0.06 * Math.sin(6 * Math.PI * f * t);
      const s2 = Math.sin(2 * Math.PI * f * 1.003 * t + k);
      l += v * (0.7 * s1 + 0.3 * s2); r += v * (0.3 * s1 + 0.7 * s2);
    });
  }
  // slow swell and a soft heartbeat-like pulse on the root, every half bar
  const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 23);
  const pt = (t % (BAR / 2)), pulse = 0.12 * Math.exp(-pt * 6) * Math.sin(2 * Math.PI * chords[b % 4][0] / 2 * t);
  L[i] = (l * swell + pulse); R[i] = (r * swell + pulse);
}
// fade in 2 s, out 3 s; normalise to -16 dBFS peak-ish
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.16 / peak, buf = Buffer.alloc(44 + N * 4);
for (let i = 0; i < N; i++) {
  const t = i / SR, f = Math.min(1, t / 2, (secs - t) / 3);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
writeFileSync(out, buf); console.log("wrote", out, secs, "s");
