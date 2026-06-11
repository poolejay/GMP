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
        <div><strong>${item.name}</strong><p>Qty ${item.qty} · ${money.format(item.price)}</p></div>
        <button type="button" data-remove-cart="${index}">Remove</button>
      </div>
    `).join("");
  });
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.querySelectorAll("[data-cart-total]").forEach((node) => node.textContent = money.format(total));
  bindCartAttestations();
  updateCartAttestations();
}

function updateCartAttestations() {
  document.querySelectorAll("[data-cart-attestation]").forEach((group) => {
    const checks = [...group.querySelectorAll("input[type='checkbox']")];
    const checkout = group.closest(".cart-panel")?.querySelector("[data-checkout-button]");
    if (checkout) checkout.disabled = !checks.every((item) => item.checked);
  });
}

function bindCartAttestations() {
  document.querySelectorAll("[data-cart-attestation] input[type='checkbox']").forEach((input) => {
    if (input.dataset.attestationBound) return;
    input.dataset.attestationBound = "true";
    input.addEventListener("change", updateCartAttestations);
    input.addEventListener("click", () => window.setTimeout(updateCartAttestations, 0));
  });
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

  if (event.target.closest("[data-cart-attestation]")) {
    window.setTimeout(updateCartAttestations, 0);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.closest("[data-cart-attestation]")) {
    updateCartAttestations();
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
