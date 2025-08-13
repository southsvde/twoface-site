
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
