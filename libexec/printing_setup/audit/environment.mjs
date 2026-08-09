// Reports whether the host and local executables needed by policy lifecycle and printing are available.
// Checks are read-only and never search PATH for a substitute privileged binary.
import fs from "node:fs";
import { REQUIRED_TOOLS } from "../setup_environment.mjs";

const PURPOSES = Object.freeze({
  rm: "printing-policy removal", rmdir: "printing-policy removal",
  codesign: "local reviewer integrity", nc: "printing", sudo: "printing and audit",
  pkgutil: "package and receipt",
  visudo: "package validation", mkbom: "package build", lsbom: "package validation",
  cpio: "package build and validation", osacompile: "reviewer build",
  osascript: "native setup assistant",
  perl: "LPD session", plutil: "reviewer build", open: "reviewer and Installer launch",
  shasum: "reviewed package verification", qlmanage: "exact review display",
});
const DEFAULT_DEPENDENCIES = Object.freeze([
  Object.freeze({ name: "node", path: process.execPath, purpose: "status" }),
  ...REQUIRED_TOOLS.map((path) => {
    const name = path.split("/").at(-1);
    return Object.freeze({ name, path, purpose: PURPOSES[name] });
  }),
]);

export function auditEnvironment(policy = {}, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const dependencies = policy.dependencies || DEFAULT_DEPENDENCIES;
  const inspect = runtime.inspectExecutable || ((path) => {
    try {
      const stat = fs.statSync(path);
      fs.accessSync(path, fs.constants.X_OK);
      return { exists: true, regularFile: stat.isFile(), executable: true };
    } catch (error) {
      return { exists: error?.code !== "ENOENT", regularFile: false,
        executable: false, error: String(error?.code || error?.message || error) };
    }
  });
  const checked = dependencies.map((dependency) => ({
    name: dependency.name,
    path: dependency.path,
    purpose: dependency.purpose || null,
    ...inspect(dependency.path),
  }));
  return {
    platform: { actual: platform, required: "darwin", supported: platform === "darwin" },
    dependencies: checked,
    ready: platform === "darwin"
      && checked.every((value) => value.exists && value.regularFile && value.executable),
  };
}
