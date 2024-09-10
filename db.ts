// db.js
import postgres from "postgres";

const connectionString = `postgresql://postgres.fhlbapsbkuzuwufzsbue:GUFdPNh2lp.uC4Yb@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
const sql = postgres(connectionString, {
  max: 50,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

export default sql;
