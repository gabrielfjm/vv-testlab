import test from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../src/core.js";
import { generatePdfReport } from "../src/report-pdf.js";

test("relatório PDF é A4 retrato, paginado e serializável", () => {
  const doc = generatePdfReport(demoState(), { save: false });
  assert.ok(doc.getNumberOfPages() >= 5);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 210) < 0.1);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 297) < 0.1);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.ok(bytes.length > 15_000);
});
