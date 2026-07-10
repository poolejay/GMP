const { requireAdmin } = require("../../../lib/admin-auth");
const { deleteCoa } = require("../../../lib/coas");
const { methodNotAllowed, sendJson } = require("../../../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE") return methodNotAllowed(res, ["DELETE"]);
  if (!requireAdmin(req, res)) return;

  const id = req.query.id;
  if (!id) return sendJson(res, 400, { error: "Certificate id is required." });

  try {
    const removed = await deleteCoa(id);
    if (!removed) return sendJson(res, 404, { error: "Certificate not found." });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Delete COA failed", error);
    return sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Unable to delete certificate" });
  }
};
