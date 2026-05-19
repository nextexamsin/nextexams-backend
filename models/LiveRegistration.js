const mongoose = require('mongoose');

const liveRegistrationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    testSeriesId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'TestSeries', 
        required: true 
    },
    registeredAt: { 
        type: Date, 
        default: Date.now 
    },
    hasAttempted: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

// Compound index to prevent double registration and fast lookup
liveRegistrationSchema.index({ userId: 1, testSeriesId: 1 }, { unique: true });

module.exports = mongoose.model('LiveRegistration', liveRegistrationSchema);