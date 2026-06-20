/**
 * Calculate shipping fee in yuan.
 * Orders worth 100 yuan or more qualify for free shipping.
 */
export function calculateShipping(orderTotal) {
  if (!Number.isFinite(orderTotal) || orderTotal < 0) {
    throw new TypeError("orderTotal must be a non-negative number");
  }

  return orderTotal > 100 ? 0 : 12;
}
