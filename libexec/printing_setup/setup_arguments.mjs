// Parses the small setup surface without accepting positional or duplicate values.
// A bare invocation uses the native assistant; complete flags remain deterministic automation.

export const SETUP_USAGE = "Usage: 220 setup-printing [--host IPV4 --profile default|FILE]\n";

export class SetupUsageError extends Error {
  constructor(message) {
    super(message);
    this.exitCode = 64;
  }
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value.length === 0) {
    throw new SetupUsageError(`${option} requires a value`);
  }
  return value;
}

export function parseSetupArguments(argv) {
  const options = { host: null, profilePath: null, help: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      if (seen.has("help")) throw new SetupUsageError("--help may be supplied only once");
      seen.add("help");
      options.help = true;
    } else if (option === "--host" || option === "--profile") {
      if (seen.has(option)) throw new SetupUsageError(`${option} may be supplied only once`);
      seen.add(option);
      const value = optionValue(argv, index, option);
      if (option === "--host") options.host = value;
      else options.profilePath = value;
      index += 1;
    } else {
      throw new SetupUsageError(`unknown setup option: ${option}`);
    }
  }
  if (options.help && seen.size !== 1) {
    throw new SetupUsageError("--help cannot be combined with setup options");
  }
  return Object.freeze(options);
}
