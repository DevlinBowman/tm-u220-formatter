// Parses the small distribution command surface without guessing paths or destructive intent.
import os from "node:os";
import path from "node:path";

const COMMAND_OPTIONS = Object.freeze({
  help: new Set(),
  install: new Set(["--json", "--prefix"]),
  inspect: new Set(["--json", "--prefix"]),
  manifest: new Set(["--json"]),
  uninstall: new Set([
    "--dry-run", "--json", "--keep-printing-policy", "--prefix", "--remove",
  ]),
  version: new Set(),
});
const COMMANDS = new Set(Object.keys(COMMAND_OPTIONS));
const HELP_FLAGS = new Set(["--help", "-h"]);
const ALL_OPTIONS = new Set(Object.values(COMMAND_OPTIONS).flatMap((options) => [...options]));

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function defaultPrefix(runtime) {
  if (runtime.defaultPrefix) {
    if (!path.isAbsolute(runtime.defaultPrefix)) throw new Error("default prefix must be absolute");
    return path.normalize(runtime.defaultPrefix);
  }
  const home = runtime.homedir ? runtime.homedir() : os.homedir();
  if (!path.isAbsolute(home) || home === path.parse(home).root) {
    throw new Error("cannot determine a safe user home directory");
  }
  return path.join(home, ".local");
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}

function acceptOption(command, option) {
  if (!ALL_OPTIONS.has(option)) throw new UsageError(`unknown option: ${option}`);
  if (!COMMAND_OPTIONS[command].has(option)) {
    throw new UsageError(`${option} is not accepted with ${command}`);
  }
}

export function usage() {
  return `TM-U220 unprivileged distribution manager

Usage:
  tm-u220-install help
  tm-u220-install install [--prefix ABSOLUTE_PATH] [--json]
  tm-u220-install inspect [--prefix ABSOLUTE_PATH] [--json]
  tm-u220-install manifest [--json]
  tm-u220-install version
  tm-u220-install uninstall [--prefix ABSOLUTE_PATH] [--dry-run | --remove]
                           [--keep-printing-policy] [--json]

Source checkouts default to ~/.local; an installed manager defaults to its own prefix.
Choose an explicit command; a bare invocation shows this help and changes nothing.
Uninstall is a dry run unless --remove is explicit.
No command uses sudo or changes the printer authorization policy.`;
}

export function parseArguments(argv, runtime = {}) {
  const input = [...argv];
  if (input.length === 0) return { help: true };
  if (HELP_FLAGS.has(input[0])) {
    if (input.length > 1) {
      throw new UsageError(`${input[0]} cannot be combined with other arguments`);
    }
    return { help: true };
  }
  const command = input.shift();
  if (!COMMANDS.has(command)) throw new UsageError(`unknown install command: ${command}`);
  if (command === "help") {
    if (input.length > 0) throw new UsageError("help does not accept arguments or options");
    return { help: true };
  }
  if (input.length === 1 && HELP_FLAGS.has(input[0])) return { help: true };
  if (input.some((token) => HELP_FLAGS.has(token))) {
    throw new UsageError("--help cannot be combined with other options");
  }
  const result = { command, prefix: defaultPrefix(runtime), json: false,
    remove: false, dryRun: command === "uninstall", keepPrintingPolicy: false };
  let prefixSeen = false;
  let dryRunSeen = false;
  let removeSeen = false;
  let jsonSeen = false;
  let policySeen = false;
  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];
    acceptOption(command, token);
    if (token === "--json") {
      if (jsonSeen) throw new UsageError("--json may be specified only once");
      jsonSeen = true;
      result.json = true;
    }
    else if (token === "--prefix") {
      if (prefixSeen) throw new UsageError("--prefix may be specified only once");
      result.prefix = takeValue(input, index, token);
      prefixSeen = true;
      index += 1;
    } else if (token === "--remove") {
      if (removeSeen) throw new UsageError("--remove may be specified only once");
      removeSeen = true;
      result.remove = true;
      result.dryRun = false;
    } else if (token === "--dry-run") {
      if (dryRunSeen) throw new UsageError("--dry-run may be specified only once");
      result.dryRun = true;
      dryRunSeen = true;
    } else if (token === "--keep-printing-policy") {
      if (policySeen) throw new UsageError("--keep-printing-policy may be specified only once");
      policySeen = true;
      result.keepPrintingPolicy = true;
    }
  }
  if (!path.isAbsolute(result.prefix)) throw new UsageError("--prefix must be an absolute path");
  if (removeSeen && dryRunSeen) throw new UsageError("choose either --dry-run or --remove");
  return result;
}
