const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  price: { type: Number, required: true, min: 1, max: 10000 },
  category: { type: String, enum: ['Salad', 'Starter', 'Drinks', 'Lunch', 'Dessert'], required: true },
  image: { type: String, default: '' },
  active: { type: Boolean, default: true },
  seedKey: { type: String, unique: true, sparse: true },
}, { timestamps: true });
schema.index({ active: 1, category: 1 });
module.exports = mongoose.model('AddCategory', schema);
