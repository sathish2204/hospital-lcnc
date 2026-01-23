const { pool, initDb } = require('../db');

// Database initialization flag
let isInitialized = false;

module.exports = async (req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
        }
    }

    try {
        // Fetch current doctor queue
        const queueResult = await pool.query('SELECT value FROM kv_store WHERE key = $1', ['queue_doctor']);
        let doctorQueue = queueResult.rows.length > 0 ? queueResult.rows[0].value : [];
        if (!Array.isArray(doctorQueue)) doctorQueue = [];

        const queueLength = doctorQueue.length;

        // Simple heuristic: 15 mins per patient
        const estimatedWaitTimeMinutes = queueLength * 15;

        return res.status(200).json({
            success: true,
            total_waiting: queueLength,
            estimated_wait_minutes: estimatedWaitTimeMinutes,
            message: `There are currently ${queueLength} patients waiting. The estimated wait time is approximately ${estimatedWaitTimeMinutes} minutes.`,
            detailed_status: queueLength === 0
                ? "The clinic is currently free. You can come in immediately."
                : `You will be patient number ${queueLength + 1} in the queue.`
        });

    } catch (err) {
        console.error('Check Queue Error:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            details: err.message
        });
    }
};
