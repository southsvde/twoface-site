// /js/cart.js  —  TWOFACE local cart (UI + API call to /api/checkout)
// Self-contained: injects styles, adds header Cart button & drawer,
// stores items in localStorage, and exposes window.TWFCart.

(() => {
  const STORAGE_KEY = 'twf_cart_v1';

  // ---------- Utilities ----------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmtMoney = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function save(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    emitChange();
  }
  function emitChange() {
    const detail = snapshot();
    window.dispatchEvent(new CustomEvent('twfcart:change', { detail }));
  }
  function snapshot() {
    const items = load();
    const total = items.reduce((a, i) => a + (i.price || 0) * (i.qty || 1), 0);
    const count = items.reduce((a, i) => a + (i.qty || 1), 0);
    return { items, count, total };
  }

  // ---------- Public API ----------
  const API = {
    add(item) {
      // expected fields: beatId, title, tierKey, tierLabel, price, priceId?, url?
      const key = `${item.beatId || item.title}:${item.tierKey}`;
      const items = load();
      const existing = items.find(i => i.key === key);
      if (existing) existing.qty = (existing.qty || 1) + (item.qty || 1);
      else items.push({ key, qty: 1, ...item });
      save(items);
      toast(`Added “${item.title} — ${item.tierLabel}”`);
      openDrawer();
    },
    remove(key) {
      const items = load().filter(i => i.key !== key);
      save(items);
    },
    clear() {
      save([]);
    },
    list()  { return snapshot().items;  },
    count() { return snapshot().count;  },
    total() { return snapshot().total;  },
    // allow success page to clear without loading full module
    _clearStorageOnly() { localStorage.removeItem(STORAGE_KEY); }
  };
  window.TWFCart = API;

  // ---------- Styles (injected) ----------
  (function injectStyles(){
    if ($('style[data-cart]')) return;
    const css = `
      .cart-btn {
        display:inline-flex; align-items:center; gap:8px; padding:8px 12px;
        border:1px solid #2a2a30; border-radius:999px; background:#17171b; color:#eaeaf2;
        cursor:pointer; font-weight:600; text-decoration:none;
      }
      .cart-btn:hover { background:#1e1f25; }
      .cart-badge {
        min-width:18px; height:18px; border-radius:999px; display:inline-grid; place-items:center;
        font-size:12px; padding:0 6px; background:#7d5fff; color:#000;
      }

      .cart-drawer {
        position: fixed; top:0; right:0; height:100dvh; width:min(92vw, 420px);
        background:#121216; border-left:1px solid #24242a; box-shadow: -20px 0 40px rgba(0,0,0,.5);
        transform: translateX(105%); transition: transform .22s ease-out; z-index: 1100;
        display:flex; flex-direction:column;
      }
      .cart-drawer.open { transform: translateX(0); }
      .cart-overlay {
        position: fixed; inset:0; background: rgba(0,0,0,.5); opacity:0; pointer-events:none; transition: opacity .2s ease;
        z-index:1099;
      }
      .cart-overlay.show { opacity:1; pointer-events:auto; }

      .cart-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #24242a; }
      .cart-title { margin:0; font-size:18px; }
      .cart-close { background:transparent; border:1px solid #2a2a30; color:#eaeaf2; border-radius:8px; padding:6px 10px; cursor:pointer; }
      .cart-body { padding:6px 12px 12px; overflow:auto; flex:1; }
      .cart-empty { color:#a8a8b6; padding:16px; text-align:center; }

      .cart-item {
        display:grid; grid-template-columns: 1fr auto; gap:6px; padding:10px; border:1px solid #24242a; border-radius:10px; background:#16161a;
        margin:8px 0;
      }
      .ci-title { margin:0 0 2px; font-weight:700; }
      .ci-sub   { color:#b5b5c3; font-size:13px; }
      .ci-price { font-weight:700; }
      .ci-actions { display:flex; align-items:center; gap:8px; }
      .ci-remove { background:transparent; border:1px solid #2a2a30; color:#eaeaf2; border-radius:8px; padding:6px 10px; cursor:pointer; }
      .ci-remove:hover { background:#1f2026; }

      .cart-foot { border-top:1px solid #24242a; padding:12px; }
      .cart-row  { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; color:#dcdcde; }
      .cart-actions { display:flex; gap:8px; }
      .btn-clear, .btn-checkout {
        appearance:none; border-radius:10px; padding:10px 14px; cursor:pointer; font-weight:700;
        border:1px solid #2a2a30; background:#1a1b20; color:#eaeaf2;
      }
      .btn-checkout { background:#7d5fff; border-color:#7d5fff; color:#000; }
      .btn-checkout:hover { filter:brightness(.95); }
      .btn-clear:hover { background:#22232a; }

      /* tiny toast */
      .cart-toast {
        position: fixed; left:50%; top: 16px; transform: translateX(-50%);
        background:#191a22; color:#eaeaf2; border:1px solid #2a2a30; border-radius:10px; padding:8px 12px; z-index:1200;
        box-shadow: 0 10px 28px rgba(0,0,0,.45);
      }

      /* --- Mobile header compaction for BEATS page (≤640px) --- */
      @media (max-width: 640px) {
        /* ensure header is positioning context */
        .site-header { position: relative; min-height: 56px; }

        /* show only Music + Beats links (hide Shows/Merch) */
        .site-header .site-nav a[href*="shows"],
        .site-header .site-nav a[href*="merch"] { display: none !important; }

        /* keep logo hugging left; push nav to the right */
        .site-header .site-nav { 
          gap: 14px;
          margin-left: auto;
          padding-right: 96px;  /* reserve space for Cart pill */
        }

        /* pin Cart pill at right, vertically centered */
        .cart-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          padding: 6px 10px;
        }
        .cart-badge {
          min-width: 16px;
          height: 16px;
          font-size: 11px;
          padding: 0 6px;
        }
      }
    `;
    const tag = document.createElement('style');
    tag.setAttribute('data-cart', 'true');
    tag.textContent = css;
    document.head.appendChild(tag);
  })();

  // ---------- UI Mount ----------
  function mountUI() {
    // 1) Header Cart button (append to right of nav)
    const nav = $('.site-header .site-nav');
    if (nav && !$('.cart-btn', nav)) {
      const btn = document.createElement('button');
      btn.className = 'cart-btn';
      btn.type = 'button';
      btn.innerHTML = `Cart <span class="cart-badge">0</span>`;
      btn.addEventListener('click', toggleDrawer);
      nav.appendChild(btn);
    }

    // 2) Drawer + overlay
    if (!$('.cart-drawer')) {
      const drawer = document.createElement('aside');
      drawer.className = 'cart-drawer';
      drawer.setAttribute('aria-label', 'Cart');
      drawer.innerHTML = `
        <div class="cart-head">
          <h3 class="cart-title">Your Cart</h3>
          <button class="cart-close" type="button">Close</button>
        </div>
        <div class="cart-body"><div class="cart-empty">Your cart is empty.</div></div>
        <div class="cart-foot">
          <div class="cart-row"><span>Subtotal</span><strong class="cart-subtotal">$0</strong></div>
          <div class="cart-actions">
            <button class="btn-clear" type="button">Clear</button>
            <button class="btn-checkout" type="button">Checkout</button>
          </div>
        </div>
      `;
      document.body.appendChild(drawer);

      const overlay = document.createElement('div');
      overlay.className = 'cart-overlay';
      overlay.addEventListener('click', closeDrawer);
      document.body.appendChild(overlay);

      drawer.querySelector('.cart-close') .addEventListener('click', closeDrawer);
      drawer.querySelector('.btn-clear')   .addEventListener('click', () => API.clear());
      drawer.querySelector('.btn-checkout').addEventListener('click', checkout);
    }

    // init UI with current snapshot
    updateUI();
  }

  function openDrawer()  { $('.cart-drawer')?.classList.add('open'); $('.cart-overlay')?.classList.add('show'); }
  function closeDrawer() { $('.cart-drawer')?.classList.remove('open'); $('.cart-overlay')?.classList.remove('show'); }
  function toggleDrawer(){ const d=$('.cart-drawer'); d?.classList.contains('open') ? closeDrawer() : openDrawer(); }

  // ---------- UI Update ----------
  function updateUI() {
    const { items, count, total } = snapshot();

    const badge = $('.cart-badge');
    if (badge) badge.textContent = String(count);

    const body = $('.cart-body');
    const sub  = $('.cart-subtotal');

    if (!body || !sub) return;

    body.innerHTML = '';
    if (!items.length) {
      body.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
    } else {
      items.forEach(i => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
          <div>
            <p class="ci-title">${escapeHtml(i.title || 'Untitled')}</p>
            <div class="ci-sub">${escapeHtml(i.tierLabel || i.tierKey || '')}</div>
          </div>
          <div class="ci-actions">
            <div class="ci-price">${fmtMoney(i.price || 0)}</div>
            <button class="ci-remove" type="button" aria-label="Remove">Remove</button>
          </div>
        `;
        row.querySelector('.ci-remove').addEventListener('click', () => API.remove(i.key));
        body.appendChild(row);
      });
    }

    sub.textContent = fmtMoney(total);
  }

  // ---------- Checkout ----------
  async function checkout() {
    const { items } = snapshot();
    if (!items.length) return;

    // Block if any item lacks a Stripe priceId
    const missing = items.filter(i => !i.priceId);
    if (missing.length) {
      alert('One or more items don’t have checkout IDs yet.\nUse “Buy” for those, or remove them from the cart.');
      return;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }) // server should return { url }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');

      window.location.href = data.url; // Stripe Checkout
    } catch (err) {
      console.error('[cart] checkout error:', err);
      alert('Couldn’t start checkout. Please try again in a moment.');
    }
  }

  // ---------- Helpers ----------
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'cart-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Live updates whenever cart changes
  window.addEventListener('twfcart:change', updateUI);

  // Mount now
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI);
  else mountUI();
})();