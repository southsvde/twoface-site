// TWOFACE — Beats page with filters + inline player + MP3/WAV modal + enriched Buy menu
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

  // Shared audio element
  const player = new Audio();
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

  // --- Normalization: derive _genre and _moods for each beat (back-compat) ---
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

  function buildBuyMenu(beat) {
    // Requested titles + fixed prices
    const TIERS = [
      {
        key: 'mp3',
        title: 'MP3',
        desc: 'Great for quick demos & writing; not ideal for mixing/mastering.',
        price: '$29'
      },
      {
        key: 'mp3wav',
        title: 'MP3 + WAV (Recommended)',
        desc: 'Full-quality WAV for recording & release + MP3 for reference.',
        price: '$49'
      },
      {
        key: 'excl_nowav',
        title: 'Exclusive License',
        desc: 'Your exclusive rights; beat removed from store after purchase.',
        price: '$99'
      },
      {
        key: 'excl_stems',
        title: 'Exclusive License + Stems',
        desc: 'Exclusive + individual track stems for full mix control.',
        price: '$249'
      }
    ];

    return TIERS.map(tier => {
      const href = beat.tiers?.[tier.key];
      const disabledAttrs = href ? `href="${href}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"';
      return `
        <a ${disabledAttrs} class="item">
          <div class="text">
            <div class="title">${tier.title}</div>
            <div class="sub">${tier.desc}</div>
          </div>
          <div class="price">${tier.price}</div>
        </a>
      `;
    }).join('');
  }

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
        <button type="button" class="buy-btn">Buy</button>
        <div class="buy-menu" aria-label="License options">
          ${buildBuyMenu(beat)}
        </div>
      </div>
    `;

    const ctrlBtn = row.querySelector('.t-ctrl button');
    const wave    = row.querySelector('.t-wave');
    const bar     = row.querySelector('.wave-progress');
    const ttime   = row.querySelector('.t-time');
    const buyBtn  = row.querySelector('.buy-btn');
    const menu    = row.querySelector('.buy-menu');

    buyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    ctrlBtn.addEventListener('click', () => {
      const src = row.dataset.src;
      if (!src) return;

      if (currentRow === row) {
        if (player.paused) { player.play().catch(() => {}); setCtrlIcon(row, true); }
        else { player.pause(); setCtrlIcon(row, false); }
        return;
      }

      if (currentRow) {
        const prevBar  = currentRow.querySelector('.wave-progress');
        const prevBtn  = currentRow.querySelector('.t-ctrl button');
        const prevTime = currentRow.querySelector('.t-time');
        if (prevBar)  prevBar.style.width = '0%';
        if (prevTime) prevTime.textContent = '0:00';
        if (prevBtn)  prevBtn.innerHTML = ICONS.play;
      }

      currentRow = row;
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
      case 'title-desc': filtered.sort((a,b)=> (b.title||'').localeCompare(a.title||'')).reverse(); break;
      default: break;
    }

    renderList(filtered);
  }

  function renderList(items) {
    if (!player.paused) player.pause();
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
    if (moodEl) moodEl.value = '';
    if (keyEl) keyEl.value = '';
    if (bpmMinEl) bpmMinEl.value = '';
    if (bpmMaxEl) bpmMaxEl.value = '';
    if (sortEl) sortEl.value = 'default';
    applyFilters();
  }

  async function init() {
    try {
      if (statusEl) statusEl.textContent = 'Loading beats…';
      const res = await fetch('/beats.json', { cache: 'no-store' });
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
      if (statusEl) statusEl.textContent = 'Couldn’t load beats. Check beats.json (no comments) and that /beats.json is accessible.';
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

    const closeBtns = modal.querySelectorAll('[data-close="modal"], .modal-close');
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
    closeBtns.forEach(b => b.addEventListener('click', close));
  })();

  // Init
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
