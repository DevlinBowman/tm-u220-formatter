// Classifies one fixed application root as a managed release or source checkout.
// Configuration tools share this boundary so editable-path ownership cannot drift.
import fs from "node:fs";
import path from "node:path";

function marker(root, name, runtime) {
  try { return runtime.lstatSync(path.join(root, name)); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function configurationIsManaged(root, runtime = fs) {
  const manifest = marker(root, ".tm-u220-install.json", runtime);
  if (manifest) {
    if (!manifest.isFile() || manifest.isSymbolicLink()) {
      throw new Error("installed release manifest must be a regular file");
    }
    return true;
  }

  const checkout = marker(root, ".git", runtime);
  if (!checkout) {
    throw new Error("cannot identify this as a managed release or source checkout");
  }
  if ((!checkout.isDirectory() && !checkout.isFile()) || checkout.isSymbolicLink()) {
    throw new Error("source checkout marker must be a regular file or directory");
  }
  return false;
}
