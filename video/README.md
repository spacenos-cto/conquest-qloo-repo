# Conquest: the submission video

| File | What it is |
|---|---|
| `conquest-demo.mp4` | **The video to upload.** 2:41, 1920×1080, 30 fps, burned-in captions, a quiet original music bed. |
| `conquest-demo-nomusic.mp4` | Same cut with a silent audio track, for adding your own voiceover. |
| `music-bed.wav` | The music bed on its own (synthesized in `tools/pad.mjs`, no samples or licensed music). |
| `SCRIPT.md` | The story beat by beat: captions, an optional voiceover line for each, and where every claim comes from. |
| `SHOTLIST.md` | Every shot with its source time, length and camera move. |
| `tools/` | The scripts that recorded and cut it (see "Re-make it" below). |

## The rules this follows (Qloo Agentic Hackathon, qloo.devpost.com)

1. **A video is optional.** The page says demo videos are not required; judges get the live app. This one is for the submission form and for anyone who won't click through.
2. **Under 3 minutes.** Devpost's standard rule is that judges needn't watch past 3:00. This cut is 2:41.
3. **Upload publicly** to YouTube or Vimeo and paste the link in the submission form.
4. **English, no unlicensed music, no third-party trademarks without permission.** Captions are English; the music is synthesized; the named-product comparison table is cropped out (only the category cards show).

## Add your own voiceover (free)

The **Say** column in `SCRIPT.md` is written to fit the captions at an easy pace (about 125 words a minute).

1. **Record** the Say lines in one take while watching `conquest-demo-nomusic.mp4` (Audacity, free, or your phone's voice memo app). Save as `vo.wav`.
2. **Line it up** in Audacity: the timestamps in `SCRIPT.md` are where each line starts. Leave silence between lines.
3. **Mix it in** with ffmpeg, keeping the music under the voice (run in this folder):

```bash
ffmpeg -i conquest-demo-nomusic.mp4 -i vo.wav -i music-bed.wav -filter_complex "[2:a]volume=0.35[m];[1:a][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest conquest-demo-vo.mp4
```

4. **Upload** `conquest-demo-vo.mp4` instead.

No generated voice was used: an AI voice (ElevenLabs or similar) would cost credits and needs your explicit yes first.

## Re-make it

Needs Node, ffmpeg and Playwright's Chromium (`npm i playwright` in a scratch folder; nothing is added to this repo's dependencies).

1. **Serve the app** with the prewarmed cache:

```bash
REHEARSAL_DB=./conquest-live.sqlite PORT=5181 npm run serve
```

2. **Record**, from a folder holding `tools/` (it writes `take3/` and `cmp/`):

```bash
node main.mjs take3
```

```bash
node compare.mjs cmp
```

   The battle in week 1 is a real roll (75% odds); `main.mjs` exits with code 3 if it's lost, so record again.
3. **Cut**: `edl.mjs` holds every shot, caption and zoom. Preview three frames per shot, then render all frames:

```bash
node render.mjs out --preview
```

```bash
node render.mjs out
```

4. **Encode** with the music bed:

```bash
node pad.mjs 160.7 out/pad.wav
```

```bash
ffmpeg -framerate 30 -i out/frames/o%05d.jpg -i out/pad.wav -af "aecho=0.8:0.7:120|260:0.25|0.15,lowpass=f=2400,loudnorm=I=-24:TP=-3" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest conquest-demo.mp4
```
