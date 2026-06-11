const MAX_BODY_BYTES = 750000;

const catalog = {
  "GLP-3RT 10MG": { name: "GLP-3RT 10MG", price: 79 },
  "GLP-3RT 30MG": { name: "GLP-3RT 30MG", price: 149 },
  "GLP-2TZ 20MG": { name: "GLP-2TZ 20MG", price: 149 },
  "GLP-2TZ 30MG": { name: "GLP-2TZ 30MG", price: 199 },
  "BPC-157 10MG": { name: "BPC-157 10MG", price: 89 },
  "MT-2 10MG": { name: "MT-2 10MG", price: 69 },
  "GHK-Cu 50MG": { name: "GHK-Cu 50MG", price: 99 },
  "MOTS-c 50MG": { name: "MOTS-c 50MG", price: 119 },
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let size = 0;
  let body = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    body += chunk;
  }
  return JSON.parse(body || "{}");
}

function clean(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 2000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function orderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  return `GMP-${date}-${suffix}`;
}

function enabledPaymentMethods() {
  const definitions = [
    ["Zelle", process.env.PAYMENT_ZELLE_ENABLED, process.env.PAYMENT_ZELLE_LABEL, process.env.PAYMENT_ZELLE_INSTRUCTIONS],
    ["Venmo Business", process.env.PAYMENT_VENMO_ENABLED, process.env.PAYMENT_VENMO_LABEL, process.env.PAYMENT_VENMO_INSTRUCTIONS],
    ["Cash App Business", process.env.PAYMENT_CASHAPP_ENABLED, process.env.PAYMENT_CASHAPP_LABEL, process.env.PAYMENT_CASHAPP_INSTRUCTIONS],
  ];

  return definitions
    .filter(([, enabled, , instructions]) => String(enabled || "").toLowerCase() === "true" && clean(instructions, 1000))
    .map(([name, , label, instructions]) => ({ name, label: clean(label || name), instructions: clean(instructions, 1000) }));
}

function validateCart(cart) {
  if (!Array.isArray(cart) || !cart.length) throw new Error("Cart is empty");

  return cart.map((item) => {
    const name = clean(item.name, 120);
    const qty = Number(item.qty);
    const catalogItem = catalog[name];
    if (!catalogItem) throw new Error("Invalid cart item");
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error("Invalid quantity");
    return {
      name: catalogItem.name,
      qty,
      price: catalogItem.price,
      lineTotal: catalogItem.price * qty,
    };
  });
}

