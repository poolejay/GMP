const { requireAdmin } = require("../../../lib/admin-auth");
const { deleteCoa, updateCoa } = require("../../../lib/coas");
const { methodNotAllowed, sendJson } = require("../../../lib/http");

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

async function readLargeJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      const error = new Error("Upload too large");
      error.statusCode = 413;
      error.publicMessage = "PDF is too large (max ~4MB).";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "PATCH") return methodNotAllowed(res, ["DELETE", "PATCH"]);
  if (!requireAdmin(req, res)) return;

  const id = req.query.id;
  if (!id) return sendJson(res, 400, { error: "Certificate id is required." });

  if (req.method === "PATCH") {
    try {
      const body = await readLargeJson(req);
      let file = null;
      if (body.file_base64) {
        const base64 = String(body.file_base64).replace(/^data:application\/pdf;base64,/, "");
        const buffer = Buffer.from(base64, "base64");
        if (!buffer.length || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
          return sendJson(res, 400, { error: "Replacement file must be a valid PDF." });
        }
        file = { buffer, name: body.file_name || `${body.lot || "coa"}.pdf` };
      }
      const updated = await updateCoa(id, body, file);
      if (!updated) return sendJson(res, 404, { error: "Certificate not found." });
      return sendJson(res, 200, { coa: updated });
    } catch (error) {
      console.error("Update COA failed", error);
      return sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Unable to update certificate" });
    }
  }

  try {
    const removed = await deleteCoa(id);
    if (!removed) return sendJson(res, 404, { error: "Certificate not found." });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Delete COA failed", error);
    return sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Unable to delete certificate" });
  }
};
