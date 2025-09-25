// js/player-scrub-wave.js
// Enhances the mini-player with scrubbing + drawn waveform.
// Works alongside your existing beats code. Requires window.__twfPlayer.

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---- Use the shared player your beats code exposes ----
  function getPlayer() {
    if (window.__twfPlayer instanceof Audio) return window.__twfPlayer;
    // Fallback if not exposed (still works visually but won’t control playback)
    return (window.__twfPlayer = window.__twfPlayer || new Audio());
  }
  const player = getPlayer();

  let currentRow = null;

  // ---- TIME UTILS ----
  const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ---- WAVEFORM DRAWING (lazy, CORS-safe fallback) ----
  async function buildWaveform(row) {
    if (row.__waveBuilt) return;
    const src = row.dataset.src || '';
    const container = row.querySelector('.t-wave');
    if (!src || !container) return;

    let canvas = container.querySelector('canvas.wave-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'wave-canvas';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.opacity = '0.9';
      const bars = container.querySelector('.wave-bars');
      bars ? bars.appendChild(canvas) : container.prepend(canvas);
    }

    try {
      const resp = await fetch(src, { mode: 'cors', cache: 'force-cache' });
      const buf  = await resp.arrayBuffer();
      const ctxA = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctxA.decodeAudioData(buf);

      const L = audioBuffer.getChannelData(0);
      const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

      const pr = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      const W = Math.max(200, Math.floor(rect.width * pr));
      const H = Math.max(40,  Math.floor(rect.height * pr));
      canvas.width = W; canvas.height = H;

      const gap = 3 * pr, barW = 2 * pr, count = Math.max(60, Math.floor(W / (barW + gap)));
      const block = Math.max(1, Math.floor(audioBuffer.length / count));
      const peaks = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const start = i * block, end = Math.min(start + block, audioBuffer.length);
        let peak = 0;
        for (let j = start; j < end; j += 32) { // stride for speed
          const a = Math.abs(L[j] || 0);
          const b = R ? Math.abs(R[j] || 0) : 0;
          peak = Math.max(peak, a, b);
        }
        // log-ish mapping to make quiet parts visible
        const db = 20 * Math.log10(peak + 1e-4);          // ~[-80..0]
        const n  = Math.min(1, Math.max(0, (db + 60) / 60));
        peaks[i] = n;
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#262634';
      const mid = H / 2;
      for (let i = 0; i < count; i++) {
        const x = Math.floor(i * (barW + gap));
        const h = Math.max(2, Math.round(peaks[i] * (H * 0.85)));
        ctx.fillRect(x, mid - h / 2, barW, h);
      }

      row.__waveBuilt = true;
    } catch (e) {
      // CORS or decode failed -> keep your CSS gradient bars
      console.debug('[waveform] skipped:', e?.message || e);
    }
  }

  // ---- SCRUBBING ----
  function wireScrub(row) {
    const wave  = row.querySelector('.t-wave');
    const fill  = row.querySelector('.wave-progress');
    const ttime = row.querySelector('.t-time');
    if (!wave || !fill || !ttime) return;

    let dragging = false;

    const pctFromEvent = (ev) => {
      const r = wave.getBoundingClientRect();
      const x = (ev.clientX ?? (ev.touches?.[0]?.clientX) ?? 0) - r.left;
      return Math.max(0, Math.min(1, x / r.width));
    };

    const seekToPct = (pct) => {
      pct = Math.max(0, Math.min(1, pct));
      const src = row.dataset.src || '';
      const isSame = src && player.src && player.src.includes(src);

      const doSeek = () => {
        const wasPlaying = !player.paused && !player.ended;
        try { player.pause(); } catch {}
        const target = (player.duration || 0) * pct;
        try { player.currentTime = target; } catch {}
        fill.style.width = (pct * 100).toFixed(2) + '%';
        ttime.textContent = fmtTime(player.currentTime || target);
        if (wasPlaying) player.play().catch(()=>{});
      };

      if (!isSame && src) {
        player.src = src;
        // Once duration known, seek precisely
        const once = () => { doSeek(); player.removeEventListener('loadedmetadata', once); };
        player.addEventListener('loadedmetadata', once, { once: true });
      } else if (isFinite(player.duration) && player.duration > 0) {
        doSeek();
      } else {
        const once = () => { doSeek(); player.removeEventListener('loadedmetadata', once); };
        player.addEventListener('loadedmetadata', once, { once: true });
      }

      currentRow = row;
    };

    const onDown = (ev) => { dragging = true; seekToPct(pctFromEvent(ev)); ev.preventDefault(); };
    const onMove = (ev) => { if (dragging) seekToPct(pctFromEvent(ev)); };
    const onUp   = ()  => { dragging = false; };

    // Pointer + mouse/touch fallbacks
    wave.addEventListener('pointerdown', onDown);
    wave.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    wave.addEventListener('mousedown', (e) => { if (!e.pointerType) onDown(e); });
    window.addEventListener('mousemove', (e) => { if (e.buttons) onMove(e); });
    window.addEventListener('mouseup', onUp);
    wave.addEventListener('touchstart',  (e) => onDown(e.touches[0]));
    wave.addEventListener('touchmove',   (e) => onMove(e.touches[0]));
    window.addEventListener('touchend',  onUp);

    // Keep progress synced while playing
    player.addEventListener('timeupdate', () => {
      if (currentRow !== row) return;
      if (!isFinite(player.duration) || player.duration <= 0) return;
      const pct = player.currentTime / player.duration;
      fill.style.width = (pct * 100).toFixed(2) + '%';
      ttime.textContent = fmtTime(player.currentTime);
    });

    player.addEventListener('ended', () => {
      if (currentRow === row) {
        fill.style.width = '0%';
        ttime.textContent = fmtTime(player.duration || 0);
      }
    });

    // Lazy build waveform when shown or first play
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        buildWaveform(row);
        io.disconnect();
      }
    }, { rootMargin: '120px' });
    io.observe(row);

    const playBtn = row.querySelector('.t-play');
    if (playBtn) playBtn.addEventListener('click', () => buildWaveform(row), { once: true });
  }

  function enhanceExisting() { $$('.track').forEach(wireScrub); }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches?.('.track')) wireScrub(n);
        n.querySelectorAll?.('.track').forEach(wireScrub);
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enhanceExisting();
      mo.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    enhanceExisting();
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();