const fs = require("fs");
const path = require("path");
const { hasDatabaseConfig, withClient, query } = require("./db");
const { clean, validEmail, maskEmail } = require("./format");
const {
  ensureOrderEmailConfig,
  paymentInstructions,
  sendOrderCreatedEmails,
  sendPaymentReceivedEmail,
} = require("./email");

const ORDER_STATUSES = [
  "awaiting_payment",
  "payment_submitted",
  "paid",
  "processing",
  "shipped",
  "cancelled",
  "refunded",
];

const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LOCAL_STORE_PATH = path.join(__dirname, "..", ".local", "orders.json");
const DEFAULT_PRODUCTS = [
  {
    id: "glp-3rt-10mg",
    name: "GLP-3RT 10MG",
    slug: "glp-3rt-10mg",
    description: "Research peptide supplied for laboratory catalog workflows. Lot-verified documentation available.",
    price_cents: 7900,
    image_url: "assets/3RT_10MG.png",
    is_active: true,
  },
  {
    id: "glp-3rt-30mg",
    name: "GLP-3RT 30MG",
    slug: "glp-3rt-30mg",
    description: "Research peptide supplied for laboratory catalog workflows. Lot-verified documentation available.",
    price_cents: 14900,
    image_url: "assets/3RT_30MG.png",
    is_active: true,
  },
  {
    id: "glp-2tz-20mg",
    name: "GLP-2TZ 20MG",
    slug: "glp-2tz-20mg",
    description: "Research peptide supplied with third-party analytical review and batch documentation.",
    price_cents: 14900,
    image_url: "assets/2TZ_30MG.png",
    is_active: true,
  },
  {
    id: "glp-2tz-30mg",
    name: "GLP-2TZ 30MG",
    slug: "glp-2tz-30mg",
    description: "Research peptide supplied with third-party analytical review and batch documentation.",
    price_cents: 19900,
    image_url: "assets/2TZ_30MG.png",
    is_active: true,
  },
  {
    id: "bpc-157-10mg",
    name: "BPC-157 10MG",
    slug: "bpc-157-10mg",
    description: "Synthetic research peptide supplied for laboratory research purposes only.",
    price_cents: 8900,
    image_url: "assets/BPC.png",
    is_active: true,
  },
  {
    id: "mt-2-10mg",
    name: "MT-2 10MG",
    slug: "mt-2-10mg",
    description: "Catalog research peptide with lot-specific documentation and analytical review.",
    price_cents: 6900,
    image_url: null,
    is_active: true,
  },
  {
    id: "ghk-cu-50mg",
    name: "GHK-Cu 50MG",
    slug: "ghk-cu-50mg",
    description: "Catalog research peptide supplied with batch tracking and documentation.",
    price_cents: 9900,
    image_url: null,
    is_active: true,
  },
  {
    id: "mots-c-50mg",
    name: "MOTS-c 50MG",
    slug: "mots-c-50mg",
    description: "Research peptide supplied with batch-specific COA access and third-party review.",
    price_cents: 11900,
    image_url: "assets/MOTS.png",
    is_active: true,
  },
];

function useLocalStore() {
  return String(process.env.USE_LOCAL_ORDER_STORE || "").toLowerCase() === "true" || !hasDatabaseConfig();
}

function randomOrderNumber() {
  let suffix = "";
  for (let index = 0; index < 5; index += 1) {
    suffix += ORDER_NUMBER_ALPHABET[Math.floor(Math.random() * ORDER_NUMBER_ALPHABET.length)];
  }
  return `GMP-${suffix}`;
}

