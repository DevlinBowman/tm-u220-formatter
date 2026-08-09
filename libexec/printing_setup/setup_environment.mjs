// Verifies the fixed macOS tools used to build, review, install, inspect, and remove the policy.
// Setup never searches PATH for substitutes to privileged or package-related executables.
import fs from "node:fs";

const REQUIRED_TOOLS = Object.freeze([
  "/bin/rm", "/bin/rmdir",
  "/usr/bin/codesign", "/usr/bin/cpio", "/usr/bin/lsbom", "/usr/bin/mkbom", "/usr/bin/nc",
  "/usr/bin/open", "/usr/bin/osacompile", "/usr/bin/osascript", "/usr/bin/perl",
  "/usr/bin/plutil", "/usr/bin/qlmanage",
  "/usr/bin/shasum",
  "/usr/bin/sudo", "/usr/sbin/pkgutil", "/usr/sbin/visudo",
]);

export function assertSetupEnvironment(runtime = {}) {
  const platform = runtime.platform || process.platform;
  if (platform !== "darwin") {
    throw new Error("TM-U220 Printing Setup is available only on macOS");
  }
  const inspect = runtime.inspectExecutable || ((filePath) => {
    const stat = fs.statSync(filePath);
    fs.accessSync(filePath, fs.constants.X_OK);
    return stat.isFile();
  });
  for (const filePath of REQUIRED_TOOLS) {
    let usable = false;
    try { usable = inspect(filePath) === true; } catch {}
    if (!usable) throw new Error(`required macOS tool is unavailable: ${filePath}`);
  }
  return Object.freeze({ platform, tools: REQUIRED_TOOLS });
}

export { REQUIRED_TOOLS };
