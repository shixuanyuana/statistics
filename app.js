// 在这里添加项目即可扩展统计列表；key 必须唯一。
const STAT_DEFINITIONS = [
  { key: "goals", label: "进球" },
  { key: "shots", label: "射门" },
  { key: "shotsOnTarget", label: "射正" },
  { key: "successfulPasses", label: "成功传球" },
  { key: "tackles", label: "抢断" },
  { key: "corners", label: "角球" },
  { key: "freeKicks", label: "任意球" },
  { key: "headers", label: "头球" },
  { key: "fouls", label: "犯规" }
];

const STORAGE_KEY = "football-video-tracker-v1";
const defaultCounts = () => Object.fromEntries(STAT_DEFINITIONS.map(({ key }) => [key, 0]));
const freshState = () => ({
  teamNames: ["队伍1", "队伍2"],
  counts: [defaultCounts(), defaultCounts()],
  elapsedSeconds: 0,
  events: []
});

let state = loadState();
let timerId = null;
let toastId = null;

const $ = (selector) => document.querySelector(selector);
const statsGrid = $("#statsGrid");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return freshState();
    const base = freshState();
    base.teamNames = Array.isArray(saved.teamNames) ? saved.teamNames.slice(0, 2) : base.teamNames;
    base.elapsedSeconds = Math.max(0, Number(saved.elapsedSeconds) || 0);
    base.events = Array.isArray(saved.events) ? saved.events.slice(-2000) : [];
    base.counts = base.counts.map((defaults, team) => {
      const incoming = saved.counts?.[team] || {};
      return Object.fromEntries(Object.keys(defaults).map(key => [key, Math.max(0, Number(incoming[key]) || 0)]));
    });
    return base;
  } catch { return freshState(); }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $("#saveStatus").textContent = `已自动保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function renderStats() {
  statsGrid.innerHTML = STAT_DEFINITIONS.map((stat, index) => `
    <div class="stat-row">
      ${controlTemplate(0, stat, index)}
      <div class="stat-label"><span>${stat.label}</span><small>快捷键 ${index + 1 <= 9 ? index + 1 : "—"}</small></div>
      ${controlTemplate(1, stat, index)}
    </div>`).join("");
}

function controlTemplate(team, stat) {
  const value = state.counts[team][stat.key];
  return `<div class="stat-control team${team + 1}" data-team="${team}" data-stat="${stat.key}">
    <button class="stat-button minus" type="button" data-delta="-1" aria-label="${state.teamNames[team]} ${stat.label}减一" ${value === 0 ? "disabled" : ""}>−</button>
    <output class="stat-value" aria-label="${stat.label}当前数值">${value}</output>
    <button class="stat-button plus" type="button" data-delta="1" aria-label="${state.teamNames[team]} ${stat.label}加一">+</button>
  </div>`;
}

function renderAll() {
  $("#team1Name").value = state.teamNames[0];
  $("#team2Name").value = state.teamNames[1];
  $("#team1ColumnName").textContent = state.teamNames[0];
  $("#team2ColumnName").textContent = state.teamNames[1];
  $("#team1Score").textContent = state.counts[0].goals;
  $("#team2Score").textContent = state.counts[1].goals;
  $("#matchClock").textContent = formatDuration(state.elapsedSeconds);
  renderStats();
  renderEvents();
}

function adjust(team, statKey, delta, options = {}) {
  const oldValue = state.counts[team][statKey];
  const newValue = Math.max(0, oldValue + delta);
  if (newValue === oldValue) { showToast("数值不能低于 0"); return; }
  state.counts[team][statKey] = newValue;
  if (!options.skipEvent) {
    const stat = STAT_DEFINITIONS.find(item => item.key === statKey);
    state.events.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      at: new Date().toISOString(), videoSecond: state.elapsedSeconds,
      team, teamName: state.teamNames[team], statKey, statLabel: stat.label,
      delta, from: oldValue, to: newValue
    });
  }
  saveState();
  renderAll();
}

function renderEvents() {
  const recent = state.events.slice(-8).reverse();
  $("#eventCount").textContent = `${state.events.length} 条`;
  $("#undoButton").disabled = state.events.length === 0;
  $("#eventList").innerHTML = recent.length ? recent.map(event => `
    <div class="event-item">
      <time>${formatDuration(event.videoSecond)}</time>
      <span>${escapeHtml(event.teamName)} · ${escapeHtml(event.statLabel)}：${event.from} → ${event.to}</span>
      <strong class="event-change ${event.delta > 0 ? "plus" : "minus"}">${event.delta > 0 ? "+" : ""}${event.delta}</strong>
    </div>`).join("") : `<p class="empty-state">还没有操作记录</p>`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const min = Math.floor(total / 60).toString().padStart(2, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastId);
  toastId = setTimeout(() => toast.classList.remove("show"), 1800);
}

statsGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-delta]");
  if (!button) return;
  const control = button.closest(".stat-control");
  adjust(Number(control.dataset.team), control.dataset.stat, Number(button.dataset.delta));
});

document.addEventListener("keydown", event => {
  if (event.target.matches("input, textarea") || event.ctrlKey || event.metaKey || event.altKey) return;
  const index = Number(event.key) - 1;
  if (index >= 0 && index < Math.min(9, STAT_DEFINITIONS.length)) {
    event.preventDefault();
    adjust(event.shiftKey ? 1 : 0, STAT_DEFINITIONS[index].key, 1);
  }
  if (event.code === "Space") { event.preventDefault(); toggleTimer(); }
});

[$("#team1Name"), $("#team2Name")].forEach((input, team) => {
  input.addEventListener("input", () => {
    state.teamNames[team] = input.value.trim() || `队伍${team + 1}`;
    $(team ? "#team2ColumnName" : "#team1ColumnName").textContent = state.teamNames[team];
    saveState();
  });
});

function toggleTimer() {
  if (timerId) {
    clearInterval(timerId); timerId = null; $("#clockToggle").textContent = "继续";
  } else {
    timerId = setInterval(() => { state.elapsedSeconds += 1; $("#matchClock").textContent = formatDuration(state.elapsedSeconds); saveState(); }, 1000);
    $("#clockToggle").textContent = "暂停";
  }
}

$("#clockToggle").addEventListener("click", toggleTimer);
$("#clockReset").addEventListener("click", () => {
  if (state.elapsedSeconds === 0 || confirm("确定把视频计时归零吗？统计数据不会被清空。")) {
    state.elapsedSeconds = 0; saveState(); renderAll();
  }
});

$("#undoButton").addEventListener("click", () => {
  const last = state.events.pop();
  if (!last) return;
  state.counts[last.team][last.statKey] = last.from;
  saveState(); renderAll(); showToast("已撤销上一步");
});

$("#resetButton").addEventListener("click", () => {
  if (!confirm("确定清空本场全部统计和操作记录吗？此操作不能撤销。")) return;
  const names = [...state.teamNames];
  if (timerId) toggleTimer();
  state = freshState(); state.teamNames = names;
  saveState(); renderAll(); showToast("本场数据已清空");
});

// 无外部依赖的 XLSX 生成器：创建符合 Office Open XML 规范的未压缩 ZIP 工作簿。
function xmlEscape(value) { return String(value ?? "").replace(/[<>&'\"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])); }
function columnName(index) { let name = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name; return name; }
function worksheetXml(rows) {
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
    const ref = `${columnName(c)}${r + 1}`;
    return typeof cell === "number" ? `<c r="${ref}"><v>${cell}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); } return (crc ^ -1) >>> 0; }
