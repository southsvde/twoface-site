// TWOFACE - Beats page player (external)
// Shows clear status messages if anything goes wrong.

(() => {
  const listEl   = document.querySelector('#tracks');
  const statusEl = document.querySelector('#beats-status');

  if (!listEl) return;

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

  function bindSeek(row, wave, bar, ttime) {
    wave.addEventListener('click', (e) => {
      if (!player.duration || currentRow !== row) return;
      player.currentTime = pctFromEvent(e, wave) * player.duration;
    });
    wave.addEventListener('mousedown', (e) => {
      if (!player.duration || currentRow !== row) return;
      isDragging = true;
      player.currentTime = pctFromEvent(e, wave) * player.duration;
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging || currentRow !== row || !player.duration) return;
      player.currentTime = pctFromEvent(e, wave) * player.duration;
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  function buildRow(beat) {
    const row = document.createElement('article');
    row.className = 'track';
    row.dataset.src = beat.audio || '';

    const artSrc = beat.art ? beat.art : 'img/hero.jpg';

    row.innerHTML = `
      <div class="t-ctrl">
        <button type="button" aria-label="Play">${ICONS.play}</button>
      </div>

      <div class="t-art">
        <img src="${artSrc}" alt="${beat.title} cover" />
      </div>

      <div class="t-title">
        <h4>${beat.title}</h4>
        <div class="meta">
          ${beat.mood?.length ? `<span class="chip">${beat.mood.join(' • ')}</span>` : ''}
          ${beat.key ? `<span class="chip">${beat.key}</span>` : ''}
          ${beat.bpm ? `<span>${beat.bpm} BPM</span>` : ''}
        </div>
      </div>

      <div class="t-wave" role="progressbar" aria-valuemin="0" aria-valuenow="0" aria-valuemax="100">
        <div class="wave-bars"></div>
        <div class="wave-progress"></div>
        <div class="t-time">0:00</div>
      </div>

      <div class="t-actions">
        <button type="button" class="buy-btn">Buy</button>
        <div class="buy-menu" aria-label="License options">
          <a ${beat.tiers?.mp3 ? `href="${beat.tiers.mp3}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"'}><span>MP3 (Non-Exclusive)</span><small>$15</small></a>
          <a ${beat.tiers?.mp3wav ? `href="${beat.tiers.mp3wav}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"'}><span>MP3 + WAV (Non-Exclusive)</span><small>$20</small></a>
          <a ${beat.tiers?.excl_nowav ? `href="${beat.tiers.excl_nowav}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"'}><span>Exclusive (No Stems)</span><small>$60</small></a>
          <a ${beat.tiers?.excl_stems ? `href="${beat.tiers.excl_stems}" target="_blank" rel="noopener"` : 'aria-disabled="true" tabindex="-1"'}><span>Exclusive + Stems</span><small>$100</small></a>
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
        if (player.paused) {
          player.play().catch(() => {});
          setCtrlIcon(row, true);
        } else {
          player.pause();
          setCtrlIcon(row, false);
        }
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

    bindSeek(row, wave, bar, ttime);
    listEl.appendChild(row);
  }

  async function init() {
    try {
      statusEl.textContent = 'Loading beats…';
      const res = await fetch('/beats.json', { cache: 'no-store' }); // root
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const beats = await res.json();

      if (!Array.isArray(beats) || beats.length === 0) {
        statusEl.textContent = 'No beats found in beats.json.';
        return;
      }

      beats.forEach(buildRow);
      statusEl.textContent = '';
    } catch (err) {
      console.error('[Beats] load error:', err);
      statusEl.textContent = 'Couldn’t load beats. Check beats.json (valid JSON, no comments) and that /beats.json is accessible.';
    }
  }

  // Defer until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
