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
  window.__twfPlayer = player;  // existing exposure
  window.player = player;       // NEW: alias so scrubber always finds it
  player.preload = 'metadata';
  let currentRow = null;
  let isDragging = false;

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
    mp3:        { label: 'MP3',                      price: 29,  desc: 'Great for quick demos & writing. Not ideal for mixing/mastering.' },
    mp3wav:     { label: 'WAV & MP3',                price: 49,  desc: 'Full-quality WAV for recording & release. MP3 provided for references.', recommended: true },
    excl_nowav: { label: 'Exclusive License',        price: 99,  desc: 'Exclusive rights, includes WAV & MP3. Beat removed from store after purchase.' },
    excl_stems: { label: 'Exclusive License & Stems',price: 249, desc: 'Exclusive rights, WAV, and individual track stems for full mixing control. Beat removed from store after purchase.' }
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
      const btn  = which === 'buy' ? buyBtn  : addBtn;
      const menu = which === 'buy' ? buyMenu : addMenu;
      const wasOpen = menu.classList.contains('open');
      if (wasOpen) {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded','false');
      } else {
        menu.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
    }

    buyBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('buy'); });
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('add'); });
    buyMenu.addEventListener('click', (e) => e.stopPropagation());
    addMenu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closeMenus);

    // Add-to-cart action
    addMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action="add"]');
      if (!item) return;
      e.preventDefault();

      const priceId = item.getAttribute('data-priceid') || '';
      const price   = Number(item.getAttribute('data-price')) || 0;
      const label   = item.getAttribute('data-label') || 'License';
      const tierKey = item.getAttribute('data-tier') || '';
      const url     = item.getAttribute('data-url') || '';

      if (!window.TWFCart || typeof window.TWFCart.add !== 'function') {
        alert('Cart is not available yet. Please use Buy for now.');
        return;
      }

      window.TWFCart.add({
        beatId: beat.id || beat.title || 'beat',
        title: beat.title || 'Untitled',
        tierKey,
        tierLabel: label,
        price,
        priceId, // can be empty for now; checkout should enforce later
        url
      });

      closeMenus();
    });

    // --- Player wiring ----------------------------------------------------
    const ctrlBtn = row.querySelector('.t-ctrl button');
    const wave    = row.querySelector('.t-wave');
    const bar     = row.querySelector('.wave-progress');
    const ttime   = row.querySelector('.t-time');

    ctrlBtn.addEventListener('click', () => {
      const src = row.dataset.src;
      if (!src) return;

      if (currentRow === row) {
        if (player.paused) { player.play().catch(() => {}); setCtrlIcon(row, true); }
        else { player.pause(); setCtrlIcon(row, false); }
        return;
      }

      // We are switching rows: clear previous row UI + remove active marker
      if (currentRow) {
        currentRow.classList.remove('is-playing');                // NEW
        const prevBar  = currentRow.querySelector('.wave-progress');
        const prevBtn  = currentRow.querySelector('.t-ctrl button');
        const prevTime = currentRow.querySelector('.t-time');
        if (prevBar)  prevBar.style.width = '0%';
        if (prevTime) prevTime.textContent = '0:00';
        if (prevBtn)  prevBtn.innerHTML = ICONS.play;
      }

      currentRow = row;
      row.classList.add('is-playing');                            // NEW

      player.src = src;
      player.currentTime = 0;
      player.play().then(() => setCtrlIcon(row, true)).catch(() => {});
    });

    const onLoaded = () => { if (currentRow === row) ttime.textContent = fmtTime(player.duration); };
    const onTime   = () => {
      if (currentRow !== row || !player.duration) return;
      const pct = (player.currentTime / player.duration) * 100;
      bar.style.width = `${pct}%`;
      wave.setAttribute('aria-valuenow', Math.round(pct));
      ttime.textContent = fmtTime(player.currentTime);
    };
    const onEnded  = () => {
      if (currentRow === row) {
        setCtrlIcon(row, false);
        bar.style.width = '0%';
        ttime.textContent = fmtTime(player.duration || 0);
      }
    };

    player.addEventListener('loadedmetadata', onLoaded);
    player.addEventListener('timeupdate', onTime);
    player.addEventListener('ended', onEnded);

    bindSeek(row, wave);
    return row;
  }

  /* ---------- Data + Filters ---------- */
  let allBeats = [];
  let beatsNorm = [];

  function applyFilters() {
    const q   = (qEl?.value || '').trim().toLowerCase();
    const g   = genreEl?.value || '';
    const m   = moodEl?.value || '';
    const k   = keyEl?.value || '';
    const min = Number(bpmMinEl?.value) || -Infinity;
    const max = Number(bpmMaxEl?.value) || Infinity;

    let filtered = beatsNorm.filter(b => {
      const titleOk = !q || (b.title || '').toLowerCase().includes(q);
      const genreOk = !g || b._genre === g;
      const moodOk  = !m || (Array.isArray(b._moods) && b._moods.includes(m));
      const keyOk   = !k || String(b.key) === k;
      const bpm     = Number(b.bpm);
      const bpmOk   = isFinite(bpm) ? (bpm >= min && bpm <= max) : true;
      return titleOk && genreOk && moodOk && keyOk && bpmOk;
    });

    switch (sortEl?.value) {
      case 'bpm-asc':  filtered.sort((a,b)=> (a.bpm||0)-(b.bpm||0)); break;
      case 'bpm-desc': filtered.sort((a,b)=> (b.bpm||0)-(a.bpm||0)); break;
      case 'title-asc': filtered.sort((a,b)=> (a.title||'').localeCompare(b.title||'')); break;
      case 'title-desc': filtered.sort((a,b)=> (a.title||'').localeCompare(b.title||'')).reverse(); break;
      default: break;
    }

    renderList(filtered);
  }

  function renderList(items) {
    if (!player.paused) player.pause();
    // clear any stale active marker when we rebuild the list
    document.querySelector('.track.is-playing')?.classList.remove('is-playing'); // NEW
    currentRow = null;

    listEl.innerHTML = '';
    items.forEach(beat => listEl.appendChild(buildRow(beat)));

    const n = items.length;
    if (countEl)  countEl.textContent = String(n);
    if (countSEl) countSEl.style.display = n === 1 ? 'none' : 'inline';
    if (statusEl) statusEl.textContent = n ? '' : 'No results with those filters.';
  }

  function populateControls(beats) {
    const genres = uniqueValues(beats, b => b._genre);
    const moods  = uniqueValues(beats, b => b._moods || []);
    const keys   = uniqueValues(beats, b => b.key);

    if (genreEl) genreEl.innerHTML = `<option value="">All</option>` + genres.map(v => `<option value="${v}">${v}</option>`).join('');
    if (moodEl)  moodEl.innerHTML  = `<option value="">All</option>` + moods.map(v => `<option value="${v}">${v}</option>`).join('');
    if (keyEl)   keyEl.innerHTML   = `<option value="">All</option>` + keys.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  function resetFilters() {
    if (qEl) qEl.value = '';
    if (genreEl) genreEl.value = '';
    if (moodEl)  moodEl.value = '';
    if (keyEl)   keyEl.value = '';
    if (bpmMinEl) bpmMinEl.value = '';
    if (bpmMaxEl) bpmMaxEl.value = '';
    if (sortEl) sortEl.value = 'default';
    applyFilters();
  }

  async function init() {
    try {
      if (statusEl) statusEl.textContent = 'Loading beats…';
      const res = await fetch(BEATS_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allBeats = await res.json();

      if (!Array.isArray(allBeats) || allBeats.length === 0) {
        if (statusEl) statusEl.textContent = 'No beats found in beats.json.';
        return;
      }

      beatsNorm = allBeats.map(normalizeBeat);
      populateControls(beatsNorm);
      if (statusEl) statusEl.textContent = '';
      applyFilters();
    } catch (err) {
      console.error('[Beats] load error:', err);
      if (statusEl) statusEl.textContent = 'Couldn’t load beats. Make sure /beats.json exists, is valid JSON (no comments), and is publicly accessible.';
    }
  }

  // Wire filter events
  [qEl, genreEl, moodEl, keyEl, bpmMinEl, bpmMaxEl, sortEl].forEach(ctrl => {
    ctrl && ctrl.addEventListener('input', applyFilters);
    ctrl && ctrl.addEventListener('change', applyFilters);
  });
  resetEl && resetEl.addEventListener('click', resetFilters);

  /* ---------- Modal wiring (MP3 vs WAV) ---------- */
  (function setupInfoModal(){
    const trigger = document.getElementById('mp3wav-trigger');
    const modal   = document.getElementById('mp3wav-modal');
    if (!trigger || !modal) return;

    const backdrop  = modal.querySelector('.modal-backdrop');
    const panel     = modal.querySelector('.modal-panel');

    let lastFocus = null;

    function focusables() {
      return panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    }

    function open() {
      lastFocus = document.activeElement;
      modal.classList.add('open');
      const f = focusables();
      (f[0] || panel).focus();
      document.addEventListener('keydown', onKey);
    }
    function close() {
      modal.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      if (lastFocus) lastFocus.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    trigger.addEventListener('click', open);
    backdrop?.addEventListener('click', close);
    panel.querySelectorAll('[data-close="modal"], .modal-close').forEach(b => b.addEventListener('click', close));
  })();

  // Init
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
