// Builds schema-driven controls for the ten canonical image-profile fields.
// Presentation groups mask interpretation separately from printer-motion behavior.
export const MASK_FIELDS = Object.freeze([
  "density", "fit", "resample", "dither", "threshold", "invert",
  "default_width_cells", "default_height_cells",
]);
export const PRINT_FIELDS = Object.freeze([
  "unidirectional", "trailing_gap_vertical_units",
]);

const COPY = Object.freeze({
  density: ["Dot density", "Solid is 80 × 72 dpi; detail is 160 × 72 dpi with safe strike spacing."],
  fit: ["Box fit", "Contain, cover, or stretch applies when output height is fixed."],
  resample: ["Resampling", "Choose how source pixels are sampled onto the physical dot grid."],
  dither: ["Dithering", "Threshold is hard-edged; ordered and Floyd distribute dots for perceived tone."],
  threshold: ["Threshold", "Higher values place more ink."],
  invert: ["Invert tone", "Swap light and dark before dithering."],
  default_width_cells: ["Default width", "Use the printable page or a fixed number of character cells."],
  default_height_cells: ["Default height", "Automatic height preserves physical aspect ratio."],
  unidirectional: ["Unidirectional bands", "Improves registration but does not change the preview mask."],
  trailing_gap_vertical_units: ["Trailing paper gap", "Adds 1/144-inch feed units after the image."],
});

function title(value) {
  const text = String(value).replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function controlKind(field) {
  if (Array.isArray(field.choices)) return "choices";
  if (field.kind === "boolean" || typeof field.default === "boolean") return "boolean";
  if (typeof field.keyword === "string") return "keyword";
  return "integer";
}

function modeButton(field, value, label = title(value)) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode-button";
  button.dataset.field = field.name;
  button.dataset.value = String(value);
  button.textContent = label;
  return button;
}

function integerInput(field) {
  const input = document.createElement("input");
  input.id = `profile-${field.name}`;
  input.type = field.name === "threshold" ? "range" : "number";
  input.min = String(field.minimum ?? 0);
  if (Number.isInteger(field.maximum)) input.max = String(field.maximum);
  input.step = "1";
  input.dataset.field = field.name;
  input.className = "integer-input";
  input.setAttribute("aria-label", `${COPY[field.name]?.[0] || title(field.name)} value`);
  return input;
}

function controlFor(field) {
  const kind = controlKind(field);
  const wrap = document.createElement("div");
  wrap.className = kind === "integer" ? "integer-control" : "mode-switch";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", COPY[field.name]?.[0] || title(field.name));
  if (kind === "choices") {
    for (const choice of field.choices) wrap.append(modeButton(field, choice));
  } else if (kind === "boolean") {
    wrap.append(modeButton(field, false, "Off"), modeButton(field, true, "On"));
  } else if (kind === "keyword") {
    wrap.append(modeButton(field, field.keyword), modeButton(field, "custom", "Cells"));
    wrap.append(integerInput(field));
  } else {
    wrap.append(integerInput(field));
    const output = document.createElement("output");
    output.dataset.output = field.name;
    output.htmlFor = `profile-${field.name}`;
    wrap.append(output);
  }
  return wrap;
}

function fieldNode(field) {
  const node = document.createElement("section");
  node.className = "profile-field";
  node.dataset.profileField = field.name;
  const heading = document.createElement("div");
  heading.className = "profile-field-heading";
  const copy = COPY[field.name] || [title(field.name), field.name];
  const label = document.createElement("strong");
  label.textContent = copy[0];
  const canonical = document.createElement("code");
  canonical.textContent = field.name;
  heading.append(label, canonical);
  const help = document.createElement("p");
  help.textContent = copy[1];
  node.append(heading, controlFor(field), help);
  return node;
}

export function createProfileControls(roots, options) {
  const numericDrafts = new Map();
  let schema = null;

  function edit(event) {
    const target = event.target.closest?.("[data-field]");
    if (!target) return;
    const field = schema.fields.find(({ name }) => name === target.dataset.field);
    if (!field) return;
    try {
      let value = target.dataset.value ?? target.value;
      if (controlKind(field) === "boolean") value = value === "true";
      if (value === "custom") value = numericDrafts.get(field.name)
        ?? (Number.isInteger(field.default) ? field.default : field.minimum ?? 1);
      options.onEdit(field.name, value);
    } catch (error) { options.onError?.(error); }
  }

  for (const root of Object.values(roots)) {
    root.addEventListener("click", edit);
    root.addEventListener("input", edit);
  }

  function build(nextSchema) {
    schema = nextSchema;
    roots.mask.replaceChildren();
    roots.print.replaceChildren();
    for (const field of schema.fields) {
      const root = MASK_FIELDS.includes(field.name) ? roots.mask : roots.print;
      root.append(fieldNode(field));
    }
  }

  function render(model) {
    if (schema !== model.schema) build(model.schema);
    for (const field of schema.fields) {
      const value = model.value(field.name);
      if (typeof value === "number") numericDrafts.set(field.name, value);
      const node = document.querySelector(`[data-profile-field="${field.name}"]`);
      const disabled = field.name === "fit" && model.fitDisabled;
      node.dataset.disabled = String(disabled);
      node.querySelectorAll("button").forEach((button) => {
        const selected = controlKind(field) === "keyword"
          ? (button.dataset.value === "custom" ? typeof value === "number"
            : button.dataset.value === String(value))
          : button.dataset.value === String(value);
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.disabled = disabled;
      });
      const input = node.querySelector("input");
      if (input) {
        input.value = String(typeof value === "number"
          ? value : numericDrafts.get(field.name) ?? field.minimum ?? 1);
        input.disabled = disabled || (controlKind(field) === "keyword" && value === field.keyword);
      }
      const output = node.querySelector("output");
      if (output) output.textContent = String(value);
    }
    roots.fitNote.hidden = !model.fitDisabled;
  }

  return { render };
}
