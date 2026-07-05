const MAX_BODY_BYTES = 750000;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

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

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  return sendJson(res, 405, { error: "Method not allowed" });
}

function requestBaseUrl(req) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:4173";
  return `${proto}://${host}`.replace(/\/$/, "");
}

module.exports = {
  sendJson,
  sendHtml,
  readJson,
  methodNotAllowed,
  requestBaseUrl,
};
