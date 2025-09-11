const mongoose = require('mongoose');

const passPurchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  duration: { type: String, enum: ['1day', '1week', '1month', '6months'], required: true },
  purchasedAt: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true }
});

module.exports = mongoose.model('PassPurchase', passPurchaseSchema);
