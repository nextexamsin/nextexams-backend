const mongoose = require('mongoose');

// No options needed for Mongoose 6+
const logConn = mongoose.createConnection(process.env.MONGO_LOG_URL);

logConn.on('connected', () => console.log('✅ Activity Log DB Connected'));
logConn.on('error', (err) => console.error('❌ Log DB Error:', err));

module.exports = logConn;