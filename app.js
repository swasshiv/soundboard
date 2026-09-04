/* Soundboard — vanilla JS, no dependencies.
 * Config lives in sounds.json. Audio files live in ./sounds/.
 * All paths are relative so this works from a GitHub Pages subpath. */

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
  /** id -> HTMLAudioElement (lazily created) */
  const audioCache = new Map();
  /** id -> pad button element */
  const padEls = new Map();

  let activeCategory = "All";
  let searchTerm = "";
  let volume = parseFloat(volumeEl.value);

  /* ---------- Audio ---------- */

  function getAudio(sound) {
    let audio = audioCache.get(sound.id);
    if (!audio) {
      audio = new Audio();
      // Lazy: only set src (and start network fetch) on first play.
      audio.preload = "none";
      audio.src = SOUNDS_DIR + encodeURIComponent(sound.file);
      audio.volume = volume;
      audio.addEventListener("ended", () => setPlaying(sound.id, false));
      audio.addEventListener("pause", () => {
        // treat a pause at start as stopped
        if (audio.currentTime === 0) setPlaying(sound.id, false);
      });
      audio.addEventListener("error", () => {
        setPlaying(sound.id, false);
        console.error("Failed to load audio:", sound.file);
      });
      audioCache.set(sound.id, audio);
    }
    return audio;
  }

  function play(sound) {
    const audio = getAudio(sound);
    audio.volume = volume;
    // Restart if already playing; layering across *different* sounds is allowed.
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => console.warn("Playback blocked:", err));
    }
    setPlaying(sound.id, true);
  }

  function stopAll() {
    for (const audio of audioCache.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    for (const id of padEls.keys()) setPlaying(id, false);
  }

  function setPlaying(id, isPlaying) {
    const pad = padEls.get(id);
    if (pad) pad.classList.toggle("playing", isPlaying);
  }

  /* ---------- Rendering ---------- */

  function categories() {
    const set = new Set();
    for (const s of sounds) set.add(s.category);
    return ["All", ...[...set].sort((a, b) => a.localeCompare(b))];
  }

  function renderTabs() {
    const cats = categories();
    // Hide tabs entirely if everything is uncategorized into a single bucket.
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
    pad.addEventListener("click", () => {
      pad.classList.remove("flash");
      // reflow to restart animation
      void pad.offsetWidth;
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

    // Group by category (unless a single category is already selected).
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
      sounds = arr
        .filter((s) => s && s.file)
        .map(normalize);
      renderTabs();
      renderBoard();
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
    for (const audio of audioCache.values()) audio.volume = volume;
  });

  stopAllEl.addEventListener("click", stopAll);

  // Keyboard: Escape stops everything.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") stopAll();
  });

  loadConfig();
})();
