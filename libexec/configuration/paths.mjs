// Resolves immutable configuration templates and writable per-user destinations.
// No caller may substitute arbitrary files or cross into the managed printer policy.
import path from "node:path";

export const CONFIGURATION_FILES = Object.freeze([
  Object.freeze({ name: "aliases", label: "directive aliases",
    factoryRelative: "config/directives/aliases.u220a",
    userRelative: "directives/aliases.u220a" }),
  Object.freeze({ name: "profile", label: "authoring printer profile",
    factoryRelative: "config/printers/local.u220p",
    userRelative: "printers/local.u220p" }),
]);

function absoluteEnvironmentPath(value, name) {
  if (!value) return null;
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return path.normalize(value);
}

export function configurationRoot(environment = process.env) {
  const explicit = absoluteEnvironmentPath(environment.TM_U220_CONFIG_HOME,
    "TM_U220_CONFIG_HOME");
  if (explicit) return explicit;
  const xdg = absoluteEnvironmentPath(environment.XDG_CONFIG_HOME, "XDG_CONFIG_HOME");
  if (xdg) return path.join(xdg, "tm-u220");
  const home = absoluteEnvironmentPath(environment.HOME, "HOME");
  if (!home) throw new Error("HOME is required to locate editable TM-U220 configuration");
  return path.join(home, ".config", "tm-u220");
}

export function configurationFiles(root, environment = process.env, userOwned = true) {
  if (!path.isAbsolute(root)) throw new Error("TM-U220 release root must be absolute");
  const userRoot = userOwned ? configurationRoot(environment) : null;
  return CONFIGURATION_FILES.map((definition) => Object.freeze({
    ...definition,
    factoryPath: path.join(root, definition.factoryRelative),
    path: userOwned ? path.join(userRoot, definition.userRelative)
      : path.join(root, definition.factoryRelative),
    userOwned,
  }));
}