function orderSummaryHtml(items) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead><tr><th align="left">Item</th><th align="center">Qty</th><th align="right">Total</th></tr></thead>
    <tbody>${items.map((item) => `<tr>
      <td style="padding:8px 0;border-top:1px solid #e4dfef;">${escapeHtml(item.name)}</td>
      <td align="center" style="padding:8px 0;border-top:1px solid #e4dfef;">${item.qty}</td>
      <td align="right" style="padding:8px 0;border-top:1px solid #e4dfef;">${money(item.lineTotal)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function paymentMethodsHtml(methods) {
  if (!methods.length) return "<p>Payment instructions will be provided by support after order review.</p>";
  return methods.map((method) => `<div style="margin:14px 0;padding:14px;border:1px solid #e4dfef;border-radius:12px;">
    <strong>${escapeHtml(method.label)}</strong>
    <p style="margin:8px 0 0;">${escapeHtml(method.instructions)}</p>
  </div>`).join("");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const payload = await readJson(req);
    if (clean(payload.website)) return sendJson(res, 400, { error: "Unable to submit order" });

    const customer = payload.customer || {};
    const shipping = payload.shipping || {};
    const attestations = payload.attestations || {};

    const fullName = clean(customer.fullName);
    const email = clean(customer.email);
    const phone = clean(customer.phone, 40);
    const address1 = clean(shipping.address1);
    const address2 = clean(shipping.address2);
    const city = clean(shipping.city);
    const state = clean(shipping.state, 60);
    const postalCode = clean(shipping.postalCode, 40);
    const country = clean(shipping.country || "United States", 80);
    const orderNote = clean(payload.orderNote, 600);

    if (!fullName || !validEmail(email) || !address1 || !city || !state || !postalCode || !country) {
      return sendJson(res, 400, { error: "Unable to submit order" });
    }
    if (attestations.researchUse !== true || attestations.policies !== true) {
      return sendJson(res, 400, { error: "Unable to submit order" });
    }

    const items = validateCart(payload.cart);
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const paymentMethods = enabledPaymentMethods();
    const number = orderNumber();
    const createdAt = new Date().toISOString();
    const status = "Pending Payment";

    const from = process.env.ORDER_FROM_EMAIL || "orders@goodmorningpeptides.com";
    const adminEmail = process.env.ORDER_ADMIN_EMAIL;
    const replyTo = process.env.ORDER_REPLY_TO_EMAIL || email;

    if (!process.env.RESEND_API_KEY || !adminEmail) {
      console.error("Order email environment is not configured");
      return sendJson(res, 500, { error: "Unable to submit order" });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const summary = orderSummaryHtml(items);
    const methodsHtml = paymentMethodsHtml(paymentMethods);
    const memo = "Include only your order number in the payment memo so we can match your payment to your order.";
    const disclaimer = "Products are supplied for laboratory research use only and are not intended for human or animal consumption.";

    const customerHtml = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
        <h1 style="margin:0 0 12px;">Good Morning Peptides</h1>
        <p>Thank you for your order. Your order has been received and is pending payment verification.</p>
        <p><strong>Order:</strong> ${escapeHtml(number)}<br><strong>Status:</strong> ${status}<br><strong>Total due:</strong> ${money(total)}</p>
        ${summary}
        <p>Please send the exact total using one of the payment methods below. ${memo}</p>
        ${methodsHtml}
        <p>Orders are reviewed and processed only after payment is confirmed.</p>
        <p>Do not include medical, dosing, treatment, injection, personal-use, or health information in payment notes or order communications.</p>
        <p>${disclaimer}</p>
      </div>`;

    const adminHtml = `
      <div style="font-family:Inter,Arial,sans-serif;color:#0c0247;line-height:1.6;">
        <h1 style="margin:0 0 12px;">New pending payment order ${escapeHtml(number)}</h1>
        <p><strong>Timestamp:</strong> ${escapeHtml(createdAt)}<br><strong>Status:</strong> ${status}</p>
        <p><strong>Customer:</strong> ${escapeHtml(fullName)}<br><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Phone:</strong> ${escapeHtml(phone || "Not provided")}</p>
        <p><strong>Shipping:</strong><br>${escapeHtml(address1)}${address2 ? `<br>${escapeHtml(address2)}` : ""}<br>${escapeHtml(city)}, ${escapeHtml(state)} ${escapeHtml(postalCode)}<br>${escapeHtml(country)}</p>
        ${orderNote ? `<p><strong>Shipping or order note:</strong> ${escapeHtml(orderNote)}</p>` : ""}
        ${summary}
        <p><strong>Total:</strong> ${money(total)}</p>
        <p><strong>Attestations:</strong><br>Research use: ${attestations.researchUse === true}<br>Policies: ${attestations.policies === true}</p>
        <p><strong>Payment methods shown:</strong> ${paymentMethods.map((method) => escapeHtml(method.label)).join(", ") || "None configured"}</p>
        <p>Verify payment manually before fulfillment. Do not treat this order as payment confirmed until manual verification is complete.</p>
      </div>`;

    // Future order adapter: persist order data to Supabase, Airtable, or another order system here.
    await resend.emails.send({
      from,
      to: email,
      replyTo,
      subject: `Payment instructions for Good Morning Peptides order ${number}`,
      html: customerHtml,
    });

    await resend.emails.send({
      from,
      to: adminEmail,
      replyTo,
      subject: `New pending payment order ${number}`,
      html: adminHtml,
    });

    return sendJson(res, 200, {
      orderNumber: number,
      status,
      total,
      paymentMethods,
      paymentMemo: memo,
    });
  } catch (error) {
    console.error("Create order failed", error);
    return sendJson(res, error.statusCode || 400, { error: "Unable to submit order" });
  }
};
