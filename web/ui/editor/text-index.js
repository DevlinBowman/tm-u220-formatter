const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const BLOCK_NAMES = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION",
  "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
  "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "UL",
]);

function point(node, offset) { return { node, offset }; }
function isBlock(node) {
  return node?.nodeType === ELEMENT_NODE && BLOCK_NAMES.has(node.nodeName);
}

function clampedOffset(value, maximum) {
  if (value === Infinity) return maximum;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(number)));
}

export function createTextIndex(root) {
  const boundaries = new Map();
  const textSegments = new Map();
  const segments = [];
  let text = "";

  function setBoundary(node, offset) {
    const values = boundaries.get(node) || [];
    values[offset] = text.length;
    boundaries.set(node, values);
  }

  function appendBreak(before, after) {
    const start = text.length;
    text += "\n";
    segments.push({ kind: "break", start, end: start + 1, before, after });
  }

  function walk(element, terminalBranch = true) {
    const children = [...element.childNodes];
    setBoundary(element, 0);
    children.forEach((child, index) => {
      const previous = children[index - 1];
      const next = children[index + 1];
      const block = isBlock(child);
      if (block && previous && !isBlock(previous)
          && !text.endsWith("\n")) {
        appendBreak(point(element, index), point(child, 0));
      }

      if (child.nodeType === TEXT_NODE) {
        const start = text.length;
        text += child.data || "";
        const segment = { kind: "text", node: child, start, end: text.length };
        textSegments.set(child, segment);
        segments.push(segment);
      } else if (child.nodeType === ELEMENT_NODE && child.nodeName === "BR") {
        const terminal = terminalBranch && !next;
        if (!terminal) {
          appendBreak(point(element, index), point(element, index + 1));
        }
      } else if (child.nodeType === ELEMENT_NODE) {
        const branchStart = text.length;
        walk(child, terminalBranch && !next);
        if (block && next
            && (!text.endsWith("\n") || text.length === branchStart)) {
          appendBreak(
            point(child, child.childNodes.length),
            point(element, index + 1));
        }
      }
      setBoundary(element, index + 1);
    });
  }

  walk(root);

  function offsetFromPoint(node, offset) {
    if (node?.nodeType === TEXT_NODE) {
      const segment = textSegments.get(node);
      if (segment) {
        return segment.start + clampedOffset(offset, segment.end - segment.start);
      }
    }
    const values = boundaries.get(node);
    if (values) {
      const index = clampedOffset(offset, values.length - 1);
      if (Number.isInteger(values[index])) return values[index];
    }
    return 0;
  }

  function pointAt(rawOffset) {
    const offset = clampedOffset(rawOffset, text.length);
    for (const segment of segments) {
      if (segment.kind === "text" && offset >= segment.start && offset <= segment.end) {
        return point(segment.node, offset - segment.start);
      }
      if (segment.kind === "break") {
        if (offset === segment.start) return segment.before;
        if (offset === segment.end) return segment.after;
      }
    }
    return point(root, root.childNodes.length);
  }

  return { text, offsetFromPoint, pointAt };
}
