const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const storageKey = "gmp-cart";
const productIdByName = {
  "GLP-3RT 10MG": "glp-3rt-10mg",
  "GLP-3RT 30MG": "glp-3rt-30mg",
  "GLP-2TZ 20MG": "glp-2tz-20mg",
  "GLP-2TZ 30MG": "glp-2tz-30mg",
  "BPC-157 10MG": "bpc-157-10mg",
  "MT-2 10MG": "mt-2-10mg",
  "GHK-Cu 50MG": "ghk-cu-50mg",
  "MOTS-c 50MG": "mots-c-50mg",
};

let cart = parseCart();
let checkoutConfig = {
  googleMapsApiKey: "",
  addressVerificationRequired: false,
};
const addressVerificationFieldNames = new Set(["address1", "city", "state", "postalCode", "country"]);

function parseCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return normalizeCart(parsed);
  } catch {
    return [];
  }
}

function normalizeCart(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const name = String(item.name || "").trim();
      const id = String(item.id || item.product_id || productIdByName[name] || "").trim();
      const qty = Math.min(20, Math.max(1, Number(item.qty || item.quantity || 1)));
      const priceCents = Number.isFinite(Number(item.priceCents))
        ? Number(item.priceCents)
        : Math.round(Number(item.price || 0) * 100);
      return {
        id,
        name,
        qty,
        priceCents,
        image: item.image || "",
      };
    })
    .filter((item) => item.name && item.qty > 0);
}

function saveCart() {
  cart = normalizeCart(cart);
  localStorage.setItem(storageKey, JSON.stringify(cart));
  renderCart();
}

function formatCents(cents) {
  return money.format(Number(cents || 0) / 100);
}

function cartTotalCents() {
  return cart.reduce((sum, item) => sum + Number(item.priceCents || 0) * Number(item.qty || 0), 0);
}

function escapeClientHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll("[data-cart-count]").forEach((node) => { node.textContent = count; });
  renderCartDrawer();
  renderCartPage();
  renderCheckout();
}

function renderCartDrawer() {
  document.querySelectorAll("[data-cart-items]").forEach((node) => {
    if (!cart.length) {
      node.innerHTML = "<p>Your cart is empty.</p>";
      return;
    }
    node.innerHTML = cart.map((item, index) => `
      <div class="cart-item">
        <div><strong>${escapeClientHtml(item.name)}</strong><p>Qty ${Number(item.qty || 0)} · ${formatCents(item.priceCents)}</p></div>
        <button type="button" data-remove-cart="${index}">Remove</button>
      </div>
    `).join("");
  });
  document.querySelectorAll("[data-cart-total]").forEach((node) => { node.textContent = formatCents(cartTotalCents()); });
}

function renderCartPage() {
  const page = document.querySelector("[data-cart-page]");
  if (!page) return;
  const empty = document.querySelector("[data-cart-page-empty]");
  const list = document.querySelector("[data-cart-page-items]");
  const total = document.querySelector("[data-cart-page-total]");
  const checkoutLink = document.querySelector("[data-cart-checkout-link]");

  if (!cart.length) {
    if (empty) empty.hidden = false;
    if (list) list.innerHTML = "";
    if (total) total.textContent = formatCents(0);
    if (checkoutLink) checkoutLink.setAttribute("aria-disabled", "true");
    return;
  }

  if (empty) empty.hidden = true;
  if (checkoutLink) checkoutLink.removeAttribute("aria-disabled");
  if (total) total.textContent = formatCents(cartTotalCents());
  if (!list) return;

  list.innerHTML = cart.map((item, index) => `
    <article class="cart-page-item">
      <div class="cart-page-product">
        ${item.image ? `<img src="${escapeClientHtml(item.image)}" alt="" />` : ""}
        <div>
          <h2>${escapeClientHtml(item.name)}</h2>
          <p>Research use only</p>
        </div>
      </div>
      <div class="cart-qty-control" aria-label="Quantity for ${escapeClientHtml(item.name)}">
        <button type="button" data-cart-decrease="${index}" aria-label="Decrease quantity">-</button>
        <span>${Number(item.qty)}</span>
        <button type="button" data-cart-increase="${index}" aria-label="Increase quantity">+</button>
      </div>
      <strong>${formatCents(Number(item.priceCents) * Number(item.qty))}</strong>
      <button class="cart-remove-link" type="button" data-remove-cart="${index}">Remove</button>
    </article>
  `).join("");
}

