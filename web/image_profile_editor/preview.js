// Derives concise printhead metrics from the same canonical bit mask painted by the receipt view.
// It never reconstructs or approximates source-image pixels in the browser.
const BIT_COUNTS = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let count = 0;
  for (let byte = value; byte; byte >>= 1) count += byte & 1;
  return count;
}));

function bitImage(result) {
  for (const line of result?.lines || []) {
    for (const segment of line.segments || []) {
      if (segment.kind === "bit_image") return { line, segment };
    }
  }
  throw new TypeError("preview contains no printer bit image");
}

export function imagePreviewMetrics(result) {
  const { line, segment } = bitImage(result);
  const width = Number(segment.mask_width_dots);
  const height = Number(segment.mask_height_dots);
  const stride = Math.ceil(width / 8);
  const hex = segment.mask_data;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
      || typeof hex !== "string" || !/^[0-9a-f]+$/i.test(hex)
      || hex.length !== stride * height * 2) {
    throw new TypeError("preview bit-image mask is not canonical");
  }
  let activeDots = 0;
  for (let index = 0; index < hex.length; index += 2) {
    activeDots += BIT_COUNTS[Number.parseInt(hex.slice(index, index + 2), 16)];
  }
  const density = segment.density || line.image_density || "solid";
  const horizontal = density === "detail" ? 160 : 80;
  return {
    width, height, activeDots,
    bands: Math.ceil(height / 8),
    byteCount: Number(result.byte_count) || 0,
    density,
    densityLabel: `${horizontal} × 72 dpi`,
    targetLabel: `${width} × ${height} dots`,
  };
}

export function renderImageMetrics(nodes, metrics, stale = false) {
  nodes.target.textContent = metrics ? metrics.targetLabel : "Target unavailable";
  nodes.density.textContent = metrics ? metrics.densityLabel : "Density unavailable";
  nodes.dots.textContent = metrics
    ? `${metrics.activeDots.toLocaleString()} active dots` : "Dots unavailable";
  nodes.bands.textContent = metrics
    ? `${metrics.bands} ${metrics.bands === 1 ? "band" : "bands"}` : "Bands unavailable";
  nodes.bytes.textContent = metrics
    ? `${metrics.byteCount.toLocaleString()} job bytes` : "Bytes unavailable";
  nodes.root.dataset.stale = String(Boolean(stale));
}
