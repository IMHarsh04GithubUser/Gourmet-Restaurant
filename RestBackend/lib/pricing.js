const Menu = require('../models/AdminAdd');
const { check, objectId } = require('./validation');
function normalizeItems(items) {
  check(Array.isArray(items) && items.length > 0 && items.length <= 50, 'Add between 1 and 50 items to your cart.');
  const combined = new Map();
  for (const item of items) {
    check(item && objectId(item.id), 'One of the menu items is invalid.');
    check(Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20, 'Quantity must be between 1 and 20.');
    combined.set(item.id, (combined.get(item.id) || 0) + item.quantity);
    check(combined.get(item.id) <= 20, 'Maximum quantity per dish is 20.');
  }
  return [...combined].sort(([a], [b]) => a.localeCompare(b)).map(([id, quantity]) => ({ id, quantity }));
}
async function quote(items, deliveryPaise) {
  const normalized = normalizeItems(items);
  const products = await Menu.find({ _id: { $in: normalized.map(x => x.id) }, active: { $ne: false } }).lean();
  check(products.length === normalized.length, 'A dish is no longer available. Update your cart.', 409);
  const rows = normalized.map(item => {
    const product = products.find(x => String(x._id) === item.id);
    const unitPricePaise = Math.round(product.price * 100);
    check(Number.isSafeInteger(unitPricePaise) && unitPricePaise >= 100, 'This dish needs a price update. Please contact the restaurant.', 409);
    return { productId: product._id, name: product.name, image: product.image, unitPricePaise, quantity: item.quantity };
  });
  const subtotalPaise = rows.reduce((sum, x) => sum + x.unitPricePaise * x.quantity, 0);
  const totalPaise = subtotalPaise + deliveryPaise;
  check(totalPaise <= 10000000, 'This order exceeds the ₹1,00,000 limit. Contact the restaurant.');
  return { items: rows, subtotalPaise, deliveryPaise, totalPaise, currency: 'INR' };
}
module.exports = { quote, normalizeItems };
