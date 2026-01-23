const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Database
db.initDb();

// Get all data
app.get('/api/store', async (req, res) => {
    try {
        const result = await db.query('SELECT key, value FROM kv_store');
        const data = {};
        result.rows.forEach(row => {
            data[row.key] = row.value;
        });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get data by key
app.get('/api/store/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await db.query('SELECT value FROM kv_store WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            res.json(result.rows[0].value);
        } else {
            res.json(null);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Save data by key
app.post('/api/store/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        await db.query(
            'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, JSON.stringify(value)]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Delete data by key
app.delete('/api/store/:key', async (req, res) => {
    try {
        const { key } = req.params;
        await db.query('DELETE FROM kv_store WHERE key = $1', [key]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Serve static files
app.use(express.static('./'));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
