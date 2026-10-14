const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employees', required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true, select: false },
  items: [{ productId: mongoose.Schema.Types.ObjectId, name: String, unitPricePaise: Number, quantity: Number, image: String }],
  subtotalPaise: Number, deliveryPaise: Number, totalPaise: Number,
  currency: { type: String, default: 'INR' },
  customer: { name: String, email: String, phone: String, address: String },
  paymentMethod: { type: String, enum: ['cod', 'razorpay'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'], default: 'pending' },
  status: { type: String, enum: ['awaiting_payment', 'placed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'], required: true },
  gatewayOrderId: { type: String, unique: true, sparse: true },
  gatewayPaymentId: { type: String, unique: true, sparse: true },
  gatewayState: { type: String, enum: ['new', 'creating', 'ready', 'review_required'], default: 'new' },
  paidAt: Date, refundPaise: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
// Keep legacy bills intact: their prices and ownership were not verified.
module.exports = mongoose.model('Order', schema);
