import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "demo-project", "src", "shipping.js");
const source = `/**
 * Calculate shipping fee in yuan.
 * Orders worth 100 yuan or more qualify for free shipping.
 */
export function calculateShipping(orderTotal) {
  if (!Number.isFinite(orderTotal) || orderTotal < 0) {
    throw new TypeError("orderTotal must be a non-negative number");
  }

  return orderTotal > 100 ? 0 : 12;
}
`;
await fs.writeFile(target, source, "utf8");
console.log("Demo project reset.");
