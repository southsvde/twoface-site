/* =========================================================================
   TWOFACE — Lightweight Client-Side Cart (localStorage)
   File: /js/cart.js
   -------------------------------------------------------------------------
   - Adds a Cart button with badge to the header
   - Injects a slide-in Cart drawer (no CSS files needed; styles injected)
   - Persists items in localStorage (key: twfc_cart_v1)
   - Public API (global): window.TWFCart.add(item), .open(), .clear(), ...
   - Checkout tries POST /api/checkout with [{ priceId }]; if missing/unset,
     shows a friendly message and keeps everything local.
   -------------------------------------------------------------------------
   Item shape expected by `add()`:
     {
       id: string           // unique id per cart line; default auto = beatId|tierKey
       beatId: string       // optional, for your reference
       title: string        // e.g., "BRAMPTON"
       tierKey: string      // e.g., "mp3wav"
       tierLabel: string    // e.g., "MP3 + WAV"
       price: number        // display price (USD)
       priceId?: string     // Stripe Price ID (for real checkout later)
       url?: string         // optional fallback "Buy now" link
     }
   Quantity is fixed at 1 for licensing.
   ========================================================================= */

(function () {
  const LS_KEY = 'twfc_cart_v1';

  // ---- Utilities ---------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      Number.isFinite(n) ? n : 0
    );

  function readLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function writeLS(items) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch {}
  }

  // ---- Styles (injected; scoped by cart-* classes) -----------------------
  const styles = `
  .cart-btn{position:relative;display:inline-flex;align-items:center;gap:8px;
    background:transparent;border:1px solid #2a2a30;color:#e8e8ee;cursor:pointer;
    border-radius:999px;padding:8px 12px;line-height:1}
  .cart-btn:hover{background:#19191e}
  .cart-count{min-width:18px;height:18px;border-radius:999px;background:#7d5fff;color:#fff;
    display:inline-grid;place-items:center;font-size:11px;padding:0 5px}

  .cart-root{position:fixed;inset:0;display:none;z-index:1000}
  .cart-root.open{display:block}
  .cart-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:saturate(1) blur(1.5px)}
  .cart-panel{position:absolute;top:0;right:0;width:min(420px,92vw);height:100%;background:#121216;
    border-left:1px solid #26262b;box-shadow:-8px 0 24px rgba(0,0,0,.35);display:flex;flex-direction:column}
  .cart-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #26262b}
  .cart-title{margin:0;color:#fff;font-weight:800;letter-spacing:.02em}
  .cart-close{background:#1a1b20;color:#eaeaf2;border:1px solid #2a2a30;border-radius:8px;padding:6px 10px;cursor:pointer}
  .cart-close:hover{background:#22232a}

  .cart-list{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
  .cart-empty{color:#bdbdd0;padding:18px 8px}
  .cart-item{display:flex;align-items:flex-start;gap:12px;padding:10px;border:1px solid #2a2a30;border-radius:12px;background:#151519}
  .cart-item .meta{display:flex;flex-direction:column;gap:3px;min-width:0}
  .cart-item .title{color:#fff;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cart-item .sub{color:#bdbdd0;font-size:12px}
  .cart-item .price{margin-left:auto;background:#1f1f22;border:1px solid #2a2a30;color:#eaeaf2;border-radius:999px;padding:4px 8px}
  .cart-remove{background:transparent;border:1px solid #2a2a30;color:#d0d0da;border-radius:8px;padding:6px 8px;cursor:pointer}
  .cart-remove:hover{background:#1b1b20}

  .cart-footer{border-top:1px solid #26262b;padding:12px;display:flex;flex-direction:column;gap:10px}
  .cart-row{display:flex;align-items:center;justify-content:space-between;color:#eaeaf2}
  .cart-note{color:#bdbdd0;font-size:12px}
  .cart-actions{display:flex;gap:8px}
  .btn-secondary{background:#1a1b20;color:#fff;border:1px solid #2a2a30;border-radius:10px;padding:10px 12px;cursor:pointer}
  .btn-secondary:hover{background:#22232a}
  .btn-primary{background:#7d5fff;color:#000;border:1px solid #7d5fff;border-radius:10px;padding:10px 12px;cursor:pointer}
  .btn-primary:hover{filter:brightness(.95)}
  .btn-disabled{opacity:.5;cursor:not-allowed}
  .cart-error{color:#ffb4b4;font-size:12.5px;min-height:1.3em}
  `;

  const styleTag = document.createElement('style');
  styleTag.setAttribute('data-cart-styles', 'true');
  styleTag.textContent = styles;
  document.head.appendChild(styleTag);

  // ---- DOM: header button ------------------------------------------------
  function ensureHeaderButton() {
    // Prefer putting the button at the end of .site-nav if present
    let nav = $('.site-header .site-nav');
    let container = nav || $('.site-header') || document.body;

    let btn = document.createElement('button');
    btn.className = 'cart-btn';
    btn.type = 'button';
    btn.innerHTML = `Cart <span class="cart-count">0</span>`;
    btn.addEventListener('click', () => api.open());

    container.appendChild(btn);
    return btn;
  }

  // ---- DOM: drawer -------------------------------------------------------
  function buildDrawer() {
    const root = document.createElement('div');
    root.className = 'cart-root';
    root.innerHTML = `
      <div class="cart-backdrop" tabindex="-1"></div>
      <aside class="cart-panel" role="dialog" aria-label="Shopping cart" aria-modal="true">
        <header class="cart-header">
          <h3 class="cart-title">Your Cart</h3>
          <button class="cart-close" type="button" aria-label="Close">Close</button>
        </header>
        <div class="cart-list"></div>
        <footer class="cart-footer">
          <div class="cart-row">
            <strong>Subtotal</strong>
            <span class="cart-subtotal">$0</span>
          </div>
          <div class="cart-note">Taxes & delivery handled at checkout.</div>
          <div class="cart-error" aria-live="polite"></div>
          <div class="cart-actions">
            <button class="btn-secondary" type="button" data-act="clear">Clear</button>
            <button class="btn-primary" type="button" data-act="checkout">Checkout</button>
          </div>
        </footer>
      </aside>
    `;
    document.body.appendChild(root);
    return root;
  }

  // ---- State + API -------------------------------------------------------
  let items = readLS();
  const headerBtn = ensureHeaderButton();
  const drawer = buildDrawer();
  const listEl = $('.cart-list', drawer);
  const subtotalEl = $('.cart-subtotal', drawer);
  const errorEl = $('.cart-error', drawer);
  const countBadge = headerBtn.querySelector('.cart-count');
  const closeBtn = $('.cart-close', drawer);
  const backdrop = $('.cart-backdrop', drawer);
  const checkoutBtn = $('[data-act="checkout"]', drawer);
  const clearBtn = $('[data-act="clear"]', drawer);

  function subtotal() {
    return items.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  }

  function saveAndNotify() {
    writeLS(items);
    updateUI();
    document.dispatchEvent(
      new CustomEvent('twfcart:change', { detail: { items: items.slice(), subtotal: subtotal() } })
    );
  }

  function remove(id) {
    items = items.filter((it) => it.id !== id);
    saveAndNotify();
  }

  function clear() {
    items = [];
    saveAndNotify();
  }

  function add(payload) {
    // Create a stable id if not provided: beatId|tierKey|timestamp
    const id =
      payload.id ||
      `${payload.beatId || 'item'}|${payload.tierKey || 'tier'}|${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;

    const item = {
      id,
      beatId: payload.beatId || '',
      title: payload.title || 'Untitled',
      tierKey: payload.tierKey || '',
      tierLabel: payload.tierLabel || 'License',
      price: Number(payload.price) || 0,
      priceId: payload.priceId || '',
      url: payload.url || '',
    };

    items.push(item);
    saveAndNotify();
    toast('Added to cart');
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.bottom = '18px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.background = '#1a1b20';
    el.style.border = '1px solid #2a2a30';
    el.style.color = '#eaeaf2';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 6px 16px rgba(0,0,0,.35)';
    el.style.zIndex = 1001;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function lineView(it) {
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="meta">
        <div class="title">${escapeHtml(it.title)}</div>
        <div class="sub">${escapeHtml(it.tierLabel)}</div>
      </div>
      <div class="price">${money(Number(it.price) || 0)}</div>
      <button class="cart-remove" type="button">Remove</button>
    `;
    row.querySelector('.cart-remove').addEventListener('click', () => remove(it.id));
    return row;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateUI() {
    // Badge
    const n = items.length;
    countBadge.textContent = String(n);

    // List
    listEl.innerHTML = '';
    if (!n) {
      const empty = document.createElement('div');
      empty.className = 'cart-empty';
      empty.textContent = 'Your cart is empty.';
      listEl.appendChild(empty);
    } else {
      items.forEach((it) => listEl.appendChild(lineView(it)));
    }

    // Subtotal
    subtotalEl.textContent = money(subtotal());

    // Checkout enabled only if every item has priceId
    const allHavePriceIds = items.every((it) => it.priceId && typeof it.priceId === 'string');
    checkoutBtn.classList.toggle('btn-disabled', !allHavePriceIds || !n);
    checkoutBtn.disabled = !allHavePriceIds || !n;

    errorEl.textContent = '';
  }

  function open() {
    drawer.classList.add('open');
    // focus trap to drawer
    setTimeout(() => {
      const focusable = drawer.querySelector('.cart-close');
      focusable && focusable.focus();
    }, 0);
    document.addEventListener('keydown', onKey);
  }

  function close() {
    drawer.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    headerBtn.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  async function checkout() {
    errorEl.textContent = '';

    if (!items.length) return;

    // Guard: ensure we have priceIds
    const missing = items.filter((i) => !i.priceId);
    if (missing.length) {
      errorEl.textContent =
        'Some items don’t support multi-item checkout yet. Use “Buy” on those items or try again later.';
      return;
    }

    // Try calling /api/checkout (will work once backend is set)
    try {
      const resp = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ priceId: i.priceId })) }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || 'Checkout isn’t configured yet.');
      }

      // Redirect to Stripe
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      errorEl.textContent = String(err.message || err) || 'Checkout error. Please try again.';
    }
  }

  // Wire drawer controls
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  clearBtn.addEventListener('click', () => {
    clear();
    toast('Cart cleared');
  });
  checkoutBtn.addEventListener('click', checkout);

  // Public API
  const api = {
    open,
    close,
    add,
    remove,
    clear,
    get items() {
      return items.slice();
    },
    subtotal,
  };
  window.TWFCart = api;

  // Initialize UI with stored items
  updateUI();

  // Optional: open cart when visiting with ?cart=1
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('cart') === '1') open();
  } catch {}
})();