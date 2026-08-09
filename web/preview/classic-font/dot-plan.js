export function repeatFactors(style = {}) {
  return {
    x: style.double_width ? 2 : 1,
    y: style.double_height ? 2 : 1,
  };
}
