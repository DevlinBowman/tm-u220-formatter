import test from "node:test";
import assert from "node:assert/strict";
import { accessibleLineLabel } from "../preview/receipt.js";

test("receipt accessibility keeps styled segments in one logical line", () => {
  const line = {
    text: "BLACK + RED",
    segments: [
      { text: "BLACK + ", style: { color: "black" } },
      { text: "RED", style: { color: "red" } },
    ],
  };
  assert.equal(accessibleLineLabel(line), "BLACK + RED");
});

test("blank and paper-motion lines retain an accessible label", () => {
  assert.equal(accessibleLineLabel({ text: "" }), "blank printer line");
  assert.equal(accessibleLineLabel({ text: "   " }), "blank printer line");
  assert.equal(accessibleLineLabel(), "blank printer line");
});
