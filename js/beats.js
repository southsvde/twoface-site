// /js/beats.js — TWOFACE Beats page
// Filters + inline player + MP3/WAV modal + JSON-driven Buy/Add menus

(() => {
  const listEl   = document.querySelector('#tracks');
  const statusEl = document.querySelector('#beats-status');

  // Controls
  const qEl      = document.querySelector('#q');
  const genreEl  = document.querySelector('#genre');
  const moodEl   = document.querySelector('#mood');
  const keyEl    = document.querySelector('#key');
  const bpmMinEl = document.querySelector('#bpmMin');
  const bpmMaxEl = document.querySelector('#bpmMax');
  const sortEl   = document.querySelector('#sort');
  const resetEl  = document.querySelector('#reset');
  const countEl  = document.querySelector('#count');
  const countSEl = document.querySelector('#count-s');

  if (!listEl) return;

  // Allow overriding beats.json via a meta tag if you ever need to
  const BEATS_URL = document.querySelector('meta[name="beats-json"]')?.content || 'beats.json';

  // Shared audio element (single player for all rows)
  const player = new Audio();
  window.__twfPlayer = player; // expose shared player so add-ons can seek it
  player.preload = 'metadata';
  let currentRow = null;
  let isDragging = false;

  // ---- Duration cache (NEW) ----------------------------------------------
  const __durations = new Map();

  /** Get duration (in seconds) for a given src. Uses a tiny, metadata-only Audio. */
  function getDuration(src) {
    if (!src) return Promise.resolve(0);
    if (__durations.has(src)) return Promise.resolve(__durations.get(src));

    return new Promise((resolve) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.src = src;

      function done(sec) {
        __durations.set(src, sec || 0);
        a.removeEventListener('loadedmetadata', onLoad);
        a.removeEventListener('error', onErr);
        resolve(sec || 0);
      }
      function onLoad() { done(isFinite(a.duration) ? a.duration : 0); }
      function onErr()  { done(0); }

      a.addEventListener('loadedmetadata', onLoad);
      a.addEventListener('error', onErr);
    });
  }
  // ------------------------------------------------------------------------

  const ICONS = {
    play:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7-11-7Z" fill="white"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="white"/></svg>'
  };

  const fmtTime = (sec) => {
    if (isNaN(sec) || sec === Infinity) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  };

  function setCtrlIcon(row, playing) {
    const btn = row.querySelector('.t-ctrl button');
    if (!btn) return;
    btn.innerHTML = playing ? ICONS.pause : ICONS.play;
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    btn.title = playing ? 'Pause' : 'Play';
  }

  function pctFromEvent(e, el) {
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    return rect.width ? (x / rect.width) : 0;
  }

  function bindSeek(row, wave) {
    wave.addEventListener('click', (e) => {
      if (!player.duration || currentRow !== row) return;
      player.currentTime = pctFromEvent(e, wave) * player.duration;
    });
    wave.addEventListener('mousedown', () => {
      if (!player.duration || currentRow !== row) return;
      isDragging = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging || currentRow !== row || !player.duration) return;
      player.currentTime = pctFromEvent(e, wave) * player.duration;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  // --- Normalize genre/moods (back-compat with earlier schema) ------------
  const KNOWN_GENRES = [
    'Trap','Drill','Boom Bap','Boom-Bap','Boombap',
    'Lo-fi','Lofi','LoFi','Lo-Fi',
    'Hip-Hop','Hip Hop','HipHop',
    'R&B','Pop','House','EDM','Afrobeats','Afrobeat','Dancehall','Reggaeton'
  ];

  function normalizeBeat(b) {
    let moods = [];
    if (Array.isArray(b.mood)) moods = b.mood.map(String);
    else if (b.mood) moods = [String(b.mood)];

    let genre = b.genre ? String(b.genre) : (moods.find(m => KNOWN_GENRES.includes(m)) || '');
    const moodsNoGenre = genre ? moods.filter(m => m !== genre) : moods;
    return { ...b, _genre: genre, _moods: moodsNoGenre };
  }

  function uniqueValues(list, extractor) {
    const set = new Set();
    list.forEach(item => {
      const v = extractor(item);
      if (Array.isArray(v)) v.forEach(x => set.add(String(x)));
      else if (v) set.add(String(v));
    });
    return Array.from(set).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
  }

  /* ---------- Buy/Add menu: read from JSON with safe fallbacks ---------- */
  const DEFAULT_TIERS = {
    mp3:        { label: 'MP3',                      price: 29,  desc: 'Great for quick demos & writing; not ideal for mixing/mastering.' },
    mp3wav:     { label: 'MP3 + WAV',                price: 49,  desc: 'Full-quality WAV for recording & release + MP3 for reference.', recommended: true },
    excl_nowav: { label: 'Exclusive License',        price: 99,  desc: 'Your exclusive rights; beat removed from store after purchase.' },
    excl_stems: { label: 'Exclusive License + Stems',price: 249, desc: 'Exclusive + individual track stems for full mix control.' }
  };
  const TIER_ORDER = ['mp3','mp3wav','excl_nowav','excl_stems'];

  const asMoney = (v) => {
    if (typeof v === 'number') return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
    if (typeof v === 'string') return v.trim().startsWith('$') ? v : `$${v}`;
    return '';
  };

  function tierInfo(beat, key) {
    const defaults = DEFAULT_TIERS[key] || {};
    const raw = beat?.tiers?.[key];

    // legacy: string URL
    if (typeof raw === 'string') {
      return {
        url: raw,
        label: defaults.label,
        price: defaults.price,
        desc: defaults.desc,
        recommended: !!defaults.recommended,
        priceId: ''
      };
    }

    // new schema: object
    if (raw && typeof raw === 'object') {
      return {
        url: raw.url || '',
        label: raw.label || defaults.label,
        price: (raw.price ?? defaults.price),
        desc: raw.desc || defaults.desc,
        recommended: !!(raw.recommended ?? defaults.recommended),
        priceId: raw.priceId || ''
      };
    }

    // tier absent: disabled entry (still shows label/price)
    return {
      url: '',
      label: defaults.label,
      price: defaults.price,
      desc: defaults.desc,
      recommended: !!defaults.recommended,
      priceId: ''
    };
  }

  function buildMenuItems(beat, mode /* 'buy' | 'add' */) {
    return TIER_ORDER.map(key => {
      const t = tierInfo(beat, key);
      const recBadge = t.recommended ? `<span class="badge">Recommended</span>` : '';
      const recClass = t.recommended ? 'recommended' : '';

      if (mode === 'buy') {
        const hrefAttrs = t.url ? `href="${t.url}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"';
        return `
          <a ${hrefAttrs} class="item ${recClass}">
            <div class="text">
              <div class="title">${t.label}${recBadge}</div>
              <div class="sub">${t.desc}</div>
            </div>
            <div class="price">${asMoney(t.price)}</div>
          </a>
        `;
      } else {
        // ADD mode: allow adding even without priceId; checkout can block until IDs exist.
        return `
          <a role="button"
             class="item ${recClass}"
             data-action="add"
             data-tier="${key}"
             data-label="${escapeHtmlAttr(t.label)}"
             data-price="${String(t.price)}"
             data-priceid="${escapeHtmlAttr(t.priceId)}"
             data-url="${escapeHtmlAttr(t.url)}">
            <div class="text">
              <div class="title">${t.label}${recBadge}</div>
              <div class="sub">${t.desc}</div>
            </div>
            <div class="price">${asMoney(t.price)}</div>
          </a>
        `;
      }
    }).join('');
  }

  function escapeHtmlAttr(s) {
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/"/g,'&quot;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  /* ---------- Row builder ---------- */
  function buildRow(beat) {
    const row = document.createElement('article');
    row.className = 'track';
    row.dataset.src = beat.audio || '';

    const artSrc = beat.art ? beat.art : 'img/hero.jpg';
    const primaryMood = beat._moods && beat._moods.length ? beat._moods[0] : '';

    // Chips: (Genre)(Mood)(Key)(BPM)
    const chips = `
      ${beat._genre ? `<span class="chip">${beat._genre}</span>` : ''}
      ${primaryMood ? `<span class="chip">${primaryMood}</span>` : ''}
      ${beat.key ? `<span class="chip">${beat.key}</span>` : ''}
      ${Number(beat.bpm) ? `<span class="chip">${beat.bpm} BPM</span>` : ''}
    `;

    row.innerHTML = `
      <div class="t-ctrl">
        <button type="button" aria-label="Play">${ICONS.play}</button>
      </div>

      <div class="t-art">
        <img src="${artSrc}" alt="${beat.title} cover" />
      </div>

      <div class="t-title">
        <h4>${beat.title}</h4>
        <div class="meta">${chips}</div>
      </div>

      <div class="t-wave" role="progressbar" aria-valuemin="0" aria-valuenow="0" aria-valuemax="100">
        <div class="wave-bars"></div>
        <div class="wave-progress"></div>
        <div class="t-time">0:00</div>
      </div>

      <div class="t-actions">
        <button type="button" class="buy-btn" data-toggle="buy" aria-expanded="false">Buy</button>
        <button type="button" class="buy-btn add-btn" data-toggle="add" aria-expanded="false">Add to cart</button>

        <div class="buy-menu" data-mode="buy" aria-label="License options">
          ${buildMenuItems(beat, 'buy')}
        </div>

        <div class="buy-menu" data-mode="add" aria-label="Add to cart options">
          ${buildMenuItems(beat, 'add')}
        </div>
      </div>
    `;

    // --- Menu wiring (Buy & Add) -----------------------------------------
    const buyBtn = row.querySelector('button[data-toggle="buy"]');
    const addBtn = row.querySelector('button[data-toggle="add"]');
    const buyMenu = row.querySelector('.buy-menu[data-mode="buy"]');
    const addMenu = row.querySelector('.buy-menu[data-mode="add"]');

    function closeMenus() {
      document.querySelectorAll('.buy-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.t-actions [aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false'));
    }
    function toggleMenu(which) {
      closeMenus();
      const btn  = which === 'buy
