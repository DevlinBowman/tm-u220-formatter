function lineLabel(item, sourceLineOffset) {
  const line = item.span?.start_line ?? item.span?.line;
  if (line) return `Line ${Math.max(1, line - sourceLineOffset)}`;
  if (item.span?.first) return `Byte ${item.span.first}`;
  return "Document";
}

export function createDiagnosticsView(root) {
  const toggle = root.querySelector("#diagnostics-toggle");
  const list = root.querySelector("#diagnostics-list");
  const count = root.querySelector("#diagnostics-count");
  let expanded = false;

  function setExpanded(next) {
    expanded = next;
    toggle.setAttribute("aria-expanded", String(next));
    list.hidden = !next;
  }

  toggle.addEventListener("click", () => setExpanded(!expanded));

  return function renderDiagnostics(items = [], sourceLineOffset = 0) {
    list.replaceChildren();
    const errors = items.filter((item) => !item.severity || item.severity === "error");
    const warnings = items.filter((item) => item.severity === "warning");
    root.dataset.tone = errors.length ? "error" : warnings.length ? "warning" : "ready";
    count.textContent = String(items.length);

    items.forEach((item) => {
      const row = document.createElement("li");
      row.className = "diagnostic-item";
      row.dataset.severity = item.severity || "error";
      const location = document.createElement("span");
      location.className = "diagnostic-location";
      location.textContent = lineLabel(item, sourceLineOffset);
      const message = document.createElement("span");
      message.className = "diagnostic-message";
      const code = document.createElement("b");
      code.textContent = item.code || "DIAGNOSTIC";
      const detail = document.createElement("span");
      detail.textContent = item.message || "Unknown formatter issue";
      message.append(code, detail);
      row.append(location, message);
      list.append(row);
    });

    if (items.length && !expanded) setExpanded(true);
    if (!items.length && expanded) setExpanded(false);
    return { errors: errors.length, warnings: warnings.length };
  };
}
