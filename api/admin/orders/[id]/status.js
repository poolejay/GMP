const { requireAdmin } = require("../../../../lib/admin-auth");
const { updateOrderStatus } = require("../../../../lib/orders");
const { methodNotAllowed, readJson, sendJson } = require("../../../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireAdmin(req, res)) return;

  try {
    const payload = await readJson(req);
    const id = req.query.id || String(req.url || "").split("/").slice(-2)[0];
    const order = await updateOrderStatus(id, payload.status);
    return sendJson(res, 200, { order });
  } catch (error) {
    console.error("Update order status failed", error);
    return sendJson(res, error.statusCode || 400, {
      error: error.publicMessage || "Unable to update order",
    });
  }
};