function validCheckoutForm(form) {
  if (!form) return false;
  const required = [...form.querySelectorAll("[required]")];
  const hasRequired = required.every((field) => field.type === "checkbox" ? field.checked : field.value.trim());
  const email = form.elements.email?.value || "";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const addressMode = form.dataset.addressVerification || "manual";
  const addressOk = addressMode !== "pending" && (addressMode !== "required" || form.elements.addressVerified?.value === "true");
  return cart.length > 0 && hasRequired && emailOk && addressOk;
}

function renderCheckout() {
  const form = document.querySelector("[data-checkout-form]");
  const summary = document.querySelector("[data-checkout-summary]");
  const subtotalNode = document.querySelector("[data-checkout-subtotal]");
  const totalNode = document.querySelector("[data-checkout-total]");
  const empty = document.querySelector("[data-checkout-empty]");
  const submit = document.querySelector("[data-submit-order]");
  if (!summary || !totalNode) return;

  if (!cart.length) {
    summary.innerHTML = "";
    if (empty) empty.hidden = false;
    if (subtotalNode) subtotalNode.textContent = formatCents(0);
    totalNode.textContent = formatCents(0);
    if (submit) submit.disabled = true;
    return;
  }

  if (empty) empty.hidden = true;
  summary.innerHTML = cart.map((item) => {
    const qty = Number(item.qty || 0);
    const priceCents = Number(item.priceCents || 0);
    return `<div class="checkout-summary-line">
      <div><strong>${escapeClientHtml(item.name)}</strong><span>Qty ${qty} · ${formatCents(priceCents)}</span></div>
      <b>${formatCents(qty * priceCents)}</b>
    </div>`;
  }).join("");
  if (subtotalNode) subtotalNode.textContent = formatCents(cartTotalCents());
  totalNode.textContent = formatCents(cartTotalCents());
  if (submit) submit.disabled = !validCheckoutForm(form);
}

async function submitCheckout(form) {
  const error = document.querySelector("[data-checkout-error]");
  const submit = document.querySelector("[data-submit-order]");
  if (error) error.hidden = true;
  if (!validCheckoutForm(form)) {
    if (error) {
      const addressMode = form.dataset.addressVerification || "manual";
      error.textContent = (addressMode === "pending" || (addressMode === "required" && form.elements.addressVerified?.value !== "true"))
        ? "Select a verified shipping address from the address suggestions before placing the order."
        : "We could not submit your order. Please review your information and try again.";
      error.hidden = false;
    }
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
      name: form.elements.fullName.value.trim(),
      address1: form.elements.address1.value.trim(),
      address2: form.elements.address2.value.trim(),
      city: form.elements.city.value.trim(),
      state: form.elements.state.value.trim(),
      postalCode: form.elements.postalCode.value.trim(),
      country: form.elements.country.value.trim(),
      addressVerified: form.elements.addressVerified?.value === "true",
      googlePlaceId: form.elements.googlePlaceId?.value || "",
    },
    orderNote: form.elements.orderNote.value.trim(),
    website: form.elements.website.value.trim(),
    attestations: {
      researchUse: form.elements.researchAttestation.checked,
      policies: form.elements.policyAttestation.checked,
    },
    items: cart.map((item) => ({
      product_id: item.id || productIdByName[item.name],
      name: item.name,
      quantity: item.qty,
    })),
  };

  try {
    submit.disabled = true;
    submit.textContent = "Placing order...";
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Order submission failed");
    sessionStorage.setItem("gmp-last-order", JSON.stringify(result));
    cart = [];
    localStorage.removeItem(storageKey);
    window.location.href = `/order-confirmation/${encodeURIComponent(result.order_number || result.orderNumber)}`;
  } catch (err) {
    if (error) {
      error.textContent = err.message || "We could not submit your order. Please review your information and try again.";
      error.hidden = false;
    }
    submit.disabled = false;
    submit.textContent = "Place Order";
  }
}

