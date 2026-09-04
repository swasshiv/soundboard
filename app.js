/* Soundboard — vanilla JS, no dependencies.
 * Config lives in sounds.json. Audio files live in ./sounds/.
 * All paths are relative so this works from a GitHub Pages subpath.
 *
 * Playback uses the Web Audio API: each file is fetched + decoded once into an
 * in-memory AudioBuffer, so triggering a pad is near-instant (no per-click
 * network/decode lag). Decoding happens lazily in the background after load,
 * keeping the initial page load fast even with many sounds. */

(() => {
  "use strict";

  const SOUNDS_DIR = "./sounds/";
  const CONFIG_URL = "./sounds.json";

  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const tabsEl = document.getElementById("tabs");
  const searchEl = document.getElementById("search");
  const volumeEl = document.getElementById("volume");
  const stopAllEl = document.getElementById("stop-all");

  /** @type {Array<{label:string,file:string,category:string,id:string}>} */
  let sounds = [];
  /** id -> pad button element */
  const padEls = new Map();

  let activeCategory = "All";
  let searchTerm = "";
  let volume = parseFloat(volumeEl.value);

  /* ---------- Web Audio engine ---------- */

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let masterGain = null;
  /** id -> AudioBuffer */
  const buffers = new Map();
  /** id -> Promise<AudioBuffer> (in-flight loads, deduped) */
  const loading = new Map();
  /** id -> Set<AudioBufferSourceNode> currently playing (allows layering) */
  const active = new Map();

  function ensureContext() {
    if (!ctx && AudioCtx) {
      // On iOS, Web Audio defaults to the "ambient" channel, which the physical
      // silent switch mutes. Declaring playback intent routes it to the media
      // channel instead, so sound plays regardless of the mute switch (Safari
      // 16.4+). Harmless / ignored where the Audio Session API is unavailable.
      try {
        if (navigator.audioSession) navigator.audioSession.type = "playback";
      } catch (_) {}
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    // Browsers start the context suspended until a user gesture.
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function urlFor(sound) {
    return SOUNDS_DIR + encodeURIComponent(sound.file);
  }

  /** Fetch + decode a sound into an AudioBuffer (cached, deduped). */
  function loadBuffer(sound) {
    if (buffers.has(sound.id)) return Promise.resolve(buffers.get(sound.id));
    if (loading.has(sound.id)) return loading.get(sound.id);

    const p = fetch(urlFor(sound))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => {
        ensureContext();
        // decodeAudioData works while the context is suspended.
        return ctx.decodeAudioData(data);
      })
      .then((buf) => {
        buffers.set(sound.id, buf);
        loading.delete(sound.id);
        return buf;
      })
      .catch((err) => {
        loading.delete(sound.id);
        console.error("Failed to load audio:", sound.file, err);
        throw err;
      });

    loading.set(sound.id, p);
    return p;
  }

  function startBuffer(sound, buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(masterGain);
    if (!active.has(sound.id)) active.set(sound.id, new Set());
    const set = active.get(sound.id);
    set.add(src);
    src.onended = () => {
      set.delete(src);
      if (set.size === 0) setPlaying(sound.id, false);
    };
    src.start(0);
    setPlaying(sound.id, true);
  }

  function play(sound) {
    ensureContext();
    // Restart this sound if it's already playing (different sounds still layer).
    stop(sound.id);

    const cached = buffers.get(sound.id);
    if (cached) {
      startBuffer(sound, cached); // instant path
    } else {
      loadBuffer(sound)
        .then((buf) => startBuffer(sound, buf))
        .catch(() => setPlaying(sound.id, false));
    }
  }

  function stop(id) {
    const set = active.get(id);
    if (!set) return;
    for (const src of set) {
      try { src.onended = null; src.stop(); } catch (_) {}
    }
    set.clear();
    setPlaying(id, false);
  }

  function stopAll() {
    for (const id of active.keys()) stop(id);
  }

  function setPlaying(id, isPlaying) {
    const pad = padEls.get(id);
    if (pad) pad.classList.toggle("playing", isPlaying);
  }

  /** Warm the buffer cache in the background so first clicks are instant. */
  function prefetchAll() {
    const queue = sounds.slice();
    const step = () => {
      const s = queue.shift();
      if (!s) return;
      loadBuffer(s).catch(() => {}).finally(() => schedule(step));
    };
    const schedule = (fn) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(fn, { timeout: 500 })
        : setTimeout(fn, 60);
    schedule(step);
  }

  /* ---------- Rendering ---------- */

  function categories() {
    const set = new Set();
    for (const s of sounds) set.add(s.category);
    return ["All", ...[...set].sort((a, b) => a.localeCompare(b))];
  }

  function renderTabs() {
    const cats = categories();
    if (cats.length <= 2 && cats[1] === "Uncategorized") {
      tabsEl.hidden = true;
      return;
    }
    tabsEl.hidden = false;
    tabsEl.innerHTML = "";
    for (const cat of cats) {
      const btn = document.createElement("button");
      btn.className = "tab" + (cat === activeCategory ? " active" : "");
      btn.textContent = cat;
      btn.type = "button";
      btn.addEventListener("click", () => {
        activeCategory = cat;
        renderTabs();
        renderBoard();
      });
      tabsEl.appendChild(btn);
    }
  }

  function visibleSounds() {
    const term = searchTerm.trim().toLowerCase();
    return sounds.filter((s) => {
      const matchCat = activeCategory === "All" || s.category === activeCategory;
      const matchTerm = !term || s.label.toLowerCase().includes(term);
      return matchCat && matchTerm;
    });
  }

  function makePad(sound) {
    const pad = document.createElement("button");
    pad.className = "pad";
    pad.type = "button";
    pad.textContent = sound.label;
    pad.title = sound.label;
    // Warm this sound the moment the user shows intent, so click is instant.
    const warm = () => loadBuffer(sound).catch(() => {});
    pad.addEventListener("pointerenter", warm);
    pad.addEventListener("pointerdown", warm);
    pad.addEventListener("click", () => {
      pad.classList.remove("flash");
      void pad.offsetWidth; // reflow to restart animation
      pad.classList.add("flash");
      play(sound);
    });
    padEls.set(sound.id, pad);
    return pad;
  }

  function renderBoard() {
    padEls.clear();
    boardEl.innerHTML = "";

    const list = visibleSounds();
    if (list.length === 0) {
      const p = document.createElement("p");
      p.className = "status";
      p.textContent = sounds.length
        ? "No sounds match your search."
        : "No sounds defined in sounds.json yet.";
      boardEl.appendChild(p);
      return;
    }

    const groups = new Map();
    for (const s of list) {
      if (!groups.has(s.category)) groups.set(s.category, []);
      groups.get(s.category).push(s);
    }

    const showHeadings = activeCategory === "All" && groups.size > 1;

    for (const [cat, items] of groups) {
      const section = document.createElement("section");
      section.className = "category-section";
      if (showHeadings) {
        const h2 = document.createElement("h2");
        h2.textContent = cat;
        section.appendChild(h2);
      }
      const grid = document.createElement("div");
      grid.className = "grid";
      for (const s of items) grid.appendChild(makePad(s));
      section.appendChild(grid);
      boardEl.appendChild(section);
    }
  }

  /* ---------- Config loading ---------- */

  function normalize(raw, index) {
    return {
      label: String(raw.label ?? raw.file ?? `Sound ${index + 1}`),
      file: String(raw.file ?? ""),
      category: String(raw.category || "Uncategorized"),
      id: `${index}-${raw.file || raw.label || index}`,
    };
  }

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.sounds;
      if (!Array.isArray(arr)) throw new Error("sounds.json must be an array or { sounds: [...] }");
      sounds = arr.filter((s) => s && s.file).map(normalize);
      renderTabs();
      renderBoard();
      prefetchAll();
    } catch (err) {
      statusEl.textContent = `Could not load sounds.json — ${err.message}`;
      statusEl.classList.add("error");
      console.error(err);
    }
  }

  /* ---------- Events ---------- */

  searchEl.addEventListener("input", () => {
    searchTerm = searchEl.value;
    renderBoard();
  });

  volumeEl.addEventListener("input", () => {
    volume = parseFloat(volumeEl.value);
    if (masterGain) masterGain.gain.value = volume;
  });

  stopAllEl.addEventListener("click", stopAll);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") stopAll();
  });

  loadConfig();
})();
