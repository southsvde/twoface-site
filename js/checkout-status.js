// /js/checkout-status.js
// UX polish for Stripe redirect results on beats.html
// - Shows a small banner for ?success=1 or ?canceled=1
// - Clears local cart on success (if TWFCart is present)
// - Cleans the URL (removes the query params)

(() => {
  function $(s, r = document) { return r.querySelector(s); }

  function injectStyles() {
    if ($('style[data-checkout-status]')) return;
    const css = `
      .co-banner {
        position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
        background: #162217; border: 1px solid #24492a; color: #dff6e3;
        padding: 10px 14px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
        z-index: 1100; font-size: 14px; line-height: 1.2; max-width: min(92vw, 720px);
      }
      .co-banner.info {
        background: #191a21; border-color: #2a2b33; color: #e4e6ee;
      }
      .co-banner.error {
        background: #2a1717; border-color: #5a2a2a; color: #ffd6d6;
      }
      .co-close {
        margin-left: 10px; background: transparent; border: 1px solid rgba(255,255,255,.18);
        color: inherit; border-radius: 8px; padding: 4px 8px; cursor: pointer;
      }
      .co-close:hover { background: rgba(255,255,255,.06); }
    `;
    const tag = document.createElement('style');
    tag.setAttribute('data-checkout-status', 'true');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function showBanner(kind, message) {
    injectStyles();
    const el = document.createElement('div');
    el.className = `co-banner ${kind}`;
    el.innerHTML = `${message} <button class="co-close" type="button" aria-label="Close">Close</button>`;
    document.body.appendChild(el);
    const close = el.querySelector('.co-close');
    const remove = () => el.remove();
    close.addEventListener('click', remove);
    setTimeout(remove, 7000);
  }

  function cleanUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('canceled');
      url.searchParams.delete('session_id');
      history.replaceState({}, '', url.toString());
    } catch {}
  }

  function onReady(fn){ 
    if (document.readyState === 'loading') 
      document.addEventListener('DOMContentLoaded', fn); 
    else fn(); 
  }

  onReady(() => {
    let params;
    try { params = new URL(window.location.href).searchParams; } catch { return; }

    const isSuccess = params.get('success') === '1';
    const isCanceled = params.get('canceled') === '1';

    if (!isSuccess && !isCanceled) return;

    if (isSuccess) {
      // Clear local cart if available (we assume Stripe completed the charge)
      try { window.TWFCart && typeof TWFCart.clear === 'function' && TWFCart.clear(); } catch {}
      showBanner('success', 'Payment successful — thank you! You’ll receive a receipt by email.');
    } else if (isCanceled) {
      showBanner('info', 'Checkout canceled — your cart is saved. You can continue whenever you’re ready.');
    }

    // Tidy URL so reloading the page doesn’t re-show the banner
    cleanUrl();
  });
})();