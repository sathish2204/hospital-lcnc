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

// Bolna AI Webhook for Patient Registration
app.post('/api/bolna-webhook', async (req, res) => {
    try {
        const data = req.body.extracted_parameters || req.body.data || req.body;

        const name = data.name || data.patient_name || 'AI Patient';
        const age = data.age || data.patient_age || 'Unknown';
        const gender = data.gender || data.patient_gender || 'Unknown';
        const phone = data.phone || data.patient_phone || 'Unknown';
        const complaint = data.complaint || data.symptoms || 'Registered via Bolna AI Call';

        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        const patientId = 'P' + timestamp.slice(-8) + random;

        const today = new Date().toDateString();

        const tokenResult = await db.query('SELECT value FROM kv_store WHERE key = $1', ['tokenData']);
        let tokenData = tokenResult.rows.length > 0 ? tokenResult.rows[0].value : { date: today, count: 0 };

        if (tokenData.date !== today) {
            tokenData = { date: today, count: 0 };
        }
        tokenData.count++;
        const token = tokenData.count.toString().padStart(3, '0');

        const patient = {
            id: patientId,
            token: token,
            name: name,
            age: age,
            gender: gender,
            phone: phone,
            complaint: complaint,
            registeredAt: new Date().toISOString(),
            registeredBy: 'Bolna AI Agent',
            currentQueue: 'queue_doctor',
            status: 'waiting',
            history: [{
                action: 'Patient Registered via Call',
                by: 'Bolna AI',
                time: new Date().toISOString(),
                notes: `Extracted Complaint: ${complaint}`
            }]
        };

        const queueResult = await db.query('SELECT value FROM kv_store WHERE key = $1', ['queue_doctor']);
        let doctorQueue = queueResult.rows.length > 0 ? queueResult.rows[0].value : [];
        if (!Array.isArray(doctorQueue)) doctorQueue = [];

        doctorQueue.push(patient);

        await db.query(
            'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['queue_doctor', JSON.stringify(doctorQueue)]
        );

        await db.query(
            'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['tokenData', JSON.stringify(tokenData)]
        );

        res.json({
            success: true,
            message: 'Patient registered successfully via Bolna AI',
            patient: { id: patientId, token: token, name: name }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
});

// Serve static files
app.use(express.static('./'));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
