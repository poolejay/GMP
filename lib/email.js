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
      enabled: process.env.PAYMENT_CASHAPP_ENABLED,
      label: process.env.PAYMENT_CASHAPP_LABEL || "Cash App",
      instructions: process.env.PAYMENT_CASHAPP_INSTRUCTIONS || "Send your order total to $GMPpayment on Cash App, and put your order number in the note.",
    },
    {
      enabled: process.env.PAYMENT_VENMO_ENABLED,
      label: process.env.PAYMENT_VENMO_LABEL || "Venmo",
      instructions: process.env.PAYMENT_VENMO_INSTRUCTIONS || "Send your order total to @GMP_payments on Venmo, and put your order number in the note.",
    },
    {
      enabled: process.env.PAYMENT_PAYPAL_ENABLED,
      label: process.env.PAYMENT_PAYPAL_LABEL || "PayPal",
      instructions: process.env.PAYMENT_PAYPAL_INSTRUCTIONS || "Send your order total to support@goodmorningpeptides.com on PayPal, and include your order number.",
    },
    {
      enabled: process.env.PAYMENT_ZELLE_ENABLED,
      label: process.env.PAYMENT_ZELLE_LABEL || "Zelle",
      instructions: process.env.PAYMENT_ZELLE_INSTRUCTIONS || "Send your order total to GoodMorningPeps on Zelle. If an email is required, use support@goodmorningpeptides.com.",
    },
  ]
    .filter((method) => String(method.enabled || "true").toLowerCase() !== "false")
    .map((method) => ({
      label: clean(method.label, 80),
      instructions: clean(method.instructions, 240),
    }));
}

function firstNameOf(order) {
  const name = String(order.customer_name || "").trim();
  const first = name.split(/\s+/)[0];
  return escapeHtml(first || "there");
}

function emailShell(innerHtml, preheader) {
  const pre = preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f2fb;">${escapeHtml(preheader)}</span>`
    : "";
  return `<div style="margin:0;padding:0;background:#f4f2fb;">
    ${pre}
    <div style="max-width:600px;margin:0 auto;padding:0 12px 30px;font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
      <div style="text-align:center;padding:26px 16px 18px;">
        <span style="display:inline-block;background:#0c0247;border-radius:16px;padding:16px 26px;">
          <img src="https://goodmorningpeptides.com/assets/GMPLogo.png" width="210" height="49" alt="Good Morning Peptides" style="display:inline-block;border:0;max-width:210px;height:auto;vertical-align:middle;" />
        </span>
      </div>
      <div style="background:#ffffff;border:1px solid #e4dfef;border-radius:16px;padding:28px 26px 30px;">
        ${innerHtml}
      </div>
      <p style="text-align:center;color:#8b86a0;font-size:12px;margin:18px 0 0;">Good Morning Peptides &middot; For laboratory research use only</p>
    </div>
  </div>`;
}

