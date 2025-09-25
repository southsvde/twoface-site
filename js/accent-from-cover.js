// js/accent-from-cover.js
(() => {
  const processed = new WeakSet();

  function chooseDominantColor(img) {
    // Draw a tiny version to canvas and tally colors
    const w = 32, h = 32;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    try {
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Quantize to 32 levels per channel to reduce noise
      const bucket = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 200) continue; // ignore mostly transparent
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // Skip near black/white & very desaturated greys
        const sum = r + g + b;
        if (sum < 45) continue;      // ~pure black
        if (sum > 735) continue;     // ~pure white
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 10) continue; // very grey

        const qr = r >> 3, qg = g >> 3, qb = b >> 3; // 0..31
        const key = (qr << 10) | (qg << 5) | qb;
        bucket.set(key, (bucket.get(key) || 0) + 1);
      }

      if (bucket.size === 0) return null;
      // Pick the most frequent bucket
      let bestKey = null, bestCount = -1;
      for (const [k, v] of bucket) if (v > bestCount) { bestKey = k; bestCount = v; }

      const qr = (bestKey >> 10) & 31, qg = (bestKey >> 5) & 31, qb = bestKey & 31;
      // Expand back to 0..255 range (center of bucket)
      const r = (qr << 3) + 4, g = (qg << 3) + 4, b = (qb << 3) + 4;
      return { r, g, b };
    } catch {
      // Cross-origin image would taint the canvas
      return null;
    }
  }

  function luminance({ r, g, b }) {
    // WCAG relative luminance
    const toLin = c => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }

  function applyAccentFromImage(img, trackEl) {
    if (processed.has(img)) return;
    const col = chooseDominantColor(img);
    if (!col) { processed.add(img); return; }

    // Normalize lightness a bit (keep roughly mid/bright range)
    // Convert to HSL, lift lightness into a nice button range (~0.55–0.7)
    const r = col.r / 255, g = col.g / 255, b = col.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    const targetL = Math.min(0.70, Math.max(0.55, l * 1.15)); // gentle lift
    const toRGB = (h, s, l) => {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      let rr, gg, bb;
      if (s === 0) { rr = gg = bb = l; }
      else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        rr = hue2rgb(p, q, h + 1 / 3);
        gg = hue2rgb(p, q, h);
        bb = hue2rgb(p, q, h - 1 / 3);
      }
      return {
        r: Math.round(rr * 255),
        g: Math.round(gg * 255),
        b: Math.round(bb * 255)
      };
    };
    const tuned = toRGB(h, s, targetL);
    const rgb = `rgb(${tuned.r}, ${tuned.g}, ${tuned.b})`;

    trackEl.style.setProperty('--row-accent', rgb);

    // Pick glyph color for contrast
    const lum = luminance(tuned);
    const glyph = lum < 0.55 ? '#fff' : '#000';
    trackEl.style.setProperty('--row-glyph', glyph);

    processed.add(img);
  }

  // Observe tracks as they appear (works even if rows are rendered later)
  function scan(container) {
    const rows = container.querySelectorAll('.track');
    rows.forEach(track => {
      const img = track.querySelector('.t-art img, .art img, img');
      if (!img) return;
      img.crossOrigin = 'anonymous'; // keep canvas readable for same-origin
      if (img.complete) applyAccentFromImage(img, track);
      else img.addEventListener('load', () => applyAccentFromImage(img, track), { once: true });
    });
  }

  const tracks = document.getElementById('tracks');
  if (!tracks) return;

  // Initial pass + watch for changes
  scan(tracks);
  const mo = new MutationObserver(() => scan(tracks));
  mo.observe(tracks, { childList: true, subtree: true });
})();
