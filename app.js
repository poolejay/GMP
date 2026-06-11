const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const storageKey = "gmp-cart";
let cart = JSON.parse(localStorage.getItem(storageKey) || "[]");

function saveCart() {
  localStorage.setItem(storageKey, JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => node.textContent = count);
  document.querySelectorAll("[data-cart-items]").forEach((node) => {
    if (!cart.length) {
      node.innerHTML = "<p>Your cart is empty.</p>";
      return;
    }
    node.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <div><strong>${escapeClientHtml(item.name)}</strong><p>Qty ${Number(item.qty || 0)} · ${money.format(Number(item.price || 0))}</p></div>
        <button type="button" data-remove-cart="${index}">Remove</button>
      </div>
    `).join("");
  });
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.querySelectorAll("[data-cart-total]").forEach((node) => node.textContent = money.format(total));
  renderCheckout();
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function escapeClientHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validCheckoutForm(form) {
  if (!form) return false;
  const required = [...form.querySelectorAll("[required]")];
  const hasRequired = required.every((field) => field.type === "checkbox" ? field.checked : field.value.trim());
  const email = form.elements.email?.value || "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return cart.length > 0 && hasRequired && emailOk;
}

function renderCheckout() {
  const form = document.querySelector("[data-checkout-form]");
  const summary = document.querySelector("[data-checkout-summary]");
  const totalNode = document.querySelector("[data-checkout-total]");
  const empty = document.querySelector("[data-checkout-empty]");
  const submit = document.querySelector("[data-submit-order]");
  if (!summary || !totalNode) return;

  if (!cart.length) {
    summary.innerHTML = "";
    empty.hidden = false;
    totalNode.textContent = money.format(0);
    if (submit) submit.disabled = true;
    return;
  }

  empty.hidden = true;
  summary.innerHTML = cart.map((item) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    return `<div class="checkout-summary-line">
      <div><strong>${escapeClientHtml(item.name)}</strong><span>Qty ${qty} · ${money.format(price)}</span></div>
      <b>${money.format(qty * price)}</b>
    </div>`;
  }).join("");
  totalNode.textContent = money.format(cartTotal());
  if (submit) submit.disabled = !validCheckoutForm(form);
}

async function submitCheckout(form) {
  const error = document.querySelector("[data-checkout-error]");
  const submit = document.querySelector("[data-submit-order]");
  if (error) error.hidden = true;
  if (!validCheckoutForm(form)) {
    if (error) error.hidden = false;
    renderCheckout();
    return;
  }

  const payload = {
    customer: {
      fullName: form.elements.fullName.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
    },
    shipping: {
      address1: form.elements.address1.value.trim(),
      address2: form.elements.address2.value.trim(),
      city: form.elements.city.value.trim(),
      state: form.elements.state.value.trim(),
      postalCode: form.elements.postalCode.value.trim(),
      country: form.elements.country.value.trim(),
    },
    orderNote: form.elements.orderNote.value.trim(),
    website: form.elements.website.value.trim(),
    attestations: {
      researchUse: form.elements.researchAttestation.checked,
      policies: form.elements.policyAttestation.checked,
    },
    cart,
  };

  try {
    submit.disabled = true;
    submit.textContent = "Submitting...";
    const response = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Order submission failed");
    const result = await response.json();
    sessionStorage.setItem("gmp-pending-order", JSON.stringify({
      orderNumber: result.orderNumber,
      total: result.total,
      paymentMethods: result.paymentMethods || [],
    }));
    cart = [];
    localStorage.removeItem(storageKey);
    window.location.href = `payment-pending.html?order=${encodeURIComponent(result.orderNumber)}`;
  } catch (err) {
    if (error) error.hidden = false;
    submit.disabled = false;
    submit.textContent = "Submit Order";
  }
}

function renderPaymentPending() {
  const page = document.querySelector("[data-payment-page]");
  if (!page) return;
  const stored = JSON.parse(sessionStorage.getItem("gmp-pending-order") || "{}");
  const params = new URLSearchParams(window.location.search);
  const orderNumber = stored.orderNumber || params.get("order") || "Order number unavailable";
  const total = Number(stored.total || 0);
  const methods = Array.isArray(stored.paymentMethods) ? stored.paymentMethods : [];

  document.querySelector("[data-payment-order]").textContent = orderNumber;
  document.querySelector("[data-payment-total]").textContent = money.format(total);
  const list = document.querySelector("[data-payment-methods]");
  if (!list) return;
  if (!methods.length) {
    list.innerHTML = `<div class="payment-method-card"><strong>Payment instructions</strong><p>Please check your email for available offline payment instructions.</p></div>`;
    return;
  }
  list.innerHTML = methods.map((method) => `<article class="payment-method-card">
    <strong>${escapeClientHtml(method.label || method.name)}</strong>
    <p>${escapeClientHtml(method.instructions)}</p>
  </article>`).join("");
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add-cart]");
  if (add) {
    const productCard = add.closest("article");
    const selectedVariant = productCard?.querySelector("[data-variant-select]")?.selectedOptions[0];
    const name = selectedVariant?.value || add.dataset.name;
    const price = Number(selectedVariant?.dataset.price || add.dataset.price || 0);
    const existing = cart.find((item) => item.name === name);
    if (existing) existing.qty += 1;
    else cart.push({ name, price, qty: 1 });
    saveCart();
    document.querySelector("[data-cart-drawer]")?.classList.add("open");
  }

  const remove = event.target.closest("[data-remove-cart]");
  if (remove) {
    cart.splice(Number(remove.dataset.removeCart), 1);
    saveCart();
  }

  if (event.target.closest("[data-cart-open]")) {
    document.querySelector("[data-cart-drawer]")?.classList.add("open");
  }

  if (event.target.closest("[data-cart-close]") || event.target.matches("[data-cart-drawer]")) {
    document.querySelector("[data-cart-drawer]")?.classList.remove("open");
  }

});

document.addEventListener("change", (event) => {
  if (event.target.closest("[data-checkout-form]")) {
    renderCheckout();
  }

  const select = event.target.closest("[data-variant-select]");
  if (!select) return;
  const card = select.closest("article");
  const price = Number(select.selectedOptions[0]?.dataset.price || 0);
  const priceNode = card?.querySelector(".card-info strong, .catalog-product-foot strong");
  const image = card?.querySelector("[data-product-image]");
  const imageSrc = select.selectedOptions[0]?.dataset.image;
  if (priceNode) priceNode.textContent = money.format(price);
  if (image && imageSrc) image.src = imageSrc;
});

document.addEventListener("input", (event) => {
  if (event.target.closest("[data-checkout-form]")) renderCheckout();
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-checkout-form]");
  if (!form) return;
  event.preventDefault();
  submitCheckout(form);
});

document.querySelectorAll("[data-tabs]").forEach((tabs) => {
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    tabs.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
    tabs.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    tabs.querySelector(`#${button.dataset.tab}`)?.classList.add("active");
  });
});

renderCart();
renderPaymentPending();
