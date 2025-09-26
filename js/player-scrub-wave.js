// js/player-scrub-wave.js
// Mini player scrubbing & progress that only updates the ACTIVE row.
// Assumes your global/shared Audio() is accessible as `window.player` (or adjust below).

(() => {
  const player = window.player || window.twfcPlayer || window.audio || null;
  if (!player) {
    console.warn('[scrub] No shared Audio() found on window.');
    return;
  }

  function getActiveRow() {
    return document.querySelector('.track.is-playing');
  }
  function getActiveEls() {
    const row = getActiveRow();
    if (!row) return {};
    return {
      row,
      wave: row.querySelector('.t-wave'),
      bar: row.querySelector('.wave-progress'),
      time: row.querySelector('.t-time')
    };
  }
  function fmtTime(sec) {
    if (isNaN(sec) || sec === Infinity) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ---- Progress updates (ONLY active row) ----
  const onTime = () => {
    const { bar, wave, time } = getActiveEls();
    if (!bar || !wave) return;
    const dur = player.duration || 0;
    const cur = player.currentTime || 0;
    const pct = dur ? (cur / dur) * 100 : 0;
    bar.style.width = `${pct}%`;
    wave.setAttribute('aria-valuenow', Math.round(pct));
    if (time) time.textContent = fmtTime(cur);
  };

  const onMeta = () => {
    const { time } = getActiveEls();
    if (time) time.textContent = fmtTime(player.duration || 0);
  };

  const onEnded = () => {
    const { bar, time } = getActiveEls();
    if (bar) bar.style.width = '0%';
    if (time) time.textContent = fmtTime(player.duration || 0);
  };

  // remove any old duplicates then attach once
  player.removeEventListener?.('timeupdate', player.__tw_time);
  player.removeEventListener?.('loadedmetadata', player.__tw_meta);
  player.removeEventListener?.('ended', player.__tw_end);

  player.__tw_time = onTime;
  player.__tw_meta = onMeta;
  player.__tw_end = onEnded;

  player.addEventListener('timeupdate', onTime);
  player.addEventListener('loadedmetadata', onMeta);
  player.addEventListener('ended', onEnded);

  // ---- Scrubbing (delegated) ----
  let dragging = false;

  function percentFromEvent(e, waveEl) {
    const rect = waveEl.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return rect.width ? x / rect.width : 0;
  }

  function seekToPct(pct) {
    if (!isFinite(player.duration) || player.duration <= 0) return;
    player.currentTime = pct * player.duration;
    onTime();
  }

  function onPointerDown(e) {
    const target = e.target.closest('.t-wave');
    if (!target) return;
    const active = getActiveRow();
    const row = e.target.closest('.track');
    // only allow scrubbing on the active row
    if (!active || row !== active) return;

    e.preventDefault();
    dragging = true;
    target.setPointerCapture?.(e.pointerId);
    seekToPct(percentFromEvent(e, target));
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const { wave } = getActiveEls();
    if (!wave) return;
    seekToPct(percentFromEvent(e, wave));
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const { wave } = getActiveEls();
    wave?.releasePointerCapture?.(e.pointerId);
  }

  // Use pointer events so it works with mouse & touch
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
})();
