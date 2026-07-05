const { hasAdminConfig, isAdminRequest } = require("../../lib/admin-auth");
const { sendHtml } = require("../../lib/http");

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Orders | Good Morning Peptides</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Zilla+Slab:wght@700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="admin-body">
  <main class="admin-page">
    <section class="admin-hero">
      <p class="policy-kicker">ORDER ADMIN</p>
      <h1>Manual payment orders</h1>
      <p>Review awaiting-payment orders and move fulfillment statuses as payments are confirmed.</p>
    </section>

    <section class="admin-toolbar">
      <div>
        <p class="mini-label">Status</p>
        <div class="admin-filters" data-admin-filters></div>
      </div>
      <button class="button button-secondary" type="button" data-admin-refresh>Refresh</button>
    </section>

    <section class="admin-state" data-admin-state>Loading orders...</section>
    <section class="admin-orders" data-admin-orders></section>
  </main>

  <script>
    const statusLabels = {
      awaiting_payment: "Awaiting Payment",
      payment_submitted: "Payment Submitted",
      paid: "Paid",
      processing: "Processing",
      shipped: "Shipped",
      cancelled: "Cancelled",
      refunded: "Refunded",
    };
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    let activeStatus = "";

    function esc(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);
    }

    function formatCents(cents) {
      return money.format(Number(cents || 0) / 100);
    }

    function statusLabel(status) {
      return statusLabels[status] || status;
    }

    function address(order) {
      return [order.shipping_name, order.shipping_address_1, order.shipping_address_2, order.shipping_city + ", " + order.shipping_state + " " + order.shipping_zip, order.shipping_country]
        .filter(Boolean)
        .map(esc)
        .join("<br>");
    }

    function renderFilters(statuses) {
      const filters = document.querySelector("[data-admin-filters]");
      filters.innerHTML = ["", ...statuses].map((status) => {
        const label = status ? statusLabel(status) : "All";
        return '<button class="' + (activeStatus === status ? "active" : "") + '" type="button" data-status-filter="' + esc(status) + '">' + esc(label) + '</button>';
      }).join("");
    }

    function renderOrders(payload) {
      renderFilters(payload.statuses || []);
      const state = document.querySelector("[data-admin-state]");
      const list = document.querySelector("[data-admin-orders]");
      if (!payload.orders.length) {
        state.textContent = "No orders found.";
        list.innerHTML = "";
        return;
      }

      state.textContent = "";
      list.innerHTML = payload.orders.map((order) => {
        const items = order.items.map((item) => '<li>' + esc(item.product_name) + ' x ' + Number(item.quantity) + ' - ' + formatCents(item.line_total_cents) + '</li>').join("");
        const created = new Date(order.created_at).toLocaleString();
        return '<article class="admin-order-card">' +
          '<div class="admin-order-head">' +
            '<div><span class="status-pill status-' + esc(order.status) + '">' + esc(statusLabel(order.status)) + '</span><h2>' + esc(order.order_number) + '</h2><p>' + esc(created) + '</p></div>' +
            '<strong>' + formatCents(order.total_cents) + '</strong>' +
          '</div>' +
          '<div class="admin-order-grid">' +
            '<section><p class="mini-label">Customer</p><p><strong>' + esc(order.customer_name) + '</strong><br>' + esc(order.customer_email) + (order.customer_phone ? '<br>' + esc(order.customer_phone) : '') + '</p></section>' +
            '<section><p class="mini-label">Products</p><ul>' + items + '</ul></section>' +
            '<section><p class="mini-label">Shipping</p><p>' + address(order) + '</p></section>' +
          '</div>' +
          '<div class="admin-actions">' +
            '<button type="button" data-status-action="paid" data-order-id="' + order.id + '">Mark Paid</button>' +
            '<button type="button" data-status-action="processing" data-order-id="' + order.id + '">Processing</button>' +
            '<button type="button" data-status-action="shipped" data-order-id="' + order.id + '">Shipped</button>' +
            '<button type="button" data-status-action="cancelled" data-order-id="' + order.id + '">Cancelled</button>' +
            '<button type="button" data-status-action="refunded" data-order-id="' + order.id + '">Refunded</button>' +
          '</div>' +
        '</article>';
      }).join("");
    }

    async function loadOrders() {
      const state = document.querySelector("[data-admin-state]");
      state.textContent = "Loading orders...";
      const query = activeStatus ? "?status=" + encodeURIComponent(activeStatus) : "";
      const response = await fetch("/api/admin/orders" + query, { credentials: "same-origin" });
      if (!response.ok) {
        state.textContent = "Unable to load orders. Check admin credentials and database configuration.";
        return;
      }
      renderOrders(await response.json());
    }

    document.addEventListener("click", async (event) => {
      const filter = event.target.closest("[data-status-filter]");
      if (filter) {
        activeStatus = filter.dataset.statusFilter || "";
        await loadOrders();
        return;
      }

      if (event.target.closest("[data-admin-refresh]")) {
        await loadOrders();
        return;
      }

      const action = event.target.closest("[data-status-action]");
      if (!action) return;
      action.disabled = true;
      const response = await fetch("/api/admin/orders/" + encodeURIComponent(action.dataset.orderId) + "/status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.dataset.statusAction }),
      });
      action.disabled = false;
      if (!response.ok) {
        alert("Unable to update status.");
        return;
      }
      await loadOrders();
    });

    loadOrders();
  </script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  if (!hasAdminConfig()) {
    return sendHtml(res, 503, "<h1>Admin authentication is not configured.</h1>");
  }

  if (!isAdminRequest(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Good Morning Peptides Admin"');
    return sendHtml(res, 401, "<h1>Admin authentication required.</h1>");
  }

  return sendHtml(res, 200, pageHtml());
};
