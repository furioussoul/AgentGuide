const messages = document.querySelector("#messages");
const traceList = document.querySelector("#traceList");
const chatForm = document.querySelector("#chatForm");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const resetButton = document.querySelector("#resetButton");
const statusBadge = document.querySelector("#statusBadge");
const traceCount = document.querySelector("#traceCount");
const traceLatest = document.querySelector("#traceLatest");
const traceFilters = document.querySelector("#traceFilters");
const clearTraceButton = document.querySelector("#clearTraceButton");

const sessionId = localStorage.getItem("coding-agent-session") || crypto.randomUUID();
localStorage.setItem("coding-agent-session", sessionId);
const stateStorageKey = `coding-agent-state:${sessionId}`;

function loadSavedState() {
  try {
    const raw = localStorage.getItem(stateStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const savedState = loadSavedState();
let messageHistory = Array.isArray(savedState.messages) ? savedState.messages : [];
let traceEvents = Array.isArray(savedState.traceEvents) ? savedState.traceEvents : [];
let activeTraceFilter = typeof savedState.activeTraceFilter === "string"
  ? savedState.activeTraceFilter
  : "all";
let statusState = savedState.status && typeof savedState.status === "object"
  ? savedState.status
  : { text: "待命", className: "" };
let currentRunId = typeof savedState.currentRunId === "string" ? savedState.currentRunId : "";
let lastRunSeq = Number.isFinite(savedState.lastRunSeq) ? savedState.lastRunSeq : -1;
let assistantRunIds = Array.isArray(savedState.assistantRunIds) ? savedState.assistantRunIds : [];
let errorRunIds = Array.isArray(savedState.errorRunIds) ? savedState.errorRunIds : [];
let runReconnectTimer = null;
let runStreamController = null;

function saveState() {
  try {
    localStorage.setItem(
      stateStorageKey,
      JSON.stringify({
        messages: messageHistory,
        traceEvents,
        activeTraceFilter,
        status: statusState,
        currentRunId,
        lastRunSeq,
        assistantRunIds,
        errorRunIds,
      }),
    );
  } catch {
    // Ignore quota/security errors; the live UI should still work.
  }
}

function safeLinkHref(href) {
  try {
    const url = new URL(href, window.location.origin);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
    if (href.startsWith("#")) return href;
  } catch {
    return null;
  }
  return null;
}

function appendInlineMarkdown(parent, text) {
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\*([^*\n]+)\*)|(_([^_\n]+)_)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    if (match[2]) {
      const code = document.createElement("code");
      code.textContent = match[2];
      parent.append(code);
    } else if (match[4] || match[6]) {
      const strong = document.createElement("strong");
      appendInlineMarkdown(strong, match[4] || match[6]);
      parent.append(strong);
    } else if (match[8] && match[9]) {
      const href = safeLinkHref(match[9]);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noreferrer";
        appendInlineMarkdown(link, match[8]);
        parent.append(link);
      } else {
        parent.append(document.createTextNode(match[0]));
      }
    } else if (match[11] || match[13]) {
      const emphasis = document.createElement("em");
      appendInlineMarkdown(emphasis, match[11] || match[13]);
      parent.append(emphasis);
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    parent.append(document.createTextNode(text.slice(cursor)));
  }
}

function appendInlineWithBreaks(parent, text) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) parent.append(document.createElement("br"));
    appendInlineMarkdown(parent, line);
  });
}

