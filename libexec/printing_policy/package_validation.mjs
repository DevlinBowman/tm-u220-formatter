// Inspects the flattened installer package against its exact payload and metadata contract.
// Validation expands and extracts locally, ensuring no script or unreviewed archive member survived.
import fs from "node:fs";
import path from "node:path";

function lines(value) {
  return String(value).split(/\r?\n/).filter(Boolean);
}

function packageSnapshot(packagePath) {
  const before = fs.lstatSync(packagePath);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || before.size < 1 || before.size > 16 * 1024 * 1024) {
    throw new Error("flattened package must be one bounded regular non-symlink file");
  }
  const descriptor = fs.openSync(packagePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev
        || opened.ino !== before.ino || opened.size !== before.size) {
      throw new Error("flattened package changed while it was being opened");
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (bytes.length !== after.size || after.size !== opened.size
        || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error("flattened package changed while it was being read");
    }
    return { bytes, dev: after.dev, ino: after.ino, size: after.size,
      mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
  } finally { fs.closeSync(descriptor); }
}

function sameSnapshot(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
    && before.bytes.equals(after.bytes);
}

export function expectedBomLines(contract) {
  const artifacts = new Map(contract.artifacts.map((value) => [value.relativePath, value]));
  return contract.payloadPaths.map((entry) => {
    const artifact = artifacts.get(entry);
    const mode = artifact ? 0o100000 | artifact.mode : 0o040000 | 0o755;
    return `${entry}\t${mode.toString(8)}\t0\t0`;
  });
}

export function validateBom(bomPath, contract, run) {
  const actual = lines(run("/usr/bin/lsbom", ["-p", "fmug", bomPath]).stdout);
  const expected = expectedBomLines(contract);
  if (actual.length !== expected.length
      || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`package BOM metadata differs from the reviewed contract: ${actual.join(", ")}`);
  }
}

function validateExtracted(extracted, contract) {
  for (const entry of contract.payloadPaths) {
    const target = entry === "." ? extracted : path.join(extracted, entry.slice(2));
    const stat = fs.lstatSync(target);
    const artifact = contract.artifacts.find((value) => value.relativePath === entry);
    if (artifact) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
          || (stat.mode & 0o777) !== artifact.mode) {
        throw new Error(`extracted package artifact has wrong type or mode: ${entry}`);
      }
      if (!fs.readFileSync(target).equals(artifact.bytes)) {
        throw new Error(`extracted package artifact bytes differ: ${entry}`);
      }
    } else if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o755) {
      throw new Error(`extracted package directory has wrong type or mode: ${entry}`);
    }
  }
}

function validateArchiveMetadata(payload, contract, spawn) {
  const output = spawn("/usr/bin/cpio", ["-itv", "--quiet"], {
    input: payload, encoding: "utf8", env: { LC_ALL: "C", LANG: "C" },
  }).stdout;
  const actual = lines(output).map((line) => {
    const fields = line.trim().split(/\s+/);
    return { mode: fields[0], owner: fields[2], group: fields[3],
      size: Number(fields[4]), path: fields.at(-1) };
  });
  if (actual.length !== contract.payloadPaths.length) {
    throw new Error("archive metadata listing has an unexpected entry count");
  }
  for (let index = 0; index < actual.length; index += 1) {
    const value = actual[index];
    const entry = contract.payloadPaths[index];
    const artifact = contract.artifacts.find((item) => item.relativePath === entry);
    const expectedMode = artifact
      ? artifact.mode === 0o440 ? "-r--r-----" : "-r--r--r--"
      : "drwxr-xr-x";
    if (value.path !== entry || value.mode !== expectedMode || value.owner !== "root"
        || value.group !== "wheel" || value.size !== (artifact?.byteLength || 0)) {
      throw new Error(`archive metadata differs from review: ${entry}`);
    }
  }
}

export function validateFlattenedPackage(packagePath, contract, packageInfo, directory,
  run, spawn) {
  const before = packageSnapshot(packagePath);
  const listing = lines(run("/usr/sbin/pkgutil", ["--payload-files", packagePath]).stdout)
    .map((entry) => entry === "." ? "." : entry.startsWith("./") ? entry : `./${entry}`);
  const expectedListing = contract.payloadPaths;
  if (listing.length !== expectedListing.length
      || listing.some((entry, index) => entry !== expectedListing[index])) {
    throw new Error(`installer payload listing differs from review: ${listing.join(", ")}`);
  }

  const expanded = path.join(directory, "expanded-verification");
  run("/usr/sbin/pkgutil", ["--expand", packagePath, expanded]);
  const members = fs.readdirSync(expanded).sort();
  if (members.join("\n") !== "Bom\nPackageInfo\nPayload") {
    throw new Error(`expanded package contains unexpected members: ${members.join(", ")}`);
  }
  if (!fs.readFileSync(path.join(expanded, "PackageInfo")).equals(packageInfo)) {
    throw new Error("flattened PackageInfo differs from the reviewed package metadata");
  }
  validateBom(path.join(expanded, "Bom"), contract, run);
  const payload = fs.readFileSync(path.join(expanded, "Payload"));
  const archiveListing = lines(spawn("/usr/bin/cpio", ["-it", "--quiet"], {
    input: payload, encoding: "utf8", env: { LC_ALL: "C", LANG: "C" },
  }).stdout);
  if (archiveListing.length !== contract.payloadPaths.length
      || archiveListing.some((entry, index) => entry !== contract.payloadPaths[index])) {
    throw new Error(`archive contains unexpected members: ${archiveListing.join(", ")}`);
  }
  validateArchiveMetadata(payload, contract, spawn);
  const extracted = path.join(directory, "extracted-verification");
  fs.mkdirSync(extracted, { mode: 0o700 });
  spawn("/usr/bin/cpio", ["-id", "--quiet", "--no-preserve-owner"], {
    cwd: extracted, input: payload, encoding: "utf8", env: { LC_ALL: "C", LANG: "C" },
  });
  validateExtracted(extracted, contract);

  const signature = spawn("/usr/sbin/pkgutil", ["--check-signature", packagePath],
    { encoding: "utf8", env: { LC_ALL: "C", LANG: "C" } }, true);
  const signatureText = `${signature.stdout || ""}\n${signature.stderr || ""}`;
  if (signature.status === 0 || !/no signature/i.test(signatureText)) {
    throw new Error("package signature state is not the reviewed unsigned state");
  }
  const after = packageSnapshot(packagePath);
  if (!sameSnapshot(before, after)) {
    throw new Error("flattened package changed during final validation");
  }
  return after.bytes;
}
