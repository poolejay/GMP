const { requireAdmin } = require("../../lib/admin-auth");
const { listAdminOrders } = require("../../lib/orders");
const { methodNotAllowed, sendJson } = require("../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!requireAdmin(req, res)) return;

  try {
    const status = req.query.status;
    const payload = await listAdminOrders(status);
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error("List admin orders failed", error);
    return sendJson(res, error.statusCode || 500, {
      error: error.publicMessage || "Unable to load orders",
    });
  }
};
