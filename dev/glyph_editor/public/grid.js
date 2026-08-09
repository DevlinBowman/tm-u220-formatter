// Presents one accessible Font A/B lattice and reports intentional cell edits.
// Pointer painting is contained here so the application orchestrator only manages glyph state.
function targetCell(target, root) {
  const cell = target.closest?.("[data-row][data-column]");
  return cell && root.contains(cell) ? cell : null;
}

export function createDotGrid(root, onEdit) {
  let paintValue = null;
  let lastCell = null;

  function edit(cell, value) {
    lastCell = cell;
    onEdit(Number(cell.dataset.row), Number(cell.dataset.column), value);
  }

  root.addEventListener("pointerdown", (event) => {
    const cell = targetCell(event.target, root);
    if (!cell) return;
    event.preventDefault();
    paintValue = cell.dataset.active !== "true";
    root.setPointerCapture?.(event.pointerId);
    edit(cell, paintValue);
  });
  root.addEventListener("pointermove", (event) => {
    if (paintValue === null) return;
    const cell = targetCell(document.elementFromPoint?.(event.clientX, event.clientY)
      || event.target, root);
    if (cell && cell !== lastCell) edit(cell, paintValue);
  });
  const stopPainting = () => { paintValue = null; lastCell = null; };
  root.addEventListener("pointerup", stopPainting);
  root.addEventListener("pointercancel", stopPainting);
  root.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    const cell = targetCell(event.target, root);
    if (cell) edit(cell, cell.dataset.active !== "true");
  });

  return {
    render(rows, guide = {}) {
      const width = rows[0]?.length || 0;
      const alignmentEdgeAfterRow = guide.alignmentEdgeAfterRow || rows.length;
      const authoringBaselineAfterRow = guide.authoringBaselineAfterRow || null;
      root.style.setProperty("--glyph-columns", width);
      const headers = Array.from({ length: width }, (_, column) => {
        const header = document.createElement("span");
        header.className = "half-dot-label";
        header.setAttribute("role", "columnheader");
        header.dataset.halfOffset = String(column % 2 === 1);
        header.textContent = column % 2
          ? `${Math.floor(column / 2) || ""}½` : String(column / 2);
        return header;
      });
      root.replaceChildren(...headers, ...rows.flatMap((row, rowIndex) => row.map(
        (active, columnIndex) => {
          const cell = document.createElement("button");
          const meetsAlignmentEdge = rowIndex + 1 === alignmentEdgeAfterRow;
          const meetsAuthoringBaseline = rowIndex + 1
            === authoringBaselineAfterRow;
          cell.type = "button";
          cell.className = "dot-cell";
          cell.dataset.row = rowIndex;
          cell.dataset.column = columnIndex;
          cell.dataset.active = String(active);
          cell.dataset.halfOffset = String(columnIndex % 2 === 1);
          cell.dataset.alignmentEdge = String(meetsAlignmentEdge);
          cell.dataset.authoringBaseline = String(meetsAuthoringBaseline);
          cell.setAttribute("role", "gridcell");
          cell.setAttribute("aria-pressed", String(active));
          cell.setAttribute("aria-label", `Pin row ${rowIndex + 1}, horizontal half-dot position ${columnIndex + 1} — full impact${meetsAuthoringBaseline ? "; authoring baseline follows this row" : ""}${meetsAlignmentEdge ? "; matrix alignment edge follows this row" : ""}`);
          return cell;
        })));
    },
  };
}
