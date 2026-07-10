const { requireAdmin } = require("../../lib/admin-auth");
const { listCoas, createCoa } = require("../../lib/coas");
const { methodNotAllowed, sendJson } = require("../../lib/http");

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6MB raw JSON (~4MB PDF after base64)

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
      error.publicMessage = "PDF is too large (max ~4MB). Compress it and try again.";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    try {
      const coas = await listCoas();
      return sendJson(res, 200, { coas });
    } catch (error) {
      console.error("Admin list COAs failed", error);
      return sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Unable to load certificates" });
    }
  }

  try {
    const body = await readLargeJson(req);
    const base64 = String(body.file_base64 || "").replace(/^data:application\/pdf;base64,/, "");
    if (!base64) {
      return sendJson(res, 400, { error: "A PDF file is required." });
    }
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return sendJson(res, 400, { error: "Uploaded file must be a valid PDF." });
    }
    const record = await createCoa(body, { buffer, name: body.file_name || `${body.lot || "coa"}.pdf` });
    return sendJson(res, 201, { coa: record });
  } catch (error) {
    console.error("Create COA failed", error);
    return sendJson(res, error.statusCode || 500, { error: error.publicMessage || "Unable to save certificate" });
  }
};
