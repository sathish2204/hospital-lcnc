const { pool, initDb } = require('../db');

// Database initialization flag for the serverless instance
let isInitialized = false;

module.exports = async (req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ensure table exists
    if (!isInitialized) {
        try {
            await initDb();
            isInitialized = true;
        } catch (err) {
            console.error('Initial DB Error:', err);
            // Don't return here, attempt to proceed or let the query fail later
        }
    }

    // Extract key from query param (set by vercel.json) or URL path
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    const key = req.query.key || urlParts[2] || null;

    try {
        if (req.method === 'GET') {
            if (!key) {
                // Get all data
                const result = await pool.query('SELECT key, value FROM kv_store');
                const data = {};
                result.rows.forEach(row => {
                    data[row.key] = row.value;
                });
                return res.json(data);
            } else {
                // Get data by key
                const result = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
                if (result.rows.length > 0) {
                    return res.json(result.rows[0].value);
                } else {
                    return res.json(null);
                }
            }
        }

        if (req.method === 'POST') {
            if (!key) return res.status(400).json({ error: 'Key required', path: req.url, query: req.query });
            const { value } = req.body;
            await pool.query(
                'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                [key, JSON.stringify(value)]
            );
            return res.json({ success: true, key: key });
        }

        if (req.method === 'DELETE') {
            if (!key) return res.status(400).json({ error: 'Key required' });
            await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
            return res.json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: err.message,
            env_check: process.env.DATABASE_URL ? 'DB_URL_PRESENT' : 'DB_URL_MISSING',
            db_config_length: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0
        });
    }
};
