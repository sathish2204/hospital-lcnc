const { pool, initDb } = require('../db');

// Database initialization flag for the serverless instance
let isInitialized = false;

module.exports = async (req, res) => {
    // Ensure table exists
    if (!isInitialized) {
        await initDb();
        isInitialized = true;
    }
    // Handle CORS if needed (Vercel usually does this, but good to be explicit)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Extract path after /api/store
    // Vercel path will be like /api/store?key=... or we can use path parsing
    // Extract key from the URL path
    const urlParts = req.url.split('?')[0].split('/').filter(Boolean);
    // URL: /api/store/someKey -> parts: ['api', 'store', 'someKey']
    const key = urlParts[2] || null;

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
            if (!key) return res.status(400).json({ error: 'Key required' });
            const { value } = req.body;
            await pool.query(
                'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                [key, JSON.stringify(value)]
            );
            return res.json({ success: true });
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
            stack: err.stack,
            env_check: process.env.DATABASE_URL ? 'DB_URL_PRESENT' : 'DB_URL_MISSING'
        });
    }
};