function updateAddressVerificationState(form, state, message) {
  const panel = form?.querySelector("[data-address-verify-panel]");
  const status = form?.querySelector("[data-address-status]");
  const badge = form?.querySelector("[data-address-badge]");
  if (!panel || !status || !badge) return;
  panel.dataset.state = state;
  status.textContent = message;
  badge.textContent = state === "verified" ? "Verified" : state === "required" ? "Required" : state === "pending" ? "Checking" : "Manual";
}

function setAddressVerified(form, verified, placeId = "") {
  if (!form?.elements.addressVerified) return;
  form.elements.addressVerified.value = verified ? "true" : "false";
  if (form.elements.googlePlaceId) form.elements.googlePlaceId.value = placeId;
  updateAddressVerificationState(
    form,
    verified ? "verified" : (form.dataset.addressVerification === "required" ? "required" : "manual"),
    verified
      ? "Address selected from Google Maps."
      : (form.dataset.addressVerification === "required"
        ? "Start typing your address and select one of the Google suggestions."
        : "Manual address entry is available for local testing."),
  );
  renderCheckout();
}

function addressComponent(place = {}, type, useShortName = false) {
  const component = (place.address_components || []).find((entry) => entry.types.includes(type));
  if (!component) return "";
  return useShortName ? component.short_name : component.long_name;
}

function fillAddressFromPlace(form, place) {
  if (!place?.address_components?.length) {
    setAddressVerified(form, false);
    return;
  }

  const streetNumber = addressComponent(place, "street_number");
  const route = addressComponent(place, "route");
  const address1 = [streetNumber, route].filter(Boolean).join(" ") || place.formatted_address || "";
  const city = addressComponent(place, "locality")
    || addressComponent(place, "postal_town")
    || addressComponent(place, "sublocality")
    || addressComponent(place, "administrative_area_level_2");
  const state = addressComponent(place, "administrative_area_level_1", true);
  const postalCode = addressComponent(place, "postal_code");
  const country = addressComponent(place, "country");

  form.elements.address1.value = address1;
  form.elements.city.value = city;
  form.elements.state.value = state;
  form.elements.postalCode.value = postalCode;
  form.elements.country.value = country || "United States";
  setAddressVerified(form, Boolean(address1 && city && state && postalCode), place.place_id || "");
}