function centsFromEnv(name, fallback = 0) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function calculateTotals(items) {
  const subtotalCents = items.reduce((sum, item) => sum + item.line_total_cents, 0);
  const shippingCents = centsFromEnv("FLAT_SHIPPING_CENTS", 0);
  const taxRateBps = centsFromEnv("TAX_RATE_BPS", 0);
  const taxCents = Math.round((subtotalCents + shippingCents) * (taxRateBps / 10000));
  return {
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    tax_cents: taxCents,
    total_cents: subtotalCents + shippingCents + taxCents,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function localStorePath() {
  return process.env.LOCAL_ORDER_STORE || LOCAL_STORE_PATH;
}

function readLocalStore() {
  const file = localStorePath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      products: Array.isArray(parsed.products) ? parsed.products : DEFAULT_PRODUCTS,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      order_items: Array.isArray(parsed.order_items) ? parsed.order_items : [],
      payment_proofs: Array.isArray(parsed.payment_proofs) ? parsed.payment_proofs : [],
      next_order_id: Number(parsed.next_order_id || 1),
      next_order_item_id: Number(parsed.next_order_item_id || 1),
      next_payment_proof_id: Number(parsed.next_payment_proof_id || 1),
    };
  } catch {
    return {
      products: DEFAULT_PRODUCTS,
      orders: [],
      order_items: [],
      payment_proofs: [],
      next_order_id: 1,
      next_order_item_id: 1,
      next_payment_proof_id: 1,
    };
  }
}

function writeLocalStore(store) {
  const file = localStorePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
}

function productLookupValue(item) {
  return clean(item.product_id || item.productId || item.id || item.slug || item.name, 140);
}

function localFindProduct(products, lookup) {
  const normalized = String(lookup || "").toLowerCase();
  return products.find((product) => product.is_active === true && (
    product.id === lookup ||
    product.slug === lookup ||
    String(product.name || "").toLowerCase() === normalized
  ));
}

function validateLocalCartItems(store, rawItems) {
  const input = Array.isArray(rawItems) ? rawItems : [];
  if (!input.length) {
    const error = new Error("Cart is empty");
    error.statusCode = 400;
    throw error;
  }

  const merged = new Map();
  for (const item of input) {
    const lookup = productLookupValue(item);
    const quantity = Number(item.quantity || item.qty);
    if (!lookup || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      const error = new Error("Invalid cart item");
      error.statusCode = 400;
      throw error;
    }
    merged.set(lookup, (merged.get(lookup) || 0) + quantity);
  }

  return [...merged.entries()].map(([lookup, quantity]) => {
    if (quantity > 20) {
      const error = new Error("Invalid quantity");
      error.statusCode = 400;
      throw error;
    }

    const product = localFindProduct(store.products, lookup);
    if (!product) {
      const error = new Error("Invalid cart item");
      error.statusCode = 400;
      throw error;
    }

    return {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_cents: Number(product.price_cents),
      line_total_cents: Number(product.price_cents) * quantity,
    };
  });
}

async function validateCartItems(client, rawItems) {
  const input = Array.isArray(rawItems) ? rawItems : [];
  if (!input.length) {
    const error = new Error("Cart is empty");
    error.statusCode = 400;
    throw error;
  }

  const merged = new Map();
  for (const item of input) {
    const lookup = productLookupValue(item);
    const quantity = Number(item.quantity || item.qty);
    if (!lookup || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      const error = new Error("Invalid cart item");
      error.statusCode = 400;
      throw error;
    }
    merged.set(lookup, (merged.get(lookup) || 0) + quantity);
  }

  const validated = [];
  for (const [lookup, quantity] of merged.entries()) {
    if (quantity > 20) {
      const error = new Error("Invalid quantity");
      error.statusCode = 400;
      throw error;
    }

    const result = await client.query(
      `select id, name, price_cents
       from products
       where is_active = true
         and (id = $1 or slug = $1 or lower(name) = lower($1))
       limit 1`,
      [lookup],
    );

    if (!result.rowCount) {
      const error = new Error("Invalid cart item");
      error.statusCode = 400;
      throw error;
    }

    const product = result.rows[0];
    validated.push({
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_cents: Number(product.price_cents),
      line_total_cents: Number(product.price_cents) * quantity,
    });
  }

  return validated;
}

