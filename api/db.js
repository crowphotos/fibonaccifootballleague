import { sql } from '@vercel/postgres';
import { schemaSql } from '../lib/schema.js';

let ready;
export function ensureSchema() {
  if (!ready) ready = sql.query(schemaSql).catch(error => { ready = undefined; throw error; });
  return ready;
}