function orderSummaryTable(order) {
  const rows = [["Subtotal", formatMoneyCents(Number(order.subtotal_cents || 0))]];
  rows.push(["Shipping", Number(order.shipping_cents || 0) > 0 ? formatMoneyCents(order.shipping_cents) : "Free"]);
  if (Number(order.tax_cents || 0) > 0) rows.push(["Tax", formatMoneyCents(order.tax_cents)]);
  const body = rows.map(([label, value]) => `<tr>
      <td style="padding:5px 0;color:#555;">${label}</td>
      <td align="right" style="padding:5px 0;">${value}</td>
    </tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 4px;">
    ${body}
    <tr>
      <td style="padding:11px 0 0;border-top:2px solid #e4dfef;font-weight:800;font-size:16px;">Total</td>
      <td align="right" style="padding:11px 0 0;border-top:2px solid #e4dfef;font-weight:800;font-size:16px;">${formatMoneyCents(Number(order.total_cents || 0))}</td>
    </tr>
  </table>`;
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

function orderCreatedCustomerHtml(order, items) {
  const total = formatMoneyCents(Number(order.total_cents || 0));
  const inner = `
      <h1 style="margin:0 0 6px;font-family:'Zilla Slab',Georgia,serif;font-size:26px;line-height:1.15;">Good morning, ${firstNameOf(order)} &#9728;&#65039;</h1>
      <p style="margin:0 0 16px;font-size:16px;">Thank you for your order — we're glad you're starting your day with us.</p>
      <p style="margin:0 0 6px;">We've received order <strong>${escapeHtml(order.order_number)}</strong> and it's currently <strong>awaiting payment</strong>. As soon as your payment is confirmed, we'll pack it up and get it on its way. Here's what you ordered:</p>
      ${orderItemsTable(items)}
      ${orderSummaryTable(order)}
      <p style="margin:20px 0 4px;"><strong>Shipping to</strong></p>
      <p style="margin:0 0 6px;color:#555;">${shippingBlock(order)}</p>

      <h2 style="margin:26px 0 6px;font-family:'Zilla Slab',Georgia,serif;font-size:20px;">Complete your payment</h2>
      <p style="margin:0 0 12px;">Pick whichever option is easiest and send your order total of <strong>${total}</strong>. Your order stays reserved as <strong>awaiting payment</strong> until we confirm it.</p>

      <div style="margin:14px 0;padding:15px 16px;border-left:4px solid #f5a623;border-radius:10px;background:#fff7ea;">
        <strong>Important — please read before you pay.</strong>
        <p style="margin:7px 0 0;">In the payment note/memo, include <strong>only your order number: ${escapeHtml(order.order_number)}</strong>. Do <strong>not</strong> mention the product, peptides, research, or any other details anywhere in the note, comment, or memo. This keeps your payment private and moving quickly.</p>
      </div>

      ${paymentInstructionHtml()}

      <p style="margin:20px 0 0;">Questions about your order? Just reply to this email or reach us at <a href="mailto:support@goodmorningpeptides.com" style="color:#f5a623;font-weight:700;text-decoration:none;">support@goodmorningpeptides.com</a>.</p>
      <p style="margin:16px 0 0;">Rise and research,<br><strong>The Good Morning Peptides team</strong></p>
      <p style="margin:20px 0 0;font-size:12px;color:#8b86a0;">Products are supplied strictly for laboratory research use only and are not intended for human or animal consumption.</p>`;
  return emailShell(inner, `Thank you for order ${order.order_number} — payment details inside.`);
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
  const customerHtml = orderCreatedCustomerHtml(order, items);

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
    subject: `Thank you for your order ${order.order_number} — payment details inside`,
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
  const inner = `
      <h1 style="margin:0 0 6px;font-family:'Zilla Slab',Georgia,serif;font-size:26px;line-height:1.15;">Good news, ${firstNameOf(order)} &#9728;&#65039;</h1>
      <p style="margin:0 0 14px;font-size:16px;">Your payment is confirmed — thank you!</p>
      <p style="margin:0 0 6px;">We've received payment for order <strong>${escapeHtml(order.order_number)}</strong>, and it's now being processed and prepped to ship. We'll be in touch if we need anything at all.</p>
      <p style="margin:16px 0 0;">Thanks again for starting your day with us.</p>
      <p style="margin:16px 0 0;">Rise and research,<br><strong>The Good Morning Peptides team</strong></p>
      <p style="margin:20px 0 0;font-size:12px;color:#8b86a0;">Products are supplied strictly for laboratory research use only and are not intended for human or animal consumption.</p>`;
  const html = emailShell(inner, `Payment confirmed for order ${order.order_number}.`);

  await resend.emails.send({
    from: fromEmail(),
    to: order.customer_email,
    replyTo: fromEmail(),
    subject: `Payment received for order ${order.order_number} — it's on the way`,
    html,
  });

  return { skipped: false };
}

module.exports = {
  ensureOrderEmailConfig,
  paymentInstructions,
  orderCreatedCustomerHtml,
  sendOrderCreatedEmails,
  sendPaymentReceivedEmail,
};
