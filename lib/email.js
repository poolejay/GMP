const { clean, escapeHtml, formatMoneyCents } = require("./format");

function adminEmail() {
  return process.env.ADMIN_ORDER_EMAIL || process.env.ORDER_ADMIN_EMAIL || "";
}

function fromEmail() {
  return process.env.ORDER_FROM_EMAIL || "orders@goodmorningpeptides.com";
}

function emailsSkipped() {
  return String(process.env.SKIP_ORDER_EMAILS || "").toLowerCase() === "true";
}

function ensureOrderEmailConfig() {
  if (emailsSkipped()) return;
  if (!process.env.RESEND_API_KEY) {
    const error = new Error("RESEND_API_KEY is not configured");
    error.statusCode = 500;
    error.publicMessage = "Order email is not configured";
    throw error;
  }
  if (!adminEmail()) {
    const error = new Error("ADMIN_ORDER_EMAIL is not configured");
    error.statusCode = 500;
    error.publicMessage = "Admin order email is not configured";
    throw error;
  }
}

function paymentInstructions() {
  return [
    {
      enabled: process.env.PAYMENT_ZELLE_ENABLED,
      label: process.env.PAYMENT_ZELLE_LABEL || "Zelle",
      instructions: process.env.PAYMENT_ZELLE_INSTRUCTIONS || "Zelle: payments@example.com",
    },
    {
      enabled: process.env.PAYMENT_CASHAPP_ENABLED,
      label: process.env.PAYMENT_CASHAPP_LABEL || "Cash App",
      instructions: process.env.PAYMENT_CASHAPP_INSTRUCTIONS || "Cash App: $Example",
    },
    {
      enabled: process.env.PAYMENT_VENMO_ENABLED,
      label: process.env.PAYMENT_VENMO_LABEL || "Venmo",
      instructions: process.env.PAYMENT_VENMO_INSTRUCTIONS || "Venmo: @Example",
    },
  ]
    .filter((method) => String(method.enabled || "true").toLowerCase() !== "false")
    .map((method) => ({
      label: clean(method.label, 80),
      instructions: clean(method.instructions, 240),
    }));
}

function shippingBlock(order) {
  return [
    order.shipping_name,
    order.shipping_address_1,
    order.shipping_address_2,
    `${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`,
    order.shipping_country,
  ].filter(Boolean).map((line) => escapeHtml(line)).join("<br>");
}

function orderItemsTable(items) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:18px 0;">
    <thead>
      <tr>
        <th align="left" style="padding:8px 0;border-bottom:1px solid #e4dfef;">Product</th>
        <th align="center" style="padding:8px 0;border-bottom:1px solid #e4dfef;">Qty</th>
        <th align="right" style="padding:8px 0;border-bottom:1px solid #e4dfef;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #f2eff7;">${escapeHtml(item.product_name)}</td>
        <td align="center" style="padding:9px 0;border-bottom:1px solid #f2eff7;">${Number(item.quantity)}</td>
        <td align="right" style="padding:9px 0;border-bottom:1px solid #f2eff7;">${formatMoneyCents(item.line_total_cents)}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function paymentInstructionHtml() {
  return paymentInstructions().map((method) => `<div style="margin:12px 0;padding:14px;border:1px solid #e4dfef;border-radius:12px;background:#fff;">
    <strong>${escapeHtml(method.label)}</strong>
    <p style="margin:7px 0 0;">${escapeHtml(method.instructions)}</p>
  </div>`).join("");
}

async function resendClient() {
  const { Resend } = await import("resend");
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendOrderCreatedEmails({ order, items, baseUrl }) {
  if (emailsSkipped()) return { skipped: true };
  ensureOrderEmailConfig();

  const resend = await resendClient();
  const dashboardUrl = `${baseUrl}/admin/orders`;
  const total = formatMoneyCents(order.total_cents);
  const customerHtml = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
      <h1 style="margin:0 0 12px;">Payment Instructions for Order ${escapeHtml(order.order_number)}</h1>
      <p>Thank you for your order. Your order has been received.</p>
      <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}<br><strong>Order total:</strong> ${total}<br><strong>Status:</strong> awaiting payment</p>
      ${orderItemsTable(items)}
      <p><strong>Shipping address</strong><br>${shippingBlock(order)}</p>
      <p>Please use one of the manual payment options below. Your order will remain awaiting payment until payment is confirmed.</p>
      ${paymentInstructionHtml()}
      <p>Please include your order number with your payment when possible.</p>
      <p>Products are supplied for laboratory research use only and are not intended for human or animal consumption.</p>
    </div>`;

  const adminHtml = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
      <h1 style="margin:0 0 12px;">New Awaiting Payment Order - ${escapeHtml(order.order_number)}</h1>
      <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}<br><strong>Status:</strong> ${escapeHtml(order.status)}<br><strong>Total:</strong> ${total}</p>
      <p><strong>Customer:</strong> ${escapeHtml(order.customer_name)}<br><strong>Email:</strong> ${escapeHtml(order.customer_email)}${order.customer_phone ? `<br><strong>Phone:</strong> ${escapeHtml(order.customer_phone)}` : ""}</p>
      <p><strong>Shipping address</strong><br>${shippingBlock(order)}</p>
      ${orderItemsTable(items)}
      <p><a href="${escapeHtml(dashboardUrl)}">Open admin dashboard</a></p>
    </div>`;

  await resend.emails.send({
    from: fromEmail(),
    to: order.customer_email,
    replyTo: fromEmail(),
    subject: `Payment Instructions for Order ${order.order_number}`,
    html: customerHtml,
  });

  await resend.emails.send({
    from: fromEmail(),
    to: adminEmail(),
    replyTo: order.customer_email,
    subject: `New Awaiting Payment Order - ${order.order_number}`,
    html: adminHtml,
  });

  return { skipped: false };
}

async function sendPaymentReceivedEmail({ order }) {
  if (emailsSkipped()) return { skipped: true };
  ensureOrderEmailConfig();

  const resend = await resendClient();
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
      <h1 style="margin:0 0 12px;">Payment Received for Order ${escapeHtml(order.order_number)}</h1>
      <p>Payment has been confirmed and your order is now being processed.</p>
      <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}</p>
      <p>Products are supplied for laboratory research use only and are not intended for human or animal consumption.</p>
    </div>`;

  await resend.emails.send({
    from: fromEmail(),
    to: order.customer_email,
    replyTo: fromEmail(),
    subject: `Payment Received for Order ${order.order_number}`,
    html,
  });

  return { skipped: false };
}

module.exports = {
  ensureOrderEmailConfig,
  paymentInstructions,
  sendOrderCreatedEmails,
  sendPaymentReceivedEmail,
};
