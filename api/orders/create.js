const { createOrder } = require("../../lib/orders");
const { methodNotAllowed, readJson, requestBaseUrl, sendJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const payload = await readJson(req);
    const order = await createOrder(payload, { baseUrl: requestBaseUrl(req) });
    return sendJson(res, 200, order);
  } catch (error) {
    console.error("Create order failed", error);
    return sendJson(res, error.statusCode || 400, {
      error: error.publicMessage || "Unable to submit order",
    });
  }
};
