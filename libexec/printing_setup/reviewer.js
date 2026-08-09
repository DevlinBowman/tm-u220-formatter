// Requires inspection of the exact generated policy before delegating to Apple Installer.
// It requests no privileges itself and treats Installer closure as unverified until terminal audit.
ObjC.import("Foundation");

const app = Application.currentApplication();
app.includeStandardAdditions = true;
const setupTitle = "TM-U220 Printing Setup";

function resourcePath(name) {
  const root = ObjC.unwrap($.NSBundle.mainBundle.resourcePath);
  return `${root}/${name}`;
}

function readText(filePath) {
  const error = Ref();
  const value = $.NSString.stringWithContentsOfFileEncodingError(
    filePath, $.NSUTF8StringEncoding, error,
  );
  if (!value) throw new Error(`cannot read setup resource: ${filePath}`);
  return ObjC.unwrap(value);
}

function writeResult(value) {
  const bundlePath = ObjC.unwrap($.NSBundle.mainBundle.bundlePath);
  const error = Ref();
  const ok = $(value).writeToFileAtomicallyEncodingError(
    `${bundlePath}/../setup-result`, true, $.NSUTF8StringEncoding, error,
  );
  if (!ok) throw new Error("cannot record the setup result");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function showReview() {
  try {
    app.doShellScript(
      `/usr/bin/qlmanage -p ${shellQuote(resourcePath("TM-U220 Policy Review.txt"))}`
        + " >/dev/null 2>&1",
    );
    return true;
  } catch (_) {
    app.displayAlert(setupTitle, {
      message: "The exact policy review could not be opened. Nothing was installed.",
      as: "critical",
      buttons: ["Close"],
      defaultButton: "Close",
    });
    return false;
  }
}

function verifyPackageHash(packagePath) {
  const expected = readText(resourcePath("package-sha256")).trim();
  const output = app.doShellScript(`/usr/bin/shasum -a 256 ${shellQuote(packagePath)}`);
  const actual = output.trim().split(/\s+/)[0];
  if (actual !== expected) {
    throw new Error("the Installer package changed after review; nothing was opened");
  }
}

function initialReview(summary) {
  const response = app.displayAlert(setupTitle, {
    message: summary,
    buttons: ["Cancel", "Review Exact Policy…"],
    defaultButton: "Review Exact Policy…",
  });
  if (response.buttonReturned === "Cancel") return false;
  return showReview();
}

function run() {
  const summary = readText(resourcePath("review-summary")).trim();
  const packageName = readText(resourcePath("package-name")).trim();
  if (!initialReview(summary)) {
    writeResult("cancelled\n");
    return;
  }
  while (true) {
    const response = app.displayAlert(setupTitle, {
      message: summary,
      buttons: ["Cancel", "Review Again…", "Continue to Apple Installer"],
      defaultButton: "Continue to Apple Installer",
    });
    if (response.buttonReturned === "Cancel") {
      writeResult("cancelled\n");
      return;
    }
    if (response.buttonReturned === "Review Again…") {
      if (!showReview()) {
        writeResult("cancelled\n");
        return;
      }
      continue;
    }

    try {
      const packagePath = resourcePath(packageName);
      verifyPackageHash(packagePath);
      writeResult("installer-opened\n");
      app.doShellScript(
        `/usr/bin/open -W -n -b com.apple.installer ${shellQuote(packagePath)}`,
      );
      writeResult("installer-closed\n");
      app.displayAlert(setupTitle, {
        message: "Apple Installer closed. Return to the terminal for an independent check of "
          + "the installed files, receipt, and every effective command. Installer made no printer connection.",
        buttons: ["Return to Terminal"],
        defaultButton: "Return to Terminal",
      });
      return;
    } catch (error) {
      writeResult(`failed\t${String(error.message || error).replace(/[\r\n\t]+/g, " ")}\n`);
      app.displayAlert(setupTitle, {
        message: `Setup did not complete.\n\n${error.message || error}`,
        as: "critical",
        buttons: ["Close"],
        defaultButton: "Close",
      });
      return;
    }
  }
}