function loadGoogleMapsScript(apiKey) {
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.gmpGoogleMapsPromise) return window.gmpGoogleMapsPromise;

  window.gmpGoogleMapsPromise = new Promise((resolve, reject) => {
    window.initGmpGooglePlaces = resolve;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly&callback=initGmpGooglePlaces`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });

  return window.gmpGoogleMapsPromise;
}

async function initAddressVerification() {
  const form = document.querySelector("[data-checkout-form]");
  if (!form) return;

  form.dataset.addressVerification = "pending";
  updateAddressVerificationState(form, "pending", "Checking address verification options.");
  renderCheckout();

  try {
    const response = await fetch("/api/config");
    if (response.ok) checkoutConfig = await response.json();
  } catch {
    checkoutConfig = { googleMapsApiKey: "", addressVerificationRequired: false };
  }

  if (!checkoutConfig.googleMapsApiKey) {
    form.dataset.addressVerification = "manual";
    updateAddressVerificationState(form, "manual", "Manual address entry is available for local testing.");
    renderCheckout();
    return;
  }

  form.dataset.addressVerification = checkoutConfig.addressVerificationRequired ? "required" : "manual";
  setAddressVerified(form, false);

  try {
    await loadGoogleMapsScript(checkoutConfig.googleMapsApiKey);
    const autocomplete = new google.maps.places.Autocomplete(form.elements.address1, {
      componentRestrictions: { country: ["us"] },
      fields: ["address_components", "formatted_address", "place_id"],
      types: ["address"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      fillAddressFromPlace(form, place);
    });
  } catch {
    form.dataset.addressVerification = checkoutConfig.addressVerificationRequired ? "required" : "manual";
    setAddressVerified(form, false);
    updateAddressVerificationState(
      form,
      checkoutConfig.addressVerificationRequired ? "required" : "manual",
      checkoutConfig.addressVerificationRequired
        ? "Address verification could not load. Refresh the page to try again."
        : "Address verification is unavailable right now. Manual entry is enabled.",
    );
  }

  renderCheckout();
}

function orderNumberFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryOrder = params.get("order");
  if (queryOrder) return queryOrder;
  const parts = window.location.pathname.split("/").filter(Boolean);
  const confirmationIndex = parts.indexOf("order-confirmation");
  if (confirmationIndex >= 0 && parts[confirmationIndex + 1]) return decodeURIComponent(parts[confirmationIndex + 1]);
  return "";
}

function statusLabel(status) {
  return String(status || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shippingAddressHtml(shipping) {
  if (!shipping) return "";
  return [shipping.name, shipping.address_1, shipping.address_2, `${shipping.city}, ${shipping.state} ${shipping.zip}`, shipping.country]
    .filter(Boolean)
    .map(escapeClientHtml)
    .join("<br>");
}

function renderOrderDetails(order) {
  const items = document.querySelector("[data-confirmation-items]");
  const instructions = document.querySelector("[data-confirmation-instructions]");
  const shipping = document.querySelector("[data-confirmation-shipping]");
  const status = document.querySelector("[data-confirmation-status]");
  const orderNode = document.querySelector("[data-confirmation-order]");
  const total = document.querySelector("[data-confirmation-total]");
  const subtotal = document.querySelector("[data-confirmation-subtotal]");
  const shippingTotal = document.querySelector("[data-confirmation-shipping-total]");
  const tax = document.querySelector("[data-confirmation-tax]");
  const email = document.querySelector("[data-confirmation-email]");

  if (orderNode) orderNode.textContent = order.order_number || order.orderNumber;
  if (status) status.textContent = statusLabel(order.status);
  if (total) total.textContent = formatCents(order.total_cents);
  if (subtotal) subtotal.textContent = formatCents(order.subtotal_cents);
  if (shippingTotal) shippingTotal.textContent = formatCents(order.shipping_cents);
  if (tax) tax.textContent = formatCents(order.tax_cents);
  if (email) email.textContent = order.customer_email_masked || "your email";
  if (shipping) shipping.innerHTML = shippingAddressHtml(order.shipping);

  if (items) {
    items.innerHTML = (order.items || []).map((item) => `<div class="checkout-summary-line">
      <div><strong>${escapeClientHtml(item.product_name)}</strong><span>Qty ${Number(item.quantity)} · ${formatCents(item.unit_price_cents)}</span></div>
      <b>${formatCents(item.line_total_cents)}</b>
    </div>`).join("");
  }

  if (instructions) {
    instructions.innerHTML = (order.payment_instructions || []).map((method) => `<article class="payment-method-card">
      <strong>${escapeClientHtml(method.label)}</strong>
      <p>${escapeClientHtml(method.instructions)}</p>
    </article>`).join("");
  }
}

async function renderOrderConfirmation() {
  const page = document.querySelector("[data-confirmation-page]");
  if (!page) return;
  const error = document.querySelector("[data-confirmation-error]");
  const loading = document.querySelector("[data-confirmation-loading]");
  const content = document.querySelector("[data-confirmation-content]");
  const orderNumber = orderNumberFromLocation();
  const stored = JSON.parse(sessionStorage.getItem("gmp-last-order") || "{}");

  if (!orderNumber && stored.order_number) {
    renderOrderDetails(stored);
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
    return;
  }

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`);
    if (!response.ok) throw new Error("Unable to load order");
    const order = await response.json();
    renderOrderDetails(order);
    if (loading) loading.hidden = true;
    if (content) content.hidden = false;
  } catch {
    if (loading) loading.hidden = true;
    if (error) error.hidden = false;
  }
}

