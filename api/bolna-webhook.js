const { pool, initDb } = require('../db');

// Database initialization flag
let isInitialized = false;

module.exports = async (req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Ensure table exists
    if (!isInitialized) {
        try {
            await initDb();
            isInitialized = true;
        } catch (err) {
            console.error('Initial DB Error:', err);
        }
    }

    try {
        // Bolna AI payload structure check
        // Based on typical AI voice agent webhooks, data might be in body.data or body.extracted_parameters
        const data = req.body.extracted_parameters || req.body.data || req.body;

        const name = data.name || data.patient_name || 'AI Patient';
        const age = data.age || data.patient_age || 'Unknown';
        const gender = data.gender || data.patient_gender || 'Unknown';
        const phone = data.phone || data.patient_phone || 'Unknown';
        const complaint = data.complaint || data.symptoms || 'Registered via Bolna AI Call';

        // 1. Generate IDs and Token (replicate client-side logic)
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        const patientId = 'P' + timestamp.slice(-8) + random;

        const today = new Date().toDateString();

        // Fetch current token data
        const tokenResult = await pool.query('SELECT value FROM kv_store WHERE key = $1', ['tokenData']);
        let tokenData = tokenResult.rows.length > 0 ? tokenResult.rows[0].value : { date: today, count: 0 };

        if (tokenData.date !== today) {
            tokenData = { date: today, count: 0 };
        }
        tokenData.count++;
        const token = tokenData.count.toString().padStart(3, '0');

        // 2. Create Patient Object
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

        // 3. Update Doctor Queue
        const queueResult = await pool.query('SELECT value FROM kv_store WHERE key = $1', ['queue_doctor']);
        let doctorQueue = queueResult.rows.length > 0 ? queueResult.rows[0].value : [];
        if (!Array.isArray(doctorQueue)) doctorQueue = [];

        doctorQueue.push(patient);

        // 4. Save everything back to DB
        await pool.query(
            'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['queue_doctor', JSON.stringify(doctorQueue)]
        );

        await pool.query(
            'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            ['tokenData', JSON.stringify(tokenData)]
        );

        return res.status(200).json({
            success: true,
            message: 'Patient registered successfully via Bolna AI',
            patient: {
                id: patientId,
                token: token,
                name: name
            }
        });

    } catch (err) {
        console.error('Bolna Webhook Error:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: err.message
        });
    }
};
