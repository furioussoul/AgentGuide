import test from "node:test";
import assert from "node:assert/strict";
import { calculateShipping } from "../src/shipping.js";

test("orders below 100 yuan pay shipping", () => {
  assert.equal(calculateShipping(99), 12);
});

test("orders at the 100 yuan threshold ship for free", () => {
  assert.equal(calculateShipping(100), 0);
});

test("orders above 100 yuan ship for free", () => {
  assert.equal(calculateShipping(150), 0);
});

test("negative totals are rejected", () => {
  assert.throws(() => calculateShipping(-1), /non-negative/);
});
