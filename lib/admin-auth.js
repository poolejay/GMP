const crypto = require("crypto");
const { sendJson } = require("./http");

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseBasic(value) {
  const match = String(value || "").match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const split = decoded.indexOf(":");
  if (split < 0) return null;
  return {
    username: decoded.slice(0, split),
    password: decoded.slice(split + 1),
  };
}

function hasAdminConfig() {
  return Boolean(process.env.ADMIN_API_TOKEN || process.env.ADMIN_PASSWORD);
}

function isAdminRequest(req) {
  const auth = req.headers.authorization || "";
  const token = process.env.ADMIN_API_TOKEN;
  if (token && auth.toLowerCase().startsWith("bearer ")) {
    return safeEqual(auth.slice(7).trim(), token);
  }

  const basic = parseBasic(auth);
  const password = process.env.ADMIN_PASSWORD;
  if (basic && password) {
    const username = process.env.ADMIN_USERNAME || "admin";
    return safeEqual(basic.username, username) && safeEqual(basic.password, password);
  }

  return false;
}

function requireAdmin(req, res, options = {}) {
  if (!hasAdminConfig()) {
    return sendJson(res, 503, { error: "Admin authentication is not configured" });
  }

  if (isAdminRequest(req)) return true;

  if (options.challenge !== false) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Good Morning Peptides Admin"');
  }
  sendJson(res, 401, { error: "Admin authentication required" });
  return false;
}

// CSRF guard for admin mutations: browsers auto-attach Basic credentials to
// cross-site requests, but cross-site forms cannot send application/json and
// cross-origin fetch with a JSON content type fails the CORS preflight.
function requireJsonContent(req, res) {
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (type.includes("application/json")) return true;
  sendJson(res, 415, { error: "Content-Type must be application/json" });
  return false;
}

module.exports = {
  hasAdminConfig,
  isAdminRequest,
  requireAdmin,
  requireJsonContent,
};
