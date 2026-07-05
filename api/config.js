const { sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  return sendJson(res, 200, {
    googleMapsApiKey: process.env.PUBLIC_GOOGLE_MAPS_API_KEY || "",
    addressVerificationRequired: Boolean(process.env.PUBLIC_GOOGLE_MAPS_API_KEY),
  });
};
