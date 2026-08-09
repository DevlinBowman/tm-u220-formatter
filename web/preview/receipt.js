// Renders compiler-owned receipt geometry into accessible browser preview nodes.
import { createSegmentNode, normalizedSourceLine } from "./glyphs.js";
import { lineFrameLayout } from "./layout/line-frame.js";
import {
  DEFAULT_PREVIEW_FONT,
  normalizePreviewFont,
} from "./font-mode.js";

function addClass(node, name, condition) { if (condition) node.classList.add(name); }

function paperMillimeters(profile) {
  return (profile.paper_width_tenths_mm || 760) / 10;
}

function profileDetails(profile) {
  const paper = paperMillimeters(profile);
  const font = profile.defaults?.font || profile.default_font || "b";
  const columns = profile.columns?.[font];
  return {
    model: `TM-U220 Type ${(profile.variant || "?").toUpperCase()}`,
    paper: `${paper} mm`,
    columns: columns ? `${columns} Font ${font.toUpperCase()} columns` : "Printer profile",
    targetWidth: paper * 5,
  };
}

export function accessibleLineLabel(line) {
  const text = typeof line?.text === "string" ? line.text : "";
  return text.trim() ? text : "blank printer line";
}

function lineNode(line, geometry, profile, sourceOffset, previewFont) {
  const node = document.createElement("div");
  const layout = lineFrameLayout(line, geometry);
  node.className = "receipt-line";
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", accessibleLineLabel(line));
  node.style.left = `${geometry.printLeft + (line.x_offset_half_dots || 0) * geometry.xUnit}px`;
  node.style.top = `${geometry.top + ((line.y_vertical_units || 0) - geometry.minY) * geometry.yUnit}px`;
  node.style.width = `${(line.content_width_half_dots || 0) * geometry.xUnit}px`;
  node.style.height = `${layout.advanceHeight}px`;
  node.dataset.sourceLine = normalizedSourceLine(line.source_span, sourceOffset) || "";
  const content = document.createElement("div");
  content.className = "receipt-line-content";
  content.style.height = `${layout.contentHeight}px`;
  addClass(content, "is-upside-down", layout.upsideDown);
  for (const segment of line.segments || []) {
    content.append(createSegmentNode(
      segment, line, geometry, profile, sourceOffset, previewFont));
  }
  node.append(content);
  return node;
}

function sourceAnchors(result, geometry) {
  const found = [];
  const offset = result.source_line_offset || 0;
  const add = (span, paperY, kind) => {
    const sourceLine = normalizedSourceLine(span, offset);
    if (sourceLine) found.push({ sourceLine, paperY, kind });
  };
  for (const line of result.lines || []) {
    const y = geometry.top
      + ((line.y_vertical_units || 0) - geometry.minY) * geometry.yUnit
      + (line.glyph_height_vertical_units || 0) * geometry.yUnit / 2;
    add(line.source_span, y, "line");
    for (const segment of line.segments || []) add(segment.source_span, y, "segment");
  }
  for (const event of result.paper_preview?.events || []) {
    if (!event.source_span) continue;
    const units = event.kind === "motion"
      ? ((event.from_y_vertical_units || 0) + (event.to_y_vertical_units || 0)) / 2
      : event.y_vertical_units || 0;
    add(event.source_span,
      geometry.top + (units - geometry.minY) * geometry.yUnit, event.kind);
  }
  const unique = new Map(found.map((item) => [
    `${item.sourceLine}:${item.paperY.toFixed(2)}`, item,
  ]));
  return [...unique.values()];
}

