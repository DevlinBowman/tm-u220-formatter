// Builds and then re-inspects the script-free four-artifact macOS printing-policy package.
// All external programs receive fixed executable paths and argument arrays; no shell is involved.
import { spawnSync as nodeSpawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalPackageContract, defaultPackageVersion, packageInfoBytes,
} from "../printing_policy/package_contract.mjs";
import { parseManifest } from "../printing_policy/manifest.mjs";
import { PACKAGE_ID, PACKAGE_NAME } from "../printing_policy/spec.mjs";
import { immutableByteRecord, sha256 } from "../printing_policy/validation.mjs";
import {
  validateBom, validateFlattenedPackage,
} from "../printing_policy/package_validation.mjs";

function invoke(executable, args, options, runtime = {}, allowFailure = false) {
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const result = spawnSync(executable, args, options);
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(detail || `${path.basename(executable)} exited ${result.status}`);
  }
  return result;
}

function runners(runtime) {
  return {
    run(executable, args) {
      return invoke(executable, args, { encoding: "utf8",
        env: { LC_ALL: "C", LANG: "C" } }, runtime);
    },
    spawn(executable, args, options, allowFailure = false) {
      return invoke(executable, args, options, runtime, allowFailure);
    },
  };
}

function validateWorkspace(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("package workspace must be a regular directory");
  }
  if ((stat.mode & 0o777) !== 0o700) throw new Error("package workspace must have mode 0700");
  if (process.getuid && stat.uid !== process.getuid()) {
    throw new Error("package workspace must be owned by the current account");
  }
  if (fs.readdirSync(directory).length !== 0) throw new Error("package workspace must be empty");
}

function createPayload(directory, contract) {
  const root = path.join(directory, "payload");
  fs.mkdirSync(root, { mode: 0o755 });
  const directories = contract.payloadPaths.filter((entry) => entry !== "."
    && !contract.artifacts.some((artifact) => artifact.relativePath === entry));
  for (const entry of directories) fs.mkdirSync(path.join(root, entry.slice(2)), { mode: 0o755 });
  for (const artifact of contract.artifacts) {
    const target = path.join(root, artifact.relativePath.slice(2));
    fs.writeFileSync(target, artifact.bytes, { flag: "wx", mode: 0o600 });
    fs.chmodSync(target, artifact.mode);
  }
  return root;
}

function buildBom(payloadRoot, component, contract, run) {
  const userBom = path.join(component, "UserBom");
  run("/usr/bin/mkbom", [payloadRoot, userBom]);
  const listing = run("/usr/bin/lsbom", [userBom]).stdout.trimEnd().split(/\r?\n/);
  if (listing.length !== contract.payloadPaths.length
      || listing.some((line, index) => line.split("\t")[0] !== contract.payloadPaths[index])) {
    throw new Error("staged payload contains an unexpected path");
  }
  const rootListing = listing.map((line) => {
    const fields = line.split("\t");
    fields[2] = "0/0";
    return fields.join("\t");
  }).join("\n") + "\n";
  const listPath = path.join(component, "Bom.list");
  fs.writeFileSync(listPath, rootListing, { flag: "wx", mode: 0o600 });
  const bomPath = path.join(component, "Bom");
  run("/usr/bin/mkbom", ["-i", listPath, bomPath]);
  fs.rmSync(userBom);
  fs.rmSync(listPath);
  validateBom(bomPath, contract, run);
}

function buildArchive(payloadRoot, component, contract, spawn) {
  const result = spawn("/usr/bin/cpio", [
    "-o", "-H", "odc", "-R", "0:0", "-z", "--quiet",
  ], {
    cwd: payloadRoot,
    input: contract.payloadPaths.join("\n") + "\n",
    env: { COPYFILE_DISABLE: "1", LC_ALL: "C", LANG: "C" },
    maxBuffer: 1024 * 1024,
  });
  fs.writeFileSync(path.join(component, "Payload"), result.stdout,
    { flag: "wx", mode: 0o600 });
}

export function validateSudoers(sourcePath, runtime = {}) {
  runners(runtime).run("/usr/sbin/visudo", ["-cf", sourcePath]);
}

export function buildPackage(directory, bundle, runtime = {}) {
  validateWorkspace(directory);
  const canonicalManifest = bundle?.manifest?.bytes
    ? parseManifest(bundle.manifest.bytes) : null;
  if (!canonicalManifest) throw new Error("package build requires a canonical printing manifest");
  const version = runtime.packageVersion
    ?? defaultPackageVersion(canonicalManifest, runtime.now ?? new Date());
  const contract = canonicalPackageContract(bundle, version);
  const { run, spawn } = runners(runtime);
  const payloadRoot = createPayload(directory, contract);
  for (const artifact of contract.artifacts.filter((value) => value.mode === 0o440)) {
    validateSudoers(path.join(payloadRoot, artifact.relativePath.slice(2)), runtime);
  }
  const component = path.join(directory, "component");
  fs.mkdirSync(component, { mode: 0o700 });
  buildBom(payloadRoot, component, contract, run);
  buildArchive(payloadRoot, component, contract, spawn);
  const packageInfo = packageInfoBytes(contract);
  fs.writeFileSync(path.join(component, "PackageInfo"), packageInfo,
    { flag: "wx", mode: 0o600 });
  const packagePath = path.join(directory, contract.name);
  run("/usr/sbin/pkgutil", ["--flatten", component, packagePath]);
  fs.chmodSync(packagePath, 0o400);
  const bytes = validateFlattenedPackage(
    packagePath, contract, packageInfo, directory, run, spawn,
  );
  const payload = Object.freeze(contract.artifacts.map((artifact) => Object.freeze({
    path: artifact.path, hash: artifact.hash, byteLength: artifact.byteLength,
    mode: artifact.mode, uid: artifact.uid, gid: artifact.gid,
  })));
  return immutableByteRecord(bytes, {
    path: packagePath,
    hash: sha256(bytes),
    version: contract.version,
    identifier: contract.identifier,
    name: contract.name,
    scripts: false,
    payload,
  });
}

export const packagePolicy = Object.freeze({
  identifier: PACKAGE_ID,
  name: PACKAGE_NAME,
  scripts: false,
  payloadFiles: 4,
});
