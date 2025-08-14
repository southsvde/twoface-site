// api/checkout.js
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const beats = require('../beats.json');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { beatId, tier } = req.body || {};
    const beat = beats[beatId];
    if (!beat) return res.status(400).json({ error: 'Invalid beat' });
    const lookupKey = beat.prices[tier];
    if (!lookupKey) return res.status(400).json({ error: 'Invalid tier' });

    // Get latest active Price by lookup_key
    const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1, expand: ['data.product'] });
    const price = data[0];
    if (!price) return res.status(400).json({ error: 'Price not found (check lookup_key in Stripe)' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { beatId, tier },
      success_url: `${process.env.SITE_URL}/beats.html?status=success`,
      cancel_url:  `${process.env.SITE_URL}/beats.html?status=cancelled`
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Checkout init failed' });
  }
};
