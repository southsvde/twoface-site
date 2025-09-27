/* js/cart.js — TWOFACE cart + client-side Stripe Checkout (no server)
   - Drawer UI (button, list, qty, remove)
   - LocalStorage persistence
   - Client-side Stripe Checkout
   - Duplicates-by-priceId are merged (quantity summed) for Checkout
*/

(function () {
  const LS_KEY = 'twf.cart.v1';

  // ---------- Utils ----------
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function money(n) {
    if (!isFinite(n)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(n);
  }

  function readPublishableKey() {
    return document.querySelector('meta[name="stripe-pk"]')?.content?.trim() || '';
  }

  let stripeSingleton = null;
  function getStripe() {
    const pk = readPublishableKey();
    if (!pk || !window.Stripe) return null;
    if (!stripeSingleton) stripeSingleton = window.Stripe(pk);
    return stripeSingleton;
  }

  // ---------- State ----------
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

  // ---------- Shell (button + drawer) ----------
  function buildShell() {
    // Cart button
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

    // Drawer
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

  // ---------- Render ----------
  function render() {
    buildShell();

    const listEl  = $('.cart-list');
    const emptyEl = $('.cart-empty');
    const totalEl = $('.cart-total .total-val');

    if (!listEl || !emptyEl || !totalEl) return;

    listEl.innerHTML = '';
    if (!items.length) {
      emptyEl.style.display = '';
      totalEl.textContent = money(0);
      updateBadge();
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

  // ---------- Mutators ----------
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function add(payload) {
    // Merge by beatId + tierKey (duplicates increase qty)
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
        priceId: payload.priceId || '',   // Stripe Price ID
        url: payload.url || '',
        qty: payload.qty || 1
      });
    }
    save();
    render();
    openDrawer();
  }

  function remove(idx) { items.splice(idx, 1); save(); render(); }
  function setQty(idx, q) { items[idx].qty = Math.max(1, Math.floor(q)); save(); render(); }
  function changeQty(idx, d) { setQty(idx, (items[idx].qty || 1) + d); }
  function clear() { items = []; save(); render(); }

  // ---------- Checkout ----------
  async function checkout() {
    if (!items.length) return;

    // Require priceId for each item
    const missing = items.filter(it => !it.priceId);
    if (missing.length) {
      alert('Some items are missing Stripe price IDs. Use “Buy” for those, or add the priceId to beats.json.');
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      alert('Stripe is not available. Please check your connection or try again.');
      return;
    }

    // Group by priceId to avoid duplicate line-items with same price
    const qtyByPrice = new Map();
    for (const it of items) {
      const pid = it.priceId;
      const q   = Math.max(1, it.qty || 1);
      qtyByPrice.set(pid, (qtyByPrice.get(pid) || 0) + q);
    }

    const lineItems = Array.from(qtyByPrice.entries()).map(([price, quantity]) => ({ price, quantity }));

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
        alert(error.message || 'Unable to start checkout. Please try again.');
      }
    } catch (err) {
      console.error('[Stripe] exception:', err);
      alert(err.message || 'Unable to start checkout. Please try again.');
    }
  }

  // ---------- Public API ----------
  window.TWFCart = {
    add, remove, setQty, changeQty, clear,
    open: openDrawer, close: closeDrawer, toggle: toggleDrawer,
    render, checkout,
    _items: () => items.slice()
  };

  // Build + initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { buildShell(); render(); });
  } else {
    buildShell(); render();
  }
})();
