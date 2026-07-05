const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 4173);

process.env.USE_LOCAL_ORDER_STORE ||= "true";
process.env.SKIP_ORDER_EMAILS ||= "true";
process.env.ADMIN_USERNAME ||= "admin";
process.env.ADMIN_PASSWORD ||= "admin";
process.env.ADMIN_ORDER_EMAIL ||= "admin@example.com";
process.env.PUBLIC_SITE_URL ||= `http://localhost:${port}`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function api(modulePath) {
  return require(path.join(root, modulePath));
}

function staticFile(res, filePath, statusCode = 200) {
  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    res.statusCode = statusCode;
    res.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    res.end(body);
  });
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(root, normalized);
}

async function handleApi(handler, req, res, query = {}) {
  req.query = Object.fromEntries(query);
  await handler(req, res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
    const pathname = url.pathname;

    if (pathname === "/api/orders/create") {
      return handleApi(api("api/orders/create.js"), req, res, url.searchParams);
    }

    if (pathname === "/api/config") {
      return handleApi(api("api/config.js"), req, res, url.searchParams);
    }

    const publicOrderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (publicOrderMatch) {
      const query = new URLSearchParams(url.searchParams);
      query.set("orderNumber", decodeURIComponent(publicOrderMatch[1]));
      return handleApi(api("api/orders/[orderNumber].js"), req, res, query);
    }

    if (pathname === "/api/admin/orders") {
      return handleApi(api("api/admin/orders.js"), req, res, url.searchParams);
    }

    const statusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if (statusMatch) {
      const query = new URLSearchParams(url.searchParams);
      query.set("id", decodeURIComponent(statusMatch[1]));
      return handleApi(api("api/admin/orders/[id]/status.js"), req, res, query);
    }

    if (pathname === "/api/create-order") {
      return handleApi(api("api/create-order.js"), req, res, url.searchParams);
    }

    if (pathname === "/admin/orders") {
      return handleApi(api("api/admin/orders-page.js"), req, res, url.searchParams);
    }

    if (pathname.startsWith("/order-confirmation/")) {
      return staticFile(res, path.join(root, "order-confirmation.html"));
    }

    let filePath = pathname === "/" ? path.join(root, "index.html") : safeStaticPath(pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (fs.existsSync(filePath)) return staticFile(res, filePath);

    const notFound = path.join(root, "404.html");
    if (fs.existsSync(notFound)) return staticFile(res, notFound, 404);

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal server error");
  }
});

server.listen(port, () => {
  console.log(`GMP local checkout server running at http://localhost:${port}`);
  console.log(`Admin login: ${process.env.ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD}`);
  console.log(`Local order store: ${process.env.LOCAL_ORDER_STORE || path.join(root, ".local", "orders.json")}`);
});