function validateCheckoutPayload(payload) {
  if (clean(payload.website)) {
    const error = new Error("Unable to submit order");
    error.statusCode = 400;
    throw error;
  }

  const customer = payload.customer || {};
  const shipping = payload.shipping || {};
  const attestations = payload.attestations || {};

  const order = {
    customer_name: clean(customer.fullName || customer.name, 140),
    customer_email: clean(customer.email, 180).toLowerCase(),
    customer_phone: clean(customer.phone, 40) || null,
    shipping_name: clean(shipping.name || customer.fullName || customer.name, 140),
    shipping_address_1: clean(shipping.address1 || shipping.address_1, 180),
    shipping_address_2: clean(shipping.address2 || shipping.address_2, 180) || null,
    shipping_city: clean(shipping.city, 90),
    shipping_state: clean(shipping.state, 60),
    shipping_zip: clean(shipping.postalCode || shipping.zip, 40),
    shipping_country: clean(shipping.country || "United States", 80),
  };

  if (
    !order.customer_name ||
    !validEmail(order.customer_email) ||
    !order.shipping_name ||
    !order.shipping_address_1 ||
    !order.shipping_city ||
    !order.shipping_state ||
    !order.shipping_zip ||
    !order.shipping_country ||
    attestations.researchUse !== true ||
    attestations.policies !== true
  ) {
    const error = new Error("Unable to submit order");
    error.statusCode = 400;
    throw error;
  }

  return order;
}

function publicOrderPayload(order, items) {
  return {
    order_number: order.order_number,
    orderNumber: order.order_number,
    customer_name: order.customer_name,
    customer_email_masked: maskEmail(order.customer_email),
    shipping: {
      name: order.shipping_name,
      address_1: order.shipping_address_1,
      address_2: order.shipping_address_2,
      city: order.shipping_city,
      state: order.shipping_state,
      zip: order.shipping_zip,
      country: order.shipping_country,
    },
    subtotal_cents: Number(order.subtotal_cents),
    shipping_cents: Number(order.shipping_cents),
    tax_cents: Number(order.tax_cents),
    total_cents: Number(order.total_cents),
    status: order.status,
    payment_method: order.payment_method,
    payment_instructions_sent_at: order.payment_instructions_sent_at,
    created_at: order.created_at,
    items: items.map((item) => ({
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit_price_cents: Number(item.unit_price_cents),
      line_total_cents: Number(item.line_total_cents),
    })),
    payment_instructions: paymentInstructions(),
  };
}

