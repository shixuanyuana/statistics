const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const listeners = new Map();
const elements = new Map();
function element(key) {
  if (!elements.has(key)) {
    elements.set(key, {
      value: "", textContent: "", innerHTML: "", disabled: false,
      classList: { add() {}, remove() {} },
      addEventListener(type, handler) { listeners.set(`${key}:${type}`, handler); },
      appendChild() {}, remove() {}, click() {}
    });
  }
  return elements.get(key);
}

let exportedBlob;
const storage = new Map();
const context = {
  console, Blob, TextEncoder, crypto, setTimeout, clearTimeout, setInterval, clearInterval,
  confirm: () => true,
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  URL: { createObjectURL: blob => { exportedBlob = blob; return "blob:test"; }, revokeObjectURL() {} },
  document: {
    querySelector: selector => element(selector),
    addEventListener(type, handler) { listeners.set(`document:${type}`, handler); },
    createElement: tag => element(`created:${tag}`),
    body: element("body")
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), context);

context.adjust(0, "goals", 1);
assert.equal(element("#eventCount").textContent, "0 条");
context.startMatch();
context.adjust(0, "goals", 1);
context.adjust(0, "goals", 1);
assert.equal(element("#team1Score").textContent, 2, "进球应同步到比分");
context.adjust(1, "shotsOnTarget", -1);
assert.equal(element("#eventCount").textContent, "2 条", "零以下操作不应计入明细");
listeners.get("#undoButton:click")();
assert.equal(element("#team1Score").textContent, 1, "撤销应恢复上一步数值");

context.adjust(1, "shots", 1);
context.endMatch();
context.adjust(1, "goals", 1);
assert.equal(element("#team2Score").textContent, 0);
context.startMatch();
assert.equal(element("#eventCount").textContent, "0 条");
assert.equal(element("#team1Score").textContent, 0);
context.adjust(1, "headers", 1);
context.endMatch();
context.exportExcel();
assert(exportedBlob, "导出应生成工作簿");
exportedBlob.arrayBuffer().then(buffer => {
  const bytes = Buffer.from(buffer);
  const raw = bytes.toString("utf8");
  const detail = raw.split("xl/worksheets/sheet2.xml<?xml")[1].split("</worksheet>")[0];
  assert(detail.includes("头球") && !detail.includes("进球") && !detail.includes("射门"));
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "XLSX 应为 ZIP 容器");
  assert(raw.includes("xl/workbook.xml"), "工作簿结构应存在");
  assert(raw.includes("统计汇总") && raw.includes("变动明细"), "应包含两个工作表");
  assert(raw.includes("实际操作时间") && raw.includes("视频时间点") && raw.includes("记录来源"), "明细应包含完整变动字段");
  assert(raw.includes("射正") && raw.includes("成功传球"), "汇总应包含统计项目");
  console.log("Smoke tests passed: counting, negative guard, undo, XLSX export");
}).catch(error => { console.error(error); process.exitCode = 1; });
