/* js/accent-from-cover.js  — replace file */

(() => {
  const SEL_ROW   = '#tracks .track';
  const SEL_IMG   = '.t-art img, .cover img, img';

  // Average a small center region; fast & stable
  function getDominantRGB(img) {
    const w = Math.max(24, Math.min(128, img.naturalWidth  || 64));
    const h = Math.max(24, Math.min(128, img.naturalHeight || 64));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    // sample center 1/3 area
    const sx = Math.floor(w / 3), sy = Math.floor(h / 3);
    const sw = Math.floor(w / 3),  sh = Math.floor(h / 3);
    const data = ctx.getImageData(sx, sy, sw, sh).data;

    let r=0,g=0,b=0, count=0;
    for (let i=0; i<data.length; i+=4) {
      r += data[i];   g += data[i+1]; b += data[i+2]; count++;
    }
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    return [r,g,b];
  }

  function luminance([r,g,b]) {
    const sr = r/255, sg = g/255, sb = b/255;
    const f = x => (x<=0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4));
    return 0.2126*f(sr) + 0.7152*f(sg) + 0.0722*f(sb);
  }

  function applyAccent(row, img) {
    try {
      const rgb = getDominantRGB(img);                // [r,g,b]
      const rgbStr = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      const glyph  = luminance(rgb) > 0.5 ? '#000' : '#fff';

      row.style.setProperty('--row-accent',     `rgb(${rgbStr})`);
      row.style.setProperty('--row-accent-rgb', rgbStr);  // NEW
      row.style.setProperty('--row-glyph',      glyph);
    } catch {}
  }

  function initRow(row) {
    const img = row.querySelector(SEL_IMG);
    if (!img) return;
    if (img.complete && img.naturalWidth) applyAccent(row, img);
    else img.addEventListener('load', () => applyAccent(row, img), { once:true });
  }

  // Existing rows
  document.querySelectorAll(SEL_ROW).forEach(initRow);

  // Future rows (rendered by JS)
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.(SEL_ROW)) initRow(node);
        node.querySelectorAll?.(SEL_ROW).forEach(initRow);
      });
    }
  });
  obs.observe(document.body, { childList:true, subtree:true });
})();
