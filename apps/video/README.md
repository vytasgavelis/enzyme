# Demo video

The Enzyme demo video, made with [Remotion](https://www.remotion.dev): React components rendered
frame by frame to an MP4.

The whole cut lives in [`src/storyboard.ts`](src/storyboard.ts), a list of scenes:

| Kind | What it shows |
|---|---|
| `title`, `outro` | The logo and a line or two of text. A title can open with a `lead` line on its own. |
| `statement` | A few large lines that appear one after another. |
| `flood` | A statement over a wall of real paper titles scrolling past, with a counter. |
| `agent` | The Suggest query agent's loop: each query it tried and the hit count its tool returned. |
| `stats` | A heading and a row of number tiles (the model benchmark). |
| `screenshot` | An image in a browser window. `camera` keyframes pan and zoom; `callouts` ring a part of the image (in its own pixels) and dim the rest. `fit: "scroll"` moves down a tall page. |
| `clip` | A screen recording in a browser window, with the same camera and callouts. `segments` pick the parts to play and their speed; `hold` freezes the last frame. Parts at 2× or faster show a speed badge. |

Every scene can have a `caption` and a `todo` note. A `src: null` shows a placeholder, and `todo`
notes show as a badge in the studio but never in a render.

Screenshots are in `public/shots/` and recordings in `public/clips/`, all 1440x900 and recorded
against the clean demo database. Paper titles for the `flood` scene are in `src/paper-titles.json`.

```sh
pnpm --filter @enzyme/video studio   # live preview at http://localhost:5201
pnpm --filter @enzyme/video render   # writes out/enzyme-demo.mp4
pnpm --filter @enzyme/video still -- --frame=120   # one frame as out/still.png
```