function isTableSeparator(line) {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(line, nextLine = "") {
  return /^```/.test(line)
    || /^#{1,4}\s+/.test(line)
    || /^>\s?/.test(line)
    || /^\s*([-*+]|\d+[.)])\s+/.test(line)
    || /^\s*(-{3,}|\*{3,})\s*$/.test(line)
    || (line.includes("|") && isTableSeparator(nextLine));
}

function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      pre.className = "markdown-code";
      const code = document.createElement("code");
      if (fence[1]) code.dataset.language = fence[1];
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }

    if (line.includes("|") && isTableSeparator(lines[index + 1] || "")) {
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");
      const headerRow = document.createElement("tr");
      for (const cell of parseTableRow(line)) {
        const th = document.createElement("th");
        appendInlineMarkdown(th, cell);
        headerRow.append(th);
      }
      thead.append(headerRow);
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const row = document.createElement("tr");
        for (const cell of parseTableRow(lines[index])) {
          const td = document.createElement("td");
          appendInlineMarkdown(td, cell);
          row.append(td);
        }
        tbody.append(row);
        index += 1;
      }
      table.append(thead, tbody);
      fragment.append(table);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      const title = document.createElement(`h${level}`);
      appendInlineMarkdown(title, heading[2].trim());
      fragment.append(title);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      const blockquote = document.createElement("blockquote");
      blockquote.append(renderMarkdown(quoteLines.join("\n")));
      fragment.append(blockquote);
      continue;
    }

    const listMarker = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (listMarker) {
      const ordered = /\d+[.)]/.test(listMarker[2]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (!itemMatch || (/\d+[.)]/.test(itemMatch[2]) !== ordered)) break;
        const item = document.createElement("li");
        const task = itemMatch[3].match(/^\[( |x|X)\]\s+(.+)$/);
        if (task) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = task[1].toLowerCase() === "x";
          checkbox.disabled = true;
          item.append(checkbox, document.createTextNode(" "));
          appendInlineMarkdown(item, task[2]);
        } else {
          appendInlineMarkdown(item, itemMatch[3]);
        }
        list.append(item);
        index += 1;
      }
      fragment.append(list);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      fragment.append(document.createElement("hr"));
      index += 1;
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !isBlockStart(lines[index], lines[index + 1] || "")
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = document.createElement("p");
    appendInlineWithBreaks(paragraph, paragraphLines.join("\n"));
    fragment.append(paragraph);
  }

  return fragment;
}

function createMessageElement(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = role === "user" ? "你" : "Agent";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.append(renderMarkdown(text));
  article.append(label, bubble);
  return article;
}

function renderMessages() {
  messages.innerHTML = "";
  for (const message of messageHistory) {
    if (!message || typeof message.text !== "string") continue;
    messages.append(createMessageElement(message.role === "user" ? "user" : "assistant", message.text));
  }
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, text) {
  messageHistory = [
    ...messageHistory,
    { role: role === "user" ? "user" : "assistant", text: String(text ?? "") },
  ].slice(-100);
  messages.append(createMessageElement(role, text));
  messages.scrollTop = messages.scrollHeight;
  saveState();
}

function addAssistantMessage(text, runId) {
  if (runId && assistantRunIds.includes(runId)) return;
  if (runId) assistantRunIds = [...assistantRunIds, runId].slice(-50);
  addMessage("assistant", text);
}

function addErrorMessage(text, runId) {
  if (runId && errorRunIds.includes(runId)) return;
  if (runId) errorRunIds = [...errorRunIds, runId].slice(-50);
  addMessage("assistant", text);
}

function traceCategory(type) {
  if (type.startsWith("model_")) return "model";
  if (type.startsWith("tool_")) return "tool";
  if (type.startsWith("run_") || type === "assistant") return "run";
  if (type === "error") return "error";
  return "run";
}

function traceTone(type) {
  if (type === "error") return "error";
  if (type.endsWith("_end") || type === "assistant") return "success";
  if (type.includes("tool")) return "tool";
  if (type.includes("model")) return "model";
  return "run";
}

function shortRunId(runId) {
  return typeof runId === "string" ? runId.slice(0, 8) : "";
}

function traceSummary(event) {
  const data = event.data || {};
  if (event.type === "run_start") return `载入 ${data.messageCount ?? 0} 条上下文`;
  if (event.type === "model_start") return `第 ${data.step ?? "-"} 步 · ${data.messageCount ?? 0} 条上下文`;
  if (event.type === "model_end") {
    return `第 ${data.step ?? "-"} 步 · ${data.stopReason ?? "完成"} · 输出 ${data.outputTokens ?? 0} tokens`;
  }
  if (event.type === "tool_call") return `${data.tool ?? "工具"} · 第 ${data.step ?? "-"} 步`;
  if (event.type === "tool_result") {
    return `${data.tool ?? "工具"} · ${data.ok ? "成功" : "失败"}`;
  }
  if (event.type === "assistant") {
    const text = String(data.text || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 76) : "生成回复";
  }
  if (event.type === "run_end") return data.status ? `状态：${data.status}` : "运行结束";
  if (event.type === "error") return String(data.message || "发生错误");
  return Object.keys(data).length ? `${Object.keys(data).length} 个字段` : "无数据";
}

function formatTracePayload(data) {
  return JSON.stringify(data || {}, null, 2);
}

function renderTraceItem(event, index) {
  const item = document.createElement("article");
  item.className = `trace-item ${traceTone(event.type)}`;
  const header = document.createElement("div");
  header.className = "trace-type";
  const type = document.createElement("span");
  type.textContent = event.type;
  const time = document.createElement("span");
  time.textContent = new Date(event.at).toLocaleTimeString();
  header.append(type, time);
  const meta = document.createElement("div");
  meta.className = "trace-meta";
  const summary = document.createElement("strong");
  summary.textContent = traceSummary(event);
  const run = document.createElement("span");
  run.textContent = shortRunId(event.runId) ? `run ${shortRunId(event.runId)}` : "local";
  meta.append(summary, run);
  const detail = document.createElement("details");
  detail.className = "trace-detail";
  detail.open = index === 0 || event.type === "error";
  const summaryNode = document.createElement("summary");
  summaryNode.textContent = "详情";
  const pre = document.createElement("pre");
  pre.textContent = formatTracePayload(event.data);
  detail.append(summaryNode, pre);
  item.append(header, meta, detail);
  return item;
}

function renderTraceList() {
  traceList.innerHTML = "";
  traceCount.textContent = String(traceEvents.length);
  traceLatest.textContent = traceEvents[0]
    ? new Date(traceEvents[0].at).toLocaleTimeString()
    : "等待运行";

  const visibleEvents = traceEvents.filter((event) => {
    if (activeTraceFilter === "all") return true;
    return traceCategory(event.type) === activeTraceFilter;
  });

  if (visibleEvents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "trace-empty";
    empty.textContent = traceEvents.length
      ? "当前筛选下没有轨迹。"
      : "模型调用、文件操作和验证结果会显示在这里。";
    traceList.append(empty);
    return;
  }

  for (const [index, event] of visibleEvents.entries()) {
    traceList.append(renderTraceItem(event, index));
  }
  traceList.scrollTop = 0;
}

function addTrace(event) {
  if (traceEvents.some((item) => item.id === event.id)) return;
  traceEvents = [event, ...traceEvents].slice(0, 200);
  renderTraceList();
  saveState();
}

function clearTrace() {
  traceEvents = [];
  renderTraceList();
  saveState();
}

function setStatus(text, className = "") {
  statusState = { text, className };
  statusBadge.textContent = text;
  statusBadge.className = `badge inline ${className}`.trim();
  sendButton.disabled = className === "running";
  saveState();
}

function noteStreamSeq(payload) {
  if (Number.isFinite(payload?.seq)) {
    lastRunSeq = Math.max(lastRunSeq, payload.seq);
  }
}

function scheduleRunReconnect(runId) {
  if (!runId || statusState.className !== "running") return;
  window.clearTimeout(runReconnectTimer);
  runReconnectTimer = window.setTimeout(() => {
    void connectToRun(runId);
  }, 1200);
}

async function readEventStream(response) {
  if (!response.body) throw new Error("Streaming response is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      noteStreamSeq(payload);
      if (payload.runId) currentRunId = payload.runId;
      if (eventName === "trace") addTrace(payload);
      if (eventName === "assistant") addAssistantMessage(payload.text, payload.runId);
      if (eventName === "status") setStatus("运行中", "running");
      if (eventName === "done") {
        currentRunId = "";
        setStatus("完成");
      }
      if (eventName === "error") {
        currentRunId = "";
        setStatus("错误", "error");
        addErrorMessage(`运行失败：${payload.message}`, payload.runId);
      }
      saveState();
      eventName = "message";
    }
  }
}

async function connectToRun(runId) {
  if (!runId || statusState.className !== "running") return;
  runStreamController?.abort();
  runStreamController = new AbortController();
  try {
    const response = await fetch(
      `/api/runs/${encodeURIComponent(runId)}/stream?after=${lastRunSeq}`,
      { signal: runStreamController.signal },
    );
    if (!response.ok) throw new Error(await response.text());
    await readEventStream(response);
  } catch (error) {
    if (error.name !== "AbortError") scheduleRunReconnect(runId);
    return;
  }
  if (currentRunId === runId && statusState.className === "running") {
    scheduleRunReconnect(runId);
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  addMessage("user", message);
  messageInput.value = "";
  sendButton.disabled = true;
  currentRunId = "";
  lastRunSeq = -1;
  setStatus("运行中", "running");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!response.ok) throw new Error(await response.text());
    await readEventStream(response);
  } catch (error) {
    setStatus("错误", "error");
    addMessage("assistant", `请求失败：${error.message}`);
  } finally {
    sendButton.disabled = statusState.className === "running";
    messageInput.focus();
  }
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!sendButton.disabled && messageInput.value.trim()) {
    chatForm.requestSubmit();
  }
});

traceFilters.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-filter]");
  if (!button) return;
  activeTraceFilter = button.dataset.filter;
  for (const filterButton of traceFilters.querySelectorAll(".trace-filter")) {
    filterButton.classList.toggle("active", filterButton === button);
  }
  renderTraceList();
  saveState();
});

clearTraceButton.addEventListener("click", clearTrace);

resetButton.addEventListener("click", async () => {
  runStreamController?.abort();
  window.clearTimeout(runReconnectTimer);
  await fetch("/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  messageHistory = [];
  currentRunId = "";
  lastRunSeq = -1;
  assistantRunIds = [];
  errorRunIds = [];
  messages.innerHTML = "";
  localStorage.removeItem(stateStorageKey);
  clearTrace();
  setStatus("待命");
});

for (const filterButton of traceFilters.querySelectorAll(".trace-filter")) {
  filterButton.classList.toggle("active", filterButton.dataset.filter === activeTraceFilter);
}
renderMessages();
setStatus(String(statusState.text || "待命"), String(statusState.className || ""));
renderTraceList();
if (currentRunId && statusState.className === "running") {
  void connectToRun(currentRunId);
}
