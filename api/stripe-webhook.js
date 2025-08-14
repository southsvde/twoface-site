// api/stripe-webhook.js
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const beats = require('../beats.json');
const { signR2Url } = require('./_lib/r2');

module.exports.config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  let event;
  const buf = await rawBody(req);
  const sig = req.headers['stripe-signature'];

  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verify failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const name = session.customer_details?.name || '';
      const { beatId, tier } = session.metadata || {};
      const beat = beats[beatId];
      if (!beat || !email) throw new Error('Missing beat/tier/email');

      const keys = beat.assets[tier];
      const links = await Promise.all(keys.map(async (k) => {
        const url = await signR2Url(k, 6 * 60 * 60); // 6h
        return { label: k.split('/').pop(), url };
      }));

      // Send email via Brevo
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: { name: process.env.FROM_NAME, email: process.env.FROM_EMAIL },
          to: [{ email, name }],
          subject: `Your ${beat.title} download`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;color:#111">
              <h2>Thanks for your purchase — ${beat.title}</h2>
              <p>License: <strong>${tier.replaceAll('_',' ').toUpperCase()}</strong></p>
              <p>Download links (valid for 6 hours):</p>
              <ul>${links.map(l => `<li><a href="${l.url}">${l.label}</a></li>`).join('')}</ul>
              <p>Questions? Reply to this email.</p>
              <hr /><p style="font-size:12px;color:#666">© TWOFACE — twfc808.com</p>
            </div>`
        })
      });
      if (!r.ok) console.error('Brevo send error:', await r.text());
    } catch (err) {
      console.error('Fulfillment error:', err);
    }
  }

  res.json({ received: true });
};
