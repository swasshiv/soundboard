# 🎛️ Soundboard

A dependency-free, dark-themed soundboard that runs as a static site on **GitHub Pages**. The GitHub repo is the single source of truth — sounds and their configuration both live in the repo, so there is no backend and no build step.

- Responsive, touch-friendly grid of sound pads
- Search box + category tabs
- Global volume slider
- Click a pad to (re)play it; different sounds layer/overlap
- **Stop All** button (or press `Esc`)
- Lazy-loaded audio so the page stays fast with many sounds

## Live use

Anyone with the Pages URL just opens it in a browser — no install, no login. They always see the current version of the board, because the page fetches `sounds.json` fresh on every load.

---

## Add a new sound

No code changes are ever required. Three steps:

1. **Drop the audio file** into the [`/sounds`](./sounds) folder (e.g. `applause.mp3`). MP3, WAV, OGG, and M4A all work.
2. **Add one entry** to [`sounds.json`](./sounds.json):

   ```json
   { "label": "Applause", "file": "applause.mp3", "category": "Effects" }
   ```

   | field      | required | notes                                             |
   | ---------- | -------- | ------------------------------------------------- |
   | `label`    | yes      | Text shown on the pad                             |
   | `file`     | yes      | Filename inside `/sounds`                         |
   | `category` | no       | Groups pads into tabs/sections (default: *Uncategorized*) |

3. **Commit & push:**

   ```bash
   git add sounds/applause.mp3 sounds.json
   git commit -m "Add applause sound"
   git push
   ```

GitHub Pages redeploys automatically within a minute. Reload the page and the new pad is there.

> `sounds.json` may be either `{ "sounds": [ ... ] }` (as shipped) or a bare `[ ... ]` array.

---

## Enable GitHub Pages

1. Push this project to a GitHub repo (e.g. `soundboard`).
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**.
4. Choose **Branch = `main`** and **Folder = `/ (root)`**, then **Save**.
5. Wait ~1 minute. Your board is live at:

   ```
   https://<username>.github.io/<repo>/
   ```

All asset paths in this project are **relative**, so it works correctly from that project subpath (e.g. `username.github.io/soundboard/`).

---

## Collaborator workflow

**To add or change sounds** (anyone with push access):

```bash
git clone https://github.com/<username>/<repo>.git
cd <repo>
# drop files into ./sounds and edit sounds.json
git add -A && git commit -m "Add sounds" && git push
```

The push triggers a GitHub Pages redeploy. No servers to manage.

**To just use it:** open the Pages URL in any browser. Every visitor always sees the latest committed version.

---

## Run locally

Because the app fetches `sounds.json`, open it through a local web server (not `file://`):

```bash
cd soundboard
python3 -m http.server 8000
# then visit http://localhost:8000/
```

---

## Project structure

```
soundboard/
├── index.html      # markup
├── styles.css      # dark theme + responsive grid
├── app.js          # loads sounds.json, renders pads, handles playback
├── sounds.json     # <-- the config you edit to add sounds
└── sounds/         # <-- the audio files you drop in
    ├── ding.wav
    ├── boop.wav
    └── chime.wav
```

The three bundled `.wav` files are placeholders so the board works out of the box — replace or delete them (and their `sounds.json` entries) with your own.
