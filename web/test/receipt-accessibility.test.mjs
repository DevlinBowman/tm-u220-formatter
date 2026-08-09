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

test("bit-image lines expose their compiler label instead of blank text", () => {
  assert.equal(accessibleLineLabel({
    kind: "image",
    segments: [{ kind: "bit_image", reference: "logo.pbm" }],
  }), "printer image: logo.pbm");
  assert.equal(accessibleLineLabel({
    kind: "image", segments: [{ kind: "bit_image" }],
  }), "printer bit image");
  assert.equal(accessibleLineLabel({
    kind: "image",
    text: "[image Chicken.png]",
    image_label: "Chicken.png",
    segments: [{ kind: "bit_image", reference: "Chicken.png" }],
  }), "printer image: Chicken.png");
});
