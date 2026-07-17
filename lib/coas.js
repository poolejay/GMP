const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { hasDatabaseConfig, query } = require("./db");

// Product "folders" shown in the COA drive. Kept in sync with the active catalog.
const COA_PRODUCTS = [
  { id: "glp-3rt", name: "GLP-3RT" },
  { id: "glp-2tz", name: "GLP-2TZ" },
  { id: "ghk-cu", name: "GHK-Cu" },
  { id: "mots-c", name: "MOTS-c" },
];

const LOCAL_STORE_PATH = path.join(__dirname, "..", ".local", "coas.json");
const LOCAL_FILES_DIR = path.join(__dirname, "..", "assets", "coa");
const ALLOWED_STATUS = new Set(["Released", "Pending"]);

function useLocalStore() {
  return String(process.env.USE_LOCAL_ORDER_STORE || "").toLowerCase() === "true" || !hasDatabaseConfig();
}

function productById(id) {
  return COA_PRODUCTS.find((product) => product.id === id) || null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  ensureDir(path.dirname(LOCAL_STORE_PATH));
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(rows, null, 2));
}

// ---- Vercel Blob index (production): store the certificate list as a JSON blob ----
const BLOB_INDEX_PATH = "coa-index.json";

function blobMode() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readIndex() {
  const { list } = require("@vercel/blob");
  const { blobs } = await list({ prefix: BLOB_INDEX_PATH, limit: 1 });
  const found = blobs.find((b) => b.pathname === BLOB_INDEX_PATH);
  if (!found) return [];
  const res = await fetch(`${found.url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function writeIndex(rows) {
  const { put } = require("@vercel/blob");
  await put(BLOB_INDEX_PATH, JSON.stringify(rows), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

function sanitizeFileName(name) {
  const base = String(name || "coa.pdf").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

// Store a PDF buffer. Uses Vercel Blob in production (when configured),
// otherwise writes to assets/coa/ for local development.
async function storePdf(buffer, originalName) {
  const unique = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const fileName = sanitizeFileName(originalName);
  const key = `coa/${unique}-${fileName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = require("@vercel/blob");
      const blob = await put(key, buffer, { access: "public", contentType: "application/pdf" });
      return { url: blob.url, storage: "blob" };
    } catch (error) {
      error.publicMessage = "File storage is not available. Confirm Vercel Blob is enabled.";
      throw error;
    }
  }

  ensureDir(LOCAL_FILES_DIR);
  const localName = `${unique}-${fileName}`;
  fs.writeFileSync(path.join(LOCAL_FILES_DIR, localName), buffer);
  return { url: `/assets/coa/${localName}`, storage: "local" };
}

function mapRow(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    lot: row.lot,
    test_date: row.test_date || null,
    purity: row.purity || null,
    method: row.method || null,
    status: row.status || "Released",
    file_url: row.file_url,
    file_name: row.file_name || null,
    created_at: row.created_at,
  };
}

async function listCoas() {
  if (blobMode()) {
    return (await readIndex())
      .map(mapRow)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  if (useLocalStore()) {
    return readLocal()
      .map(mapRow)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  const result = await query(
    `select id, product_id, product_name, lot, to_char(test_date, 'YYYY-MM-DD') as test_date,
            purity, method, status, file_url, file_name, created_at
     from coas order by created_at desc`,
  );
  return result.rows.map(mapRow);
}

// Public payload: folder list (with counts) + all certificate rows.
async function getCoaDrive() {
  const coas = await listCoas();
  const counts = coas.reduce((acc, coa) => {
    acc[coa.product_id] = (acc[coa.product_id] || 0) + 1;
    return acc;
  }, {});
  const products = COA_PRODUCTS.map((product) => ({
    ...product,
    count: counts[product.id] || 0,
  }));
  return { products, coas };
}

function validateInput(input) {
  const product = productById(input.product_id);
  if (!product) {
    const error = new Error("Unknown product");
    error.statusCode = 400;
    error.publicMessage = "Select a valid product.";
    throw error;
  }
  const lot = String(input.lot || "").trim();
  if (!lot) {
    const error = new Error("Missing lot");
    error.statusCode = 400;
    error.publicMessage = "Lot number is required.";
    throw error;
  }
  const status = ALLOWED_STATUS.has(input.status) ? input.status : "Released";
  const testDate = String(input.test_date || "").trim() || null;
  if (testDate && !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    const error = new Error("Bad date");
    error.statusCode = 400;
    error.publicMessage = "Test date must be YYYY-MM-DD.";
    throw error;
  }
  return {
    product,
    lot,
    status,
    test_date: testDate,
    purity: String(input.purity || "").trim() || null,
    method: String(input.method || "").trim() || null,
  };
}

async function createCoa(input, file) {
  const clean = validateInput(input);
  const stored = await storePdf(file.buffer, file.name);
  const record = {
    id: crypto.randomUUID(),
    product_id: clean.product.id,
    product_name: clean.product.name,
    lot: clean.lot,
    test_date: clean.test_date,
    purity: clean.purity,
    method: clean.method,
    status: clean.status,
    file_url: stored.url,
    file_name: sanitizeFileName(file.name),
    created_at: new Date().toISOString(),
  };

  if (blobMode()) {
    const rows = await readIndex();
    rows.push(record);
    await writeIndex(rows);
    return mapRow(record);
  }

  if (useLocalStore()) {
    const rows = readLocal();
    rows.push(record);
    writeLocal(rows);
    return mapRow(record);
  }

  await query(
    `insert into coas (id, product_id, product_name, lot, test_date, purity, method, status, file_url, file_name)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [record.id, record.product_id, record.product_name, record.lot, record.test_date,
     record.purity, record.method, record.status, record.file_url, record.file_name],
  );
  return record;
}

async function deleteCoa(id) {
  if (blobMode()) {
    const rows = await readIndex();
    const target = rows.find((row) => row.id === id);
    const next = rows.filter((row) => row.id !== id);
    if (next.length === rows.length) return false;
    await writeIndex(next);
    if (target && target.file_url) {
      try { const { del } = require("@vercel/blob"); await del(target.file_url); } catch { /* best effort */ }
    }
    return true;
  }
  if (useLocalStore()) {
    const rows = readLocal();
    const next = rows.filter((row) => row.id !== id);
    writeLocal(next);
    return next.length !== rows.length;
  }
  const result = await query("delete from coas where id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  COA_PRODUCTS,
  getCoaDrive,
  listCoas,
  createCoa,
  deleteCoa,
};
