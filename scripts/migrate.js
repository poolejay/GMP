const fs = require("fs");
const path = require("path");
const { getPool } = require("../lib/db");

async function main() {
  const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await getPool().query(sql);
  await getPool().end();
  console.log("Database schema is up to date.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
