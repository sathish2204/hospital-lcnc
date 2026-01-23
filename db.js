const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value JSONB
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDb,
  query: (text, params) => pool.query(text, params),
};
