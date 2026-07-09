# @structura/video-compositions

Remotion compositions for the video channel — the prototype replacing
the Shotstack EDL renderer (`functions/src/channels/video/edl.ts`).

## Status: prototype

Not wired into the synthesis pipeline yet. The plan is a new
`pipeline: "remotion"` leg in the registry in
`functions/src/channels/video/synthesis.ts`, with Shotstack kept as the
`"assembly"` fallback through the rollout window.

## Try it

```bash
pnpm install
cd packages/video-compositions
pnpm studio          # live preview at localhost:3000
pnpm render baseline out/baseline.mp4   # local mp4 render
```

Render with a real production script:

```bash
pnpm render baseline out/job.mp4 --props=path/to/job-props.json
```

`job-props.json` follows `VideoCompositionProps` (`src/types.ts`) — the
`script` field is a production `VideoScript` verbatim. Without
`voiceoverUrl`/`words` the timeline uses the same estimated pacing
(~2.4 words/sec) production falls back to when transcription fails.

## Layout

- `src/types.ts` — mirrors the functions-side wire contract
  (`VideoScript`, `TimedChunk`); promote to `@structura/types` before
  this ships.
- `src/timing.ts` — pure timeline math (segments, word timings, chunks).
- `src/templates/<id>/` — one folder per template. The production
  lineup is the six from the design handoff
  (`marketing/design_handoff_video_templates`): `offhand`, `slam`,
  `broadsheet`, `prime`, `scrapbook`, `checklist`. `baseline` (the
  like-for-like Shotstack port) and `punch` (pre-handoff prototype) are
  kept only for renderer comparison — do not ship them.
- `src/shared/` — accent contrast guard (`accent.ts`) and the
  four-locale fixed strings (`strings.ts`), both ported from the
  handoff's `shared.jsx` with tests.
- `src/fixtures/sampleProps.ts` — offline-safe default props (picsum
  placeholders). Paste Pexels video-file URLs into `visuals` to judge
  stock-footage looks.

## Licensing note

Remotion is free for companies of up to 3 people; above that the
Automators plan ($0.01/render, $100/mo minimum) applies. Re-check
https://www.remotion.pro/license before the team grows.
