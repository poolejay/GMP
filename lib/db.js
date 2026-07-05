const { Pool } = require("pg");

let pool;

function connectionString() {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL;
}

function hasDatabaseConfig() {
  return Boolean(connectionString());
}

function getPool() {
  const url = connectionString();
  if (!url) {
    const error = new Error("Database connection is not configured");
    error.statusCode = 500;
    error.publicMessage = "Database connection is not configured";
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.POSTGRES_POOL_MAX || 3),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withClient(work) {
  const client = await getPool().connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  hasDatabaseConfig,
  query,
  withClient,
};
