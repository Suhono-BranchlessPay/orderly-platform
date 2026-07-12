import fs from "fs";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("no DATABASE_URL");
  process.exit(1);
}

const sql = fs.readFileSync("scripts/phase-b-dashboard-auth.sql", "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("phase-b migration OK");
  const r = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public'
       and table_name in ('dashboard_users','dashboard_sessions')
     order by 1`,
  );
  console.log(
    "tables:",
    r.rows.map((x) => x.table_name).join(", "),
  );
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