function renderPaymentPending() {
  const page = document.querySelector("[data-payment-page]");
  if (!page) return;
  const stored = JSON.parse(sessionStorage.getItem("gmp-last-order") || sessionStorage.getItem("gmp-pending-order") || "{}");
  const params = new URLSearchParams(window.location.search);
  const orderNumber = stored.order_number || stored.orderNumber || params.get("order") || "Order number unavailable";
  const total = Number(stored.total_cents || Math.round(Number(stored.total || 0) * 100));
  const methods = Array.isArray(stored.payment_instructions) ? stored.payment_instructions : (stored.paymentMethods || []);

  document.querySelector("[data-payment-order]").textContent = orderNumber;
  document.querySelector("[data-payment-total]").textContent = formatCents(total);
  const list = document.querySelector("[data-payment-methods]");
  if (!list) return;
  if (!methods.length) {
    list.innerHTML = `<div class="payment-method-card"><strong>Payment instructions</strong><p>Please check your email for available manual payment instructions.</p></div>`;
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
    const id = selectedVariant?.dataset.productId || add.dataset.productId || productIdByName[name] || "";
    const priceCents = Number(selectedVariant?.dataset.priceCents || add.dataset.priceCents || Math.round(Number(selectedVariant?.dataset.price || add.dataset.price || 0) * 100));
    const image = selectedVariant?.dataset.image || productCard?.querySelector("img")?.getAttribute("src") || "";
    const existing = cart.find((item) => item.id === id || item.name === name);
    if (existing) existing.qty = Math.min(20, existing.qty + 1);
    else cart.push({ id, name, priceCents, qty: 1, image });
    saveCart();
    document.querySelector("[data-cart-drawer]")?.classList.add("open");
  }

  const remove = event.target.closest("[data-remove-cart]");
  if (remove) {
    cart.splice(Number(remove.dataset.removeCart), 1);
    saveCart();
  }

  const decrease = event.target.closest("[data-cart-decrease]");
  if (decrease) {
    const item = cart[Number(decrease.dataset.cartDecrease)];
    if (item) item.qty -= 1;
    cart = cart.filter((entry) => entry.qty > 0);
    saveCart();
  }

  const increase = event.target.closest("[data-cart-increase]");
  if (increase) {
    const item = cart[Number(increase.dataset.cartIncrease)];
    if (item) item.qty = Math.min(20, item.qty + 1);
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
  const checkoutForm = event.target.closest("[data-checkout-form]");
  if (checkoutForm) {
    renderCheckout();
  }

  const select = event.target.closest("[data-variant-select]");
  if (!select) return;
  const card = select.closest("article");
  const priceCents = Number(select.selectedOptions[0]?.dataset.priceCents || Math.round(Number(select.selectedOptions[0]?.dataset.price || 0) * 100));
  const priceNode = card?.querySelector(".card-info strong, .catalog-product-foot strong");
  const image = card?.querySelector("[data-product-image]");
  const imageSrc = select.selectedOptions[0]?.dataset.image;
  if (priceNode) priceNode.textContent = formatCents(priceCents);
  if (image && imageSrc) image.src = imageSrc;
});

document.addEventListener("input", (event) => {
  const checkoutForm = event.target.closest("[data-checkout-form]");
  if (!checkoutForm) return;
  if (checkoutForm.dataset.addressVerification === "required" && addressVerificationFieldNames.has(event.target.name)) {
    setAddressVerified(checkoutForm, false);
    return;
  }
  renderCheckout();
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
renderOrderConfirmation();
initAddressVerification();
