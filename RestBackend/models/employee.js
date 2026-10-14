const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  uname: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String, required: true, select: false },
  address: { type: String, default: '', maxlength: 500 },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
}, { timestamps: true });
module.exports = mongoose.model('Employees', schema);
