export function ribbonColor(style) {
  const token = style.color === "red" ? "--paper-red" : "--paper-ink";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    || (style.color === "red" ? "#a7332e" : "#25241f");
}
