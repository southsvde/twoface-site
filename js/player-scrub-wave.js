// js/player-scrub-wave.js
// Enhances the existing mini-player with scrubbing + real waveform drawing.
// Safe add-on: does not modify your beats.js, only augments rows after they render.

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---- Use a shared audio element if your code exposed one; otherwise create one ----
  function getPlayer() {
    // Prefer a global you may already have
    if (window.__twfPlayer) return window.__twfPlayer;
    if (window.player instanceof Audio) return (window.__twfPlayer = window.player);
    // Fallback: we make our own, but still work fine with scrubbing/visuals
    return (window.__twfPlayer = new Audio());
  }
  const player = getPlayer();

  // Keep a reference to the current active row if your main player didn’t set one.
  let currentRow = null;

  // ---- TIME UTILS ----
  const fmtTime = (sec) => {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ---- WAVEFORM: decode audio and draw peaks into a <canvas> we insert ----
  async function buildWaveform(row) {
    if (row.__waveBuilt) return;
    const src = row.dataset.src;
    const hostOk = typeof src === 'string' && src.length > 0;
    if (!hostOk) return;

    // container (bar background)
    const container = row.querySelector('.t-wave');
    if (!container) return;

    // create canvas on first run
    let canvas = container.querySelector('canvas.wave-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'wave-canvas';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.opacity = '0.9';
      // Insert below the progress overlay but above the plain background
      const bars = container.querySelector('.wave-bars');
      bars ? bars.appendChild(canvas) : container.prepend(canvas);
    }

    try {
      // Fetch audio and decode (requires CORS allowed by your R2/public source)
      const resp = await fetch(src, { mode: 'cors', cache: 'force-cache' });
      const buf  = await resp.arrayBuffer();
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(buf);

      // Build peaks
      const channelDataL = audioBuffer.getChannelData(0);
      const channelDataR = audioBuffer.numberOfChannels > 1
        ? audioBuffer.getChannelData(1)
        : null;

      // Determine how many bars fit into container
      const pr  = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      const W = Math.max(200, Math.floor(rect.width * pr));
      const H = Math.max(40,  Math.floor(rect.height * pr));
      canvas.width  = W;
      canvas.height = H;

      const gap = 3 * pr;           // px between bars
      const barW = 2 * pr;          // bar width
      const count = Math.max(60, Math.floor(W / (barW + gap)));

      const blockSize = Math.floor(audioBuffer.length / count);
      const peaks = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const start = i * blockSize;
        const end   = Math.min(start + blockSize, audioBuffer.length);
        let peak = 0;
        for (let j = start; j < end; j += 32) {                 // stride for speed
          const a = Math.abs(channelDataL[j] || 0);
          const b = channelDataR ? Math.abs(channelDataR[j] || 0) : 0;
          const v = Math.max(a, b);
          if (v > peak) peak = v;
        }
        // Log scale mapping (~dB-ish) so quiet parts are visible
        const db = 20 * Math.log10(peak + 1e-4);               // -80..0
        const norm = Math.min(1, Math.max(0, (db + 60) / 60)); // map [-60..0] -> [0..1]
        peaks[i] = norm;
      }

      // Draw
      const ctx2 = canvas.getContext('2d');
      ctx2.clearRect(0, 0, W, H);
      ctx2.fillStyle = '#262634'; // background bars color
      const mid = H / 2;
      for (let i = 0; i < count; i++) {
        const x = Math.floor(i * (barW + gap));
        const h = Math.max(2, Math.round(peaks[i] * (H * 0.85)));
        const y = mid - h / 2;
        ctx2.fillRect(x, y, barW, h);
      }

      row.__waveBuilt = true;
    } catch (err) {
      // If CORS / decode fails, we silently keep your CSS repeating gradient
      console.debug('[waveform] decode skipped:', err?.message || err);
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
      const clamped = Math.max(0, Math.min(r.width, x));
      return clamped / r.width;
    };

    const setFromPct = (pct) => {
      pct = Math.max(0, Math.min(1, pct));
      // If this row is not the active source yet, prepare it
      const src = row.dataset.src || '';
      const isSame = src && player.src && player.src.includes(src);
      if (!isSame) {
        // load source but don't auto play; jump after metadata
        player.src = src;
      }
      if (isFinite(player.duration) && player.duration > 0) {
        player.currentTime = pct * player.duration;
        fill.style.width = (pct * 100).toFixed(2) + '%';
        ttime.textContent = fmtTime(player.currentTime);
      } else {
        // Wait for metadata then set time
        const once = () => {
          player.currentTime = pct * (player.duration || 0);
          fill.style.width = (pct * 100).toFixed(2) + '%';
          ttime.textContent = fmtTime(player.currentTime);
          player.removeEventListener('loadedmetadata', once);
        };
        player.addEventListener('loadedmetadata', once, { once: true });
      }
      currentRow = row;
    };

    const onDown = (ev) => {
      dragging = true;
      wave.setPointerCapture?.(ev.pointerId ?? 1);
      setFromPct(pctFromEvent(ev));
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!dragging) return;
      setFromPct(pctFromEvent(ev));
    };
    const onUp = () => { dragging = false; };

    // Pointer for modern browsers; fallback to mouse/touch
    wave.addEventListener('pointerdown', onDown);
    wave.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    wave.addEventListener('mousedown', (e) => { if (e.pointerType) return; onDown(e); });
    window.addEventListener('mousemove', (e) => { if (e.buttons) onMove(e); });
    window.addEventListener('mouseup', onUp);
    wave.addEventListener('touchstart',  (e) => onDown(e.touches[0]));
    wave.addEventListener('touchmove',   (e) => onMove(e.touches[0]));
    window.addEventListener('touchend',  onUp);

    // Keep progress in sync while playing
    player.addEventListener('timeupdate', () => {
      if (!currentRow || currentRow !== row) return;
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

    // Build waveform lazily (first interaction or when row is on screen)
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        buildWaveform(row);
        io.disconnect();
      }
    }, { rootMargin: '120px' });
    io.observe(row);

    // Also build when play button is pressed (if your main code sets it)
    const playBtn = row.querySelector('.t-play');
    if (playBtn) playBtn.addEventListener('click', () => buildWaveform(row), { once: true });
  }

  // ---- Enhance all rows that exist now + rows added later by beats.js ----
  function enhanceExisting() { $$('.track').forEach(wireScrub); }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes?.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.matches?.('.track')) wireScrub(n);
          // If a section injects several tracks at once:
          n.querySelectorAll?.('.track').forEach(wireScrub);
        }
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