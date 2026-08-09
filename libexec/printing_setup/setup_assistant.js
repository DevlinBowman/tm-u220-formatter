// Presents the native first-time host and physical-profile choices for printing setup.
// It performs no validation, network I/O, authorization, or file mutation.
const app = Application.currentApplication();
app.includeStandardAdditions = true;
const title = "TM-U220 Printing Setup";

function cancelled(error) {
  return Number(error && error.errorNumber) === -128 || String(error).includes("(-128)");
}

function askForHost(initial) {
  const response = app.displayDialog(
    "Enter the printer’s numeric IPv4 address. Setup will show the exact passwordless "
      + "connection bypass before requesting administrator approval. The printer will not "
      + "be contacted until that bypass is installed.",
    {
      withTitle: title,
      defaultAnswer: initial || "",
      buttons: ["Cancel", "Continue"],
      defaultButton: "Continue",
      cancelButton: "Cancel",
    },
  );
  return String(response.textReturned).trim();
}

function askForProfile(config) {
  const response = app.displayAlert(title, {
    message: `Included profile: ${config.defaultProfileDescription}.\n\n`
      + "The device check cannot detect paper width, DIP-switch position, or cutter type. "
      + "Use the included profile only if those settings match this printer.",
    buttons: ["Cancel", "Choose Another…", "Use Included Profile"],
    defaultButton: "Use Included Profile",
    cancelButton: "Cancel",
  });
  if (response.buttonReturned === "Use Included Profile") return config.defaultProfilePath;
  const selected = app.chooseFile({
    withPrompt: "Choose the physical-printer profile to install",
    defaultLocation: Path(config.defaultProfileDirectory),
  });
  return String(selected);
}

function run(argv) {
  if (argv.length !== 1) throw new Error("setup assistant configuration is missing");
  const config = JSON.parse(argv[0]);
  if (config.schemaVersion !== 1) throw new Error("unsupported setup assistant configuration");
  try {
    const host = config.host || askForHost(config.suggestedHost || "");
    const profilePath = config.profilePath || askForProfile(config);
    return JSON.stringify({ schemaVersion: 1, action: "continue", host, profilePath });
  } catch (error) {
    if (cancelled(error)) return JSON.stringify({ schemaVersion: 1, action: "cancel" });
    throw error;
  }
}
