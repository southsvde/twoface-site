
// Minimal merch data with Stripe link placeholders (replace '#' with real Payment Links)
const merch = [
// UPDATE ME
  { title: "Dad Hat", price: 30, link: "https://buy.stripe.com/...", sizes: [] },
  { title: "T-Shirt", price: 35, link: "https://buy.stripe.com/...", sizes: ["S","M","L","XL"] },
  { title: "Hoodie", price: 60, link: "https://buy.stripe.com/...", sizes: ["S","M","L","XL"] },
];

const grid = document.getElementById('merchGrid');
merch.forEach(item => {
  const el = document.createElement('article');
  el.className = 'card';
  const sizes = item.sizes && item.sizes.length ? `<div class="sizes">${item.sizes.join(" / ")}</div>` : "";
  el.innerHTML = `
    <h4>${item.title}</h4>
    <div class="price">${item.price ? '$'+item.price : 'Price TBA'}</div>
    ${sizes}
    <div class="actions">
      <a class="btn small" ${item.link === '#' ? 'aria-disabled="true"' : ''} href="${item.link}" target="_blank" rel="noopener">Buy</a>
    </div>
  `;
  grid.appendChild(el);
});

// Simple ICS file for a TBD November date — defaults to Nov 15 at 8pm local if user doesn't edit
document.getElementById('addToCalendarBtn')?.addEventListener('click', () => {
  const year = new Date().getFullYear();
  const dt = new Date(year, 10, 15, 20, 0, 0); // Nov (month=10), 15th, 8pm
  const dtUTC = dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtEndUTC = new Date(dt.getTime() + 2*60*60*1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TWOFACE//Site//EN',
    'BEGIN:VEVENT',
    `UID:twoface-pianos-${year}@twoface`,
    `DTSTAMP:${dtUTC}`,
    `DTSTART:${dtUTC}`,
    `DTEND:${dtEndUTC}`,
    'SUMMARY:TWOFACE at Pianos (NYC)',
    'LOCATION:Pianos, New York, NY',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'twoface-pianos.ics';
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
});

/* === Email form: AJAX submit to Formspree so the page doesn't navigate away === */
(function () {
  // Get elements
  const form = document.getElementById('emailForm');
  const status = document.getElementById('formStatus');

  if (!form) return; // safety if form isn't on this page

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); // keep user on the page
    status.textContent = 'Sending…';

    // Collect form data
    const formData = new FormData(form);
    const email = formData.get('email');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        // Formspree expects JSON; include only what you need
        body: JSON.stringify({ email })
      });

      if (res.ok) {
        form.reset();
        status.textContent = 'Thanks — check your inbox!';
      } else {
        // Try to read any error message from Formspree
        const data = await res.json().catch(() => ({}));
        status.textContent = data?.errors?.[0]?.message || 'Oops — something went wrong. Try again in a minute.';
      }
    } catch (err) {
      status.textContent = 'Network error — please try again.';
    }
  });
})();

// js/beats.js (example)
// Verbose + commented for clarity, per your style preference:

async function loadBeats() {
  const container = document.querySelector('#beats-list'); // an element in beats.html
  if (!container) return;

  try {
    // Local dev path; works on Vercel too since /data is deployed as static assets
    const res = await fetch('data/beats.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const beats = await res.json();

    // Clear any previous error
    container.innerHTML = '';

    // Render each beat as a card with an audio player + license button
    beats.forEach(beat => {
      const card = document.createElement('article');
      card.className = 'beat-card';

      card.innerHTML = `
        <div class="beat-meta">
          <h3>${beat.title}</h3>
          <p class="muted">BPM ${beat.bpm} • Key ${beat.key}</p>
        </div>

        <audio
          controls
          preload="none"
          src="${beat.audioUrl}">
            Your browser does not support the audio element.
        </audio>

        <div class="beat-actions">
          <a class="btn" href="${beat.licenseUrl}" target="_blank" rel="noopener">License</a>
        </div>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error('Failed to load beats:', err);
    const fallback = document.querySelector('#beats-error');
    if (fallback) {
      fallback.textContent = `Couldn’t load beats. Check data/beats.json path. (${err.message})`;
      fallback.style.display = 'block';
    }
  }
}

// Kick it off on page load
document.addEventListener('DOMContentLoaded', loadBeats);

