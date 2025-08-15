// api/create-checkout-session.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { priceTier, beatName } = req.body || {};
  const priceMap = {
    mp3: process.env.PRICE_NONEX_MP3,       // $15
    wav: process.env.PRICE_NONEX_WAV,       // $20
    ex_nowav: process.env.PRICE_EXCL_NOWAV, // $70
    ex_stems: process.env.PRICE_EXCL_STEMS, // $100
  };

  const price = priceMap[priceTier];
  if (!price) return res.status(400).json({ error: "Invalid price tier" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      metadata: { beatName, priceTier },
      success_url: `${process.env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/store`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe session error" });
  }
}
