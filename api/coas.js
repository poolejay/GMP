const { getCoaDrive } = require("../lib/coas");
const { methodNotAllowed, sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const payload = await getCoaDrive();
    res.setHeader("Cache-Control", "no-store");
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error("List COAs failed", error);
    return sendJson(res, error.statusCode || 500, {
      error: error.publicMessage || "Unable to load certificates",
    });
  }
};
