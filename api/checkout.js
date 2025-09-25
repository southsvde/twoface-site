// /api/checkout.js  — Vercel Serverless Function (Node.js)
// Creates a Stripe Checkout Session for items in the local cart.
// - Reads allowed priceIds from /beats.json (your source of truth)
// - Validates the incoming cart against that whitelist
// - Uses Stripe REST API via fetch (no npm deps required)

const fs = require('fs');
const path = require('path');

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // basic CORS so you can call this from your site
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method Not Allowed' });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return send(res, 500, { error: 'Missing STRIPE_SECRET_KEY env var' });
  }

  // --- Build a whitelist of allowed Stripe price IDs from beats.json ---
  let allowedPriceIds = new Set();
  try {
    const beatsPath = path.join(process.cwd(), 'beats.json'); // root-level beats.json
    const raw = fs.readFileSync(beatsPath, 'utf8');
    const beats = JSON.parse(raw);

    const TIER_KEYS = ['mp3', 'mp3wav', 'excl_nowav', 'excl_stems'];
    for (const beat of Array.isArray(beats) ? beats : []) {
      const tiers = beat && beat.tiers ? beat.tiers : {};
      for (const key of TIER_KEYS) {
        const t = tiers[key];
        if (t && typeof t === 'object' && typeof t.priceId === 'string' && t.priceId.trim()) {
          allowedPriceIds.add(t.priceId.trim());
        }
      }
    }
  } catch (err) {
    console.error('Failed to read beats.json:', err);
    return send(res, 500, { error: 'Server config error (beats.json not readable)' });
  }

  // --- Parse body ---
  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    // ignore, will fail validation below
  }

  const items = (body && Array.isArray(body.items)) ? body.items : [];
  if (!items.length) {
    return send(res, 400, { error: 'Cart is empty' });
  }
  if (items.length > 50) {
    return send(res, 400, { error: 'Too many items' });
  }

  // Validate every priceId against whitelist; coerce quantity to 1
  const sanitized = [];
  for (const it of items) {
    const priceId = (it && it.priceId && String(it.priceId)) || '';
    if (!allowedPriceIds.has(priceId)) {
      return send(res, 400, { error: `Invalid priceId: ${priceId || '(missing)'}` });
    }
    sanitized.push({ price: priceId, quantity: 1 });
  }

  // Success/cancel URLs (derive base from request)
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers.host || 'twfc808.com';
  const base  = `${proto}://${host}`;

  // Build form-encoded payload for Stripe REST API
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('automatic_tax[enabled]', 'true'); // optional but nice
  // You can switch to 'required' if you want full address
  params.append('billing_address_collection', 'auto');

  // line_items[n][price], line_items[n][quantity]
  sanitized.forEach((li, i) => {
    params.append(`line_items[${i}][price]`, li.price);
    params.append(`line_items[${i}][quantity]`, String(li.quantity || 1));
  });

  // Where to return after payment
  params.append('success_url', `${base}/beats.html?success=1&session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${base}/beats.html?canceled=1`);

  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const json = await resp.json();
    if (!resp.ok) {
      console.error('Stripe error:', json);
      return send(res, 400, { error: json.error?.message || 'Stripe error' });
    }

    // Send back the Checkout URL to redirect on the client
    return send(res, 200, { url: json.url });
  } catch (err) {
    console.error('Checkout create error:', err);
    return send(res, 500, { error: 'Unable to create Checkout Session' });
  }
};