function geometryFor(result, width) {
  const profile = result.profile;
  const paper = paperMillimeters(profile);
  const scale = width / paper;
  const xUnit = 25.4 / 160 * scale;
  const yUnit = 25.4 / 144 * scale;
  const plan = result.paper_preview || {};
  const minY = plan.min_y_vertical_units || 0;
  const maxY = plan.max_y_vertical_units || 0;
  const top = (profile.head_to_cutter_vertical_units || 48) * yUnit;
  const printWidth = (profile.print_width_half_dots || 400) * xUnit;
  const hasCut = plan.events?.some((event) => event.kind === "cut");
  const bottom = hasCut ? 0 : 24 * yUnit;
  return {
    scale, xUnit, yUnit, minY, top,
    printLeft: (width - printWidth) / 2,
    height: Math.max(45 * scale, top + (maxY - minY) * yUnit + bottom),
  };
}

export function createReceiptView(nodes) {
  let current = null;
  let lastValid = null;
  let anchors = [];
  let drawnWidth = 0;
  let previewFont = DEFAULT_PREVIEW_FONT;
  const layoutListeners = new Set();

  function notifyLayout() { for (const listener of layoutListeners) listener(); }

  function showPlaceholder(title, message) {
    nodes.lines.replaceChildren();
    nodes.finish.hidden = true;
    nodes.profile.hidden = true;
    nodes.receipt.classList.remove("is-stale");
    nodes.receipt.style.removeProperty("height");
    nodes.receipt.style.removeProperty("--receipt-width");
    delete nodes.receipt.dataset.cut;
    anchors = [];
    nodes.placeholder.querySelector("strong").textContent = title;
    nodes.placeholder.querySelector("p").textContent = message;
    nodes.placeholder.hidden = false;
    notifyLayout();
  }

  function draw(result) {
    if (!result?.profile) return showPlaceholder("Nothing to render yet",
      "Fix the document diagnostics to produce a receipt preview.");
    const details = profileDetails(result.profile);
    nodes.receipt.style.setProperty("--receipt-width", `${details.targetWidth}px`);
    const width = nodes.receipt.getBoundingClientRect().width || details.targetWidth;
    drawnWidth = width;
    const geometry = geometryFor(result, width);
    nodes.receipt.style.height = `${geometry.height}px`;
    nodes.receipt.dataset.cut = result.finish?.cut_shape || "none";
    const sourceOffset = result.source_line_offset || 0;
    nodes.lines.replaceChildren(...(result.lines || []).map((line) =>
      lineNode(line, geometry, result.profile, sourceOffset, previewFont)));
    anchors = sourceAnchors(result, geometry);
    nodes.placeholder.hidden = true;
    nodes.profile.hidden = false;
    nodes.profile.querySelector("#profile-model").textContent = details.model;
    nodes.profile.querySelector("#profile-paper").textContent = details.paper;
    nodes.profile.querySelector("#profile-columns").textContent = details.columns;
    nodes.finish.textContent = result.finish?.cut_shape
      ? `${result.finish.cut_shape} cut` : "";
    nodes.finish.hidden = !result.finish?.cut_shape;
    notifyLayout();
  }

  function render(result) {
    current = result;
    if (result?.valid !== false) lastValid = result;
    const visible = result?.valid === false ? lastValid : result;
    nodes.receipt.classList.toggle("is-stale", result?.valid === false && Boolean(lastValid));
    draw(visible || result);
    return visible?.lines?.length || 0;
  }

  function setPreviewFont(value) {
    const next = normalizePreviewFont(value);
    if (previewFont === next) return;
    previewFont = next;
    const visible = current?.valid === false ? lastValid : current;
    if (visible) draw(visible);
  }

  new ResizeObserver(([entry]) => {
    const width = entry?.contentRect?.width || nodes.receipt.getBoundingClientRect().width;
    if (Math.abs(width - drawnWidth) < 0.25) return;
    if (current) draw(current.valid === false ? lastValid : current);
  }).observe(nodes.receipt);
  return {
    render,
    setPreviewFont,
    showPlaceholder,
    getSourceAnchors: () => anchors,
    onLayout(listener) {
      layoutListeners.add(listener);
      return () => layoutListeners.delete(listener);
    },
  };
}