function u16(n) { return [n & 255, (n >>> 8) & 255]; }
function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
function createZip(files) {
  const encoder = new TextEncoder(), local = [], central = []; let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name), data = encoder.encode(content), crc = crc32(data);
    const header = new Uint8Array([0x50,0x4b,0x03,0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)]);
    local.push(header, nameBytes, data);
    central.push(new Uint8Array([0x50,0x4b,0x01,0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameBytes);
    offset += header.length + nameBytes.length + data.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.length, 0), count = Object.keys(files).length;
  const end = new Uint8Array([0x50,0x4b,0x05,0x06, ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  return new Blob([...local, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function exportExcel() {
  const summaryRows = [["足球视频人工统计汇总"], ["导出时间", new Date().toLocaleString("zh-CN")], ["视频时间", formatDuration(state.elapsedSeconds)], [], ["统计项目", state.teamNames[0], state.teamNames[1]]];
  STAT_DEFINITIONS.forEach(stat => summaryRows.push([stat.label, state.counts[0][stat.key], state.counts[1][stat.key]]));
  const detailRows = [["序号", "操作时间", "视频时间", "队伍", "统计项目", "变化", "原数值", "新数值"]];
  state.events.forEach((event, index) => detailRows.push([index + 1, new Date(event.at).toLocaleString("zh-CN"), formatDuration(event.videoSecond), event.teamName, event.statLabel, event.delta, event.from, event.to]));
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="统计汇总" sheetId="1" r:id="rId1"/><sheet name="操作明细" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": worksheetXml(summaryRows),
    "xl/worksheets/sheet2.xml": worksheetXml(detailRows)
  };
  const url = URL.createObjectURL(createZip(files));
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url; link.download = `足球统计_${safeFilename(state.teamNames[0])}_VS_${safeFilename(state.teamNames[1])}_${date}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Excel 已导出");
}
function safeFilename(value) { return value.replace(/[\\/:*?\"<>|]/g, "_").trim() || "队伍"; }
$("#exportButton").addEventListener("click", exportExcel);

renderAll();
