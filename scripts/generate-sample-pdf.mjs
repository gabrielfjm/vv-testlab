import { mkdir, writeFile } from "node:fs/promises";
import { demoState } from "../src/core.js";
import { generatePdfReport } from "../src/report-pdf.js";

const output = new URL("../output/pdf/relatorio-vv-exemplo.pdf", import.meta.url);
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
const doc = generatePdfReport(demoState(), { save: false });
await writeFile(output, Buffer.from(doc.output("arraybuffer")));
console.log(output.pathname);
