/* js/cart.js — TWOFACE cart + client-side Stripe Checkout (no server) */

(function () {
  const LS_KEY = 'twf.cart.v1';

  // --- Utilities -----------------------------------------------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function money(n) {
    if (!isFinite(n)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(n);
  }

  function readPublishableKey() {
    return document.querySelector('meta[name="stripe-pk"]')?.content?.trim() || '';
  }

  function ensureStripe() {
    const pk = readPublishableKey();
    if (!pk) return null;
    if (!window.Stripe) return null;
    return window.Stripe(pk);
  }

  // --- State ---------------------------------------------------------------
  let items = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) items = JSON.parse(raw) || [];
  } catch { items = []; }

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    updateBadge();
  }

  function cartCount() {
    return items.reduce((a, b) => a + (b.qty || 1), 0);
  }

  function cartTotal() {
    return items.reduce((a, b) => a + (Number(b.price) || 0) * (b.qty || 1), 0);
  }

  // --- DOM: Button + Drawer -----------------------------------------------
  function buildShell() {
    // Cart button (top-right on desktop; fixed bottom-right on mobile via your CSS)
    if (!$('.cart-btn')) {
      const btn = document.createElement('button');
      btn.className = 'cart-btn';
      btn.type = 'button';
      btn.innerHTML = `
        <span class="icon">🛒</span>
        <span class="label">Cart</span>
        <span class="cart-badge">0</span>
      `;
      btn.addEventListener('click', toggleDrawer);
      document.body.appendChild(btn);
    }

    // Drawer shell
    if (!$('.cart-drawer')) {
      const wrap = document.createElement('aside');
      wrap.className = 'cart-drawer';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.innerHTML = `
        <div class="cart-backdrop"></div>
        <div class="cart-panel" role="dialog" aria-label="Cart">
          <header class="cart-head">
            <h4>Cart</h4>
            <button class="cart-close" type="button" aria-label="Close">✕</button>
          </header>
          <div class="cart-body">
            <div class="cart-empty">Your cart is empty.</div>
            <ul class="cart-list"></ul>
          </div>
          <footer class="cart-foot">
            <div class="cart-total">
              <span>Total</span>
              <strong class="total-val">$0</strong>
            </div>
            <button class="btn-checkout" type="button">Checkout</button>
          </footer>
        </div>
      `;
      document.body.appendChild(wrap);

      $('.cart-close', wrap).addEventListener('click', closeDrawer);
      $('.cart-backdrop', wrap).addEventListener('click', closeDrawer);
      $('.btn-checkout', wrap).addEventListener('click', checkout);
    }
  }

  function updateBadge() {
    const badge = $('.cart-btn .cart-badge');
    if (badge) badge.textContent = String(cartCount());
  }

  function openDrawer() {
    const d = $('.cart-drawer');
    if (!d) return;
    d.setAttribute('aria-hidden', 'false');
    d.classList.add('open');
    document.body.classList.add('cart-open');
    render();
  }

  function closeDrawer() {
    const d = $('.cart-drawer');
    if (!d) return;
    d.setAttribute('aria-hidden', 'true');
    d.classList.remove('open');
    document.body.classList.remove('cart-open');
  }

  function toggleDrawer() {
    const d = $('.cart-drawer');
    if (!d) return;
    if (d.classList.contains('open')) closeDrawer();
    else openDrawer();
  }

  // --- Render --------------------------------------------------------------
  function render() {
    buildShell();

    const listEl = $('.cart-list');
    const emptyEl = $('.cart-empty');
    const totalEl = $('.cart-total .total-val');

    if (!listEl || !emptyEl || !totalEl) return;

    listEl.innerHTML = '';
    if (!items.length) {
      emptyEl.style.display = '';
      totalEl.textContent = money(0);
      return;
    }
    emptyEl.style.display = 'none';

    items.forEach((it, idx) => {
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <div class="ci-main">
          <div class="ci-title">${escapeHtml(it.title || 'Untitled')}</div>
          <div class="ci-sub">${escapeHtml(it.tierLabel || it.tierKey || 'License')}</div>
        </div>
        <div class="ci-qty">
          <button class="qty-dec" aria-label="Decrease">–</button>
          <input class="qty-input" type="number" inputmode="numeric" min="1" value="${it.qty || 1}">
          <button class="qty-inc" aria-label="Increase">+</button>
        </div>
        <div class="ci-price">${money(Number(it.price) || 0)}</div>
        <button class="ci-remove" aria-label="Remove">✕</button>
      `;

      $('.qty-dec', li).addEventListener('click', () => changeQty(idx, -1));
      $('.qty-inc', li).addEventListener('click', () => changeQty(idx, +1));
      $('.qty-input', li).addEventListener('input', (e) => setQty(idx, Number(e.target.value) || 1));
      $('.ci-remove', li).addEventListener('click', () => remove(idx));
      listEl.appendChild(li);
    });

    totalEl.textContent = money(cartTotal());
    updateBadge();
  }

  // --- Mutators ------------------------------------------------------------
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function add(payload) {
    // Merge by beatId + tierKey (so duplicates increase qty)
    const key = (payload.beatId || payload.id || 'beat') + '::' + (payload.tierKey || payload.tierLabel || '');
    const found = items.find(i => i._k === key);
    if (found) {
      found.qty = (found.qty || 1) + (payload.qty || 1);
    } else {
      items.push({
        _k: key,
        beatId: payload.beatId || payload.id || 'beat',
        title: payload.title || 'Untitled',
        tierKey: payload.tierKey || '',
        tierLabel: payload.tierLabel || payload.tierKey || 'License',
        price: Number(payload.price) || 0,
        priceId: payload.priceId || '',  // Stripe Price ID (preferred)
        url: payload.url || '',
        qty: payload.qty || 1
      });
    }
    save();
    render();
    openDrawer();
  }

  function remove(idx) {
    items.splice(idx, 1);
    save();
    render();
  }

  function setQty(idx, q) {
    items[idx].qty = Math.max(1, Math.floor(q));
    save();
    render();
  }

  function changeQty(idx, d) {
    setQty(idx, (items[idx].qty || 1) + d);
  }

  function clear() {
    items = [];
    save();
    render();
  }

  // --- Checkout ------------------------------------------------------------
  async function checkout() {
    if (!items.length) return;

    // Require priceId for each item
    const missing = items.filter(it => !it.priceId);
    if (missing.length) {
      alert('Some items are missing Stripe price IDs. Use “Buy” for those, or add the priceId to beats.json.');
      return;
    }

    const stripe = ensureStripe();
    if (!stripe) {
      alert('Stripe is not available. Please check your internet connection or try again.');
      return;
    }

    const lineItems = items.map(it => ({
      price: it.priceId,
      quantity: Math.max(1, it.qty || 1)
    }));

    // Your domain (committed to memory)
    const domain = 'https://twfc808.com';
    const successUrl = `${domain}/beats.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${domain}/beats.html?checkout=cancel`;

    try {
      const { error } = await stripe.redirectToCheckout({
        mode: 'payment',
        lineItems,
        successUrl,
        cancelUrl
      });
      if (error) {
        console.error('[Stripe] redirectToCheckout error:', error);
        alert(error.message || 'Checkout failed to start.');
      }
    } catch (err) {
      console.error('[Stripe] exception:', err);
      alert('Unable to start checkout. Please try again.');
    }
  }

  // --- Expose API ----------------------------------------------------------
  window.TWFCart = {
    add, remove, setQty, changeQty, clear,
    open: openDrawer,
    close: closeDrawer,
    toggle: toggleDrawer,
    render,
    checkout,
    _items: () => items.slice()
  };

  // Build UI and initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildShell(); render(); });
  } else {
    buildShell(); render();
  }


(function () {
  // Try to find your existing Checkout button (keeps styling intact).
  const checkoutBtn =
    document.querySelector('.cart-drawer .btn-checkout') ||
    document.querySelector('.btn-checkout') ||
    document.getElementById('checkout');

  if (!checkoutBtn) return; // nothing to do on pages without the cart

  // Pull publishable key (we already put this meta in beats.html).
  function getStripePublishableKey() {
    return (
      window.STRIPE_PK ||
      document.querySelector('meta[name="stripe-pk"]')?.content ||
      ''
    );
  }

  let stripeSingleton = null;
  function getStripe() {
    const pk = getStripePublishableKey();
    if (!pk || !window.Stripe) return null;
    if (!stripeSingleton) stripeSingleton = Stripe(pk);
    return stripeSingleton;
  }

  // Your live site domain + success/cancel (same as beats.js).
  const SITE_ORIGIN = 'https://twfc808.com';
  const STRIPE_SUCCESS_URL = `${SITE_ORIGIN}/success.html?session_id={CHECKOUT_SESSION_ID}`;
  const STRIPE_CANCEL_URL  = `${SITE_ORIGIN}/beats.html`;

  // Read items from your cart without assuming a specific implementation.
  function getCartItems() {
    // 1) Common patterns on a global cart object
    if (Array.isArray(window.TWFCart?.items)) return window.TWFCart.items;
    if (typeof window.TWFCart?.getItems === 'function') return window.TWFCart.getItems();
    if (typeof window.TWFCart?.list === 'function')     return window.TWFCart.list();

    // 2) Fallback: localStorage (very common)
    try {
      const raw = localStorage.getItem('twf_cart') || localStorage.getItem('TWFCart') || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (parsed.items || []);
    } catch (_) {
      return [];
    }
  }

  async function startCheckout() {
    const stripe = getStripe();
    if (!stripe) {
      alert('Checkout is not ready (Stripe key not found).');
      return;
    }

    const items = getCartItems();

    // Only include items that have a priceId (your beats.json already provides these)
    const lineItems = items
      .map(i => ({
        price: i.priceId || i.price_id || i.stripePriceId || '',
        quantity: i.qty || i.quantity || 1
      }))
      .filter(li => !!li.price);

    if (!lineItems.length) {
      alert('Your cart has no items that can be checked out yet.');
      return;
    }

    checkoutBtn.disabled = true;
    try {
      const { error } = await stripe.redirectToCheckout({
        lineItems,
        mode: 'payment',
        successUrl: STRIPE_SUCCESS_URL,
        cancelUrl: STRIPE_CANCEL_URL
      });
      if (error) {
        console.error('[Stripe] redirect error:', error);
        alert('Unable to start checkout. Please try again.');
      }
    } finally {
      checkoutBtn.disabled = false;
    }
  }

  checkoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    startCheckout();
  });




  
})();
