const crypto = require('node:crypto');
const Order = require('../models/Order');
const { check } = require('./validation');
function validSignature(message, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
async function applyPayment(order, payment) {
  check(order.paymentMethod === 'razorpay' && payment.order_id === order.gatewayOrderId, 'Payment does not belong to this order.', 400);
  check(payment.currency === order.currency && payment.amount === order.totalPaise, 'Payment amount or currency does not match.', 400);
  if (payment.status === 'captured' || payment.status === 'refunded') {
    // Atomic and monotonic: repeated/delayed webhooks cannot downgrade a paid order.
    await Order.updateOne({ _id: order._id, paymentStatus: { $in: ['pending', 'failed'] } }, {
      $set: { paymentStatus: 'paid', gatewayPaymentId: payment.id, paidAt: new Date(), status: 'placed' },
    });
    if (payment.amount_refunded > 0) {
      const refunded = payment.amount_refunded >= order.totalPaise;
      await Order.updateOne({ _id: order._id, refundPaise: { $lt: payment.amount_refunded }, gatewayPaymentId: payment.id }, {
        $set: { refundPaise: payment.amount_refunded, paymentStatus: refunded ? 'refunded' : 'partially_refunded' },
      });
    }
  } else if (payment.status === 'failed') {
    await Order.updateOne({ _id: order._id, paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed' } });
  }
  return Order.findById(order._id);
}
module.exports = { validSignature, applyPayment };
