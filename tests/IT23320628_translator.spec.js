const { test, expect } = require("@playwright/test");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const URL = "https://www.swifttranslator.com/";

function excelPaths() {
  const original = path.join(__dirname, "..", "test-data", "IT23320628 - ITPM Assignment.xlsx");
  const executed = path.join(__dirname, "..", "test-data", "IT23320628 - ITPM Assignment_EXECUTED.xlsx");
  const inPath = fs.existsSync(executed) ? executed : original;
  const outPath = executed;
  return { inPath, outPath };
}

function loadGrid(filePath) {
  const wb = XLSX.readFile(filePath);
  const wsName = wb.SheetNames.find((n) => String(n).toLowerCase().includes("test cases")) || wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const headerRowIndex = grid.findIndex((row) => row.some((c) => String(c).trim() === "TC ID"));
  if (headerRowIndex < 0) throw new Error("Header row with 'TC ID' not found");

  const header = grid[headerRowIndex].map((c) => String(c).trim());
  const col = {
    tcId: header.indexOf("TC ID"),
    input: header.indexOf("Input"),
    expected: header.indexOf("Expected output"),
    actual: header.indexOf("Actual output"),
    status: header.indexOf("Status")
  };

  if (Object.values(col).some((v) => v < 0)) throw new Error("Required columns not found in header");

  return { wb, wsName, grid, headerRowIndex, col };
}

function getRows(grid, headerRowIndex, col) {
  const rows = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const tc = String((grid[r] || [])[col.tcId] || "").trim();
    if (!tc) continue;
    const input = String((grid[r] || [])[col.input] || "");
    const expected = String((grid[r] || [])[col.expected] || "");
    rows.push({ r, tc, input, expected });
  }
  return rows;
}

async function firstVisible(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      const ok = (await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false));
      if (ok) return loc;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function findInput(page) {
  const inputSelectors = [
    "textarea:not([readonly]):not([disabled])",
    "textarea",
    "div[contenteditable='true']",
    "div[role='textbox'][contenteditable='true']",
    "input[type='text']"
  ];
  const input = await firstVisible(page, inputSelectors, 60000);
  if (!input) throw new Error("Input element not found");
  return input;
}

async function clearAndType(page, input, text) {
  await input.click().catch(() => {});
  await page.keyboard.press("Control+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await input.fill("").catch(() => {});
  await input.type(String(text || ""), { delay: 5 }).catch(async () => {
    await input.fill(String(text || "")).catch(() => {});
  });
}

function countSinhala(s) {
  const m = String(s || "").match(/[\u0D80-\u0DFF]/g);
  return m ? m.length : 0;
}

async function scanBestOutput(page, inputText) {
  return await page.evaluate((inputText) => {
    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (!style || style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      return true;
    };

    const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const hasSinhala = (s) => /[\u0D80-\u0DFF]/.test(s);

    const els = Array.from(document.querySelectorAll("textarea,input,div,span,p,pre,section,article"));
    const candidates = [];

    for (const el of els) {
      if (!isVisible(el)) continue;

      let t = "";
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input") t = el.value || "";
      else t = el.innerText || "";

      t = norm(t);
      if (!t) continue;
      if (inputText && t.includes(norm(inputText))) continue;

      const sin = hasSinhala(t);
      const scoreSinhala = sin ? (t.match(/[\u0D80-\u0DFF]/g) || []).length : 0;

      const role = (el.getAttribute("role") || "").toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();

      let boost = 0;
      if (role === "alert") boost += 10;
      if (cls.includes("output") || cls.includes("result") || cls.includes("translate")) boost += 6;
      if (id.includes("output") || id.includes("result") || id.includes("translate")) boost += 6;
      if (aria.includes("output") || aria.includes("result") || aria.includes("translation")) boost += 6;

      candidates.push({ t, score: scoreSinhala * 10 + boost + Math.min(50, t.length / 10) });
    }

    candidates.sort((a, b) => b.score - a.score);

    const bestSinhala = candidates.find((c) => /[\u0D80-\u0DFF]/.test(c.t));
    if (bestSinhala) return bestSinhala.t;

    const bestAny = candidates[0];
    return bestAny ? bestAny.t : "";
  }, String(inputText || ""));
}

async function waitForStableOutput(page, inputText, maxMs) {
  const start = Date.now();
  let last = "";
  let stable = 0;

  while (Date.now() - start < maxMs) {
    const cur = String(await scanBestOutput(page, inputText) || "").trim();
    if (cur && cur === last) stable += 1;
    else stable = 0;
    last = cur;
    if (stable >= 4) return cur;
    await page.waitForTimeout(250);
  }

  return String(await scanBestOutput(page, inputText) || "").trim();
}

test.describe.configure({ mode: "serial" });

test.describe("IT23320628 - Functional cases (Translator)", () => {
  const updates = [];
  let outPath = "";

  test.beforeAll(() => {
    const p = excelPaths();
    outPath = p.outPath;
  });

  test.afterAll(() => {
    if (!updates.length) return;
    const p = excelPaths();
    const { wb, wsName, grid } = loadGrid(p.inPath);
    const ws = XLSX.utils.aoa_to_sheet(grid);
    wb.Sheets[wsName] = ws;
    XLSX.writeFile(wb, outPath);
  });

  const { inPath } = excelPaths();
  const { grid, headerRowIndex, col } = loadGrid(inPath);

  const cases = getRows(grid, headerRowIndex, col).filter(
    (x) => x.tc.startsWith("Pos_Fun") || x.tc.startsWith("Neg_Fun")
  );

  for (const c of cases) {
    test(`${c.tc} | ROW_${c.r + 1}`, async ({ page }) => {
      test.setTimeout(120000);

      await page.goto(URL, { waitUntil: "domcontentloaded" });

      const input = await findInput(page);
      await clearAndType(page, input, c.input);

      const actual = await waitForStableOutput(page, c.input, 60000);

      const exp = String(c.expected || "").trim();
      const act = String(actual || "").trim();

      const status = exp && act === exp ? "Pass" : "Fail";

      updates.push({ r: c.r, actual, status });

      grid[c.r][col.actual] = actual;
      grid[c.r][col.status] = status;
    });
  }
});
