const mongoose = require('mongoose');
module.exports = mongoose.model('BookTableData', new mongoose.Schema({
  name: String, phone: String, email: String, date: Date, time: String, persons: Number,
  status: { type: String, enum: ['requested', 'confirmed', 'cancelled'], default: 'requested' },
}, { timestamps: true }));
