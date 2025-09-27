// js/accent-from-cover.js
// Derive a nice accent color from the cover image.
// Apply it to the row via --row-accent for the waveform ONLY.
// Do NOT style the play/pause button here.

(() => {
  function pickAccentFrom(img) {
    // downscale to keep it fast
    const w = 24, h = 24;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    c.width = w; c.height = h;

    try { ctx.drawImage(img, 0, 0, w, h); } catch { return null; }
    const { data } = ctx.getImageData(0, 0, w, h);

    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
      if (A < 200) continue;                // ignore transparent
      const max = Math.max(R, G, B), min = Math.min(R, G, B);
      if (max < 25 || min > 235) continue;  // ignore near-black / near-white
      r += R; g += G; b += B; n++;
    }
    if (!n) return null;
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function initRow(row) {
    const img = row.querySelector('.t-art img');
    if (!img) return;

    const apply = () => {
      const color = pickAccentFrom(img);
      if (color) row.style.setProperty('--row-accent', color);

      // IMPORTANT: keep play button neutral — clear any old inline styles
      const btn = row.querySelector('.t-ctrl button');
      if (btn) {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    };

    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#tracks .track').forEach(initRow);

    // in case rows are rendered after load
    const host = document.querySelector('#tracks');
    if (!host) return;
    const mo = new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && n.classList.contains('track')) initRow(n);
      }));
    });
    mo.observe(host, { childList: true });
  });
})();