async function createLocalOrder(payload, options = {}) {
  const baseOrder = validateCheckoutPayload(payload);
  const rawItems = payload.items || payload.cart;
  const store = readLocalStore();
  const items = validateLocalCartItems(store, rawItems);
  const totals = calculateTotals(items);
  let orderNumber = randomOrderNumber();
  while (store.orders.some((order) => order.order_number === orderNumber)) {
    orderNumber = randomOrderNumber();
  }

  const timestamp = nowIso();
  const order = {
    id: store.next_order_id,
    order_number: orderNumber,
    customer_email: baseOrder.customer_email,
    customer_name: baseOrder.customer_name,
    customer_phone: baseOrder.customer_phone,
    shipping_name: baseOrder.shipping_name,
    shipping_address_1: baseOrder.shipping_address_1,
    shipping_address_2: baseOrder.shipping_address_2,
    shipping_city: baseOrder.shipping_city,
    shipping_state: baseOrder.shipping_state,
    shipping_zip: baseOrder.shipping_zip,
    shipping_country: baseOrder.shipping_country,
    subtotal_cents: totals.subtotal_cents,
    shipping_cents: totals.shipping_cents,
    tax_cents: totals.tax_cents,
    total_cents: totals.total_cents,
    status: "awaiting_payment",
    payment_method: "manual_payment",
    payment_instructions_sent_at: null,
    paid_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const insertedItems = items.map((item, index) => ({
    id: store.next_order_item_id + index,
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price_cents: item.unit_price_cents,
    line_total_cents: item.line_total_cents,
    created_at: timestamp,
  }));

  store.orders.unshift(order);
  store.order_items.push(...insertedItems);
  store.next_order_id += 1;
  store.next_order_item_id += insertedItems.length;

  const emailResult = await sendOrderCreatedEmails({
    order,
    items: insertedItems,
    baseUrl: options.baseUrl || "",
  });

  if (!emailResult.skipped) {
    order.payment_instructions_sent_at = nowIso();
    order.updated_at = order.payment_instructions_sent_at;
  }

  writeLocalStore(store);
  return publicOrderPayload(order, insertedItems);
}

function getLocalPublicOrder(orderNumber) {
  const number = clean(orderNumber, 40).toUpperCase();
  const store = readLocalStore();
  const order = store.orders.find((entry) => entry.order_number === number);
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const items = store.order_items.filter((item) => item.order_id === order.id);
  return publicOrderPayload(order, items);
}

function listLocalAdminOrders(status) {
  const normalizedStatus = clean(status, 40);
  const store = readLocalStore();
  const orders = store.orders
    .filter((order) => !normalizedStatus || order.status === normalizedStatus)
    .map((order) => ({
      ...order,
      items: store.order_items.filter((item) => item.order_id === order.id),
    }));

  return {
    statuses: ORDER_STATUSES,
    orders,
  };
}

async function updateLocalOrderStatus(orderId, status) {
  const id = Number(orderId);
  const nextStatus = clean(status, 40);
  if (!Number.isInteger(id) || id < 1 || !ORDER_STATUSES.includes(nextStatus)) {
    const error = new Error("Invalid order status");
    error.statusCode = 400;
    throw error;
  }

  const store = readLocalStore();
  const order = store.orders.find((entry) => entry.id === id);
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const previousStatus = order.status;
  order.status = nextStatus;
  order.updated_at = nowIso();
  if (nextStatus === "paid" && !order.paid_at) order.paid_at = order.updated_at;

  if (nextStatus === "paid" && previousStatus !== "paid") {
    await sendPaymentReceivedEmail({ order });
  }

  writeLocalStore(store);
  return order;
}

async function createOrder(payload, options = {}) {
  if (useLocalStore()) return createLocalOrder(payload, options);
  ensureOrderEmailConfig();
  const baseOrder = validateCheckoutPayload(payload);
  const rawItems = payload.items || payload.cart;

  let created;
  await withClient(async (client) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const items = await validateCartItems(client, rawItems);
      const totals = calculateTotals(items);
      const orderNumber = randomOrderNumber();

      try {
        await client.query("begin");
        const orderResult = await client.query(
          `insert into orders (
            order_number,
            customer_email,
            customer_name,
            customer_phone,
            shipping_name,
            shipping_address_1,
            shipping_address_2,
            shipping_city,
            shipping_state,
            shipping_zip,
            shipping_country,
            subtotal_cents,
            shipping_cents,
            tax_cents,
            total_cents,
            status,
            payment_method
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, 'awaiting_payment', 'manual_payment'
          )
          returning *`,
          [
            orderNumber,
            baseOrder.customer_email,
            baseOrder.customer_name,
            baseOrder.customer_phone,
            baseOrder.shipping_name,
            baseOrder.shipping_address_1,
            baseOrder.shipping_address_2,
            baseOrder.shipping_city,
            baseOrder.shipping_state,
            baseOrder.shipping_zip,
            baseOrder.shipping_country,
            totals.subtotal_cents,
            totals.shipping_cents,
            totals.tax_cents,
            totals.total_cents,
          ],
        );

        const order = orderResult.rows[0];
        const insertedItems = [];
        for (const item of items) {
          const itemResult = await client.query(
            `insert into order_items (
              order_id,
              product_id,
              product_name,
              quantity,
              unit_price_cents,
              line_total_cents
            ) values ($1, $2, $3, $4, $5, $6)
            returning *`,
            [
              order.id,
              item.product_id,
              item.product_name,
              item.quantity,
              item.unit_price_cents,
              item.line_total_cents,
            ],
          );
          insertedItems.push(itemResult.rows[0]);
        }

        await client.query("commit");
        created = { order, items: insertedItems };
        return;
      } catch (error) {
        await client.query("rollback");
        if (error.code === "23505" && attempt < 4) continue;
        throw error;
      }
    }
  });

  if (!created) {
    const error = new Error("Unable to generate order number");
    error.statusCode = 500;
    throw error;
  }

  const emailResult = await sendOrderCreatedEmails({
    order: created.order,
    items: created.items,
    baseUrl: options.baseUrl || "",
  });

  if (!emailResult.skipped) {
    const sentResult = await query(
      `update orders
       set payment_instructions_sent_at = now(), updated_at = now()
       where id = $1
       returning *`,
      [created.order.id],
    );
    created.order = sentResult.rows[0] || created.order;
  }

  return publicOrderPayload(created.order, created.items);
}

async function getPublicOrder(orderNumber) {
  if (useLocalStore()) return getLocalPublicOrder(orderNumber);
  const number = clean(orderNumber, 40).toUpperCase();
  const orderResult = await query("select * from orders where order_number = $1", [number]);
  if (!orderResult.rowCount) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const itemsResult = await query(
    "select * from order_items where order_id = $1 order by id",
    [orderResult.rows[0].id],
  );
  return publicOrderPayload(orderResult.rows[0], itemsResult.rows);
}

async function listAdminOrders(status) {
  if (useLocalStore()) return listLocalAdminOrders(status);
  const normalizedStatus = clean(status, 40);
  const params = [];
  let where = "";
  if (normalizedStatus && ORDER_STATUSES.includes(normalizedStatus)) {
    params.push(normalizedStatus);
    where = "where o.status = $1";
  }

  const result = await query(
    `select
      o.*,
      coalesce(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price_cents', oi.unit_price_cents,
            'line_total_cents', oi.line_total_cents
          )
          order by oi.id
        ) filter (where oi.id is not null),
        '[]'
      ) as items
    from orders o
    left join order_items oi on oi.order_id = o.id
    ${where}
    group by o.id
    order by o.created_at desc
    limit 200`,
    params,
  );

  return {
    statuses: ORDER_STATUSES,
    orders: result.rows.map((order) => ({
      ...order,
      subtotal_cents: Number(order.subtotal_cents),
      shipping_cents: Number(order.shipping_cents),
      tax_cents: Number(order.tax_cents),
      total_cents: Number(order.total_cents),
      items: Array.isArray(order.items) ? order.items : JSON.parse(order.items || "[]"),
    })),
  };
}

async function updateOrderStatus(orderId, status) {
  if (useLocalStore()) return updateLocalOrderStatus(orderId, status);
  const id = Number(orderId);
  const nextStatus = clean(status, 40);
  if (!Number.isInteger(id) || id < 1 || !ORDER_STATUSES.includes(nextStatus)) {
    const error = new Error("Invalid order status");
    error.statusCode = 400;
    throw error;
  }

  const currentResult = await query("select * from orders where id = $1", [id]);
  if (!currentResult.rowCount) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const previous = currentResult.rows[0];
  const updatedResult = await query(
    `update orders
     set status = $2,
         paid_at = case when $2 = 'paid' and paid_at is null then now() else paid_at end,
         updated_at = now()
     where id = $1
     returning *`,
    [id, nextStatus],
  );

  const updated = updatedResult.rows[0];
  if (nextStatus === "paid" && previous.status !== "paid") {
    await sendPaymentReceivedEmail({ order: updated });
  }

  return updated;
}

module.exports = {
  ORDER_STATUSES,
  createOrder,
  getPublicOrder,
  listAdminOrders,
  updateOrderStatus,
};
