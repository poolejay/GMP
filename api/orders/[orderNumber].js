const { getPublicOrder } = require("../../lib/orders");
const { methodNotAllowed, sendJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const orderNumber = req.query.orderNumber || String(req.url || "").split("/").pop();
    const order = await getPublicOrder(orderNumber);
    return sendJson(res, 200, order);
  } catch (error) {
    console.error("Get order failed", error);
    return sendJson(res, error.statusCode || 400, {
      error: error.publicMessage || "Unable to load order",
    });
  }
};
