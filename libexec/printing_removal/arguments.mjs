// Parses the deliberately small printer-policy removal interface.
// Mutation is impossible unless the caller supplies the exact --remove flag.

export const REMOVAL_HELP = `Usage: tm-u220-remove-printing [--remove] [--json]\n\n`
  + "Without --remove, this performs a read-only audit and prints the exact removal plan.\n"
  + "--remove authorizes the listed fixed administrator actions; no rollback is claimed.\n"
  + "--json emits the stable tm-u220-printing-removal schema version 1.\n";

export class RemovalUsageError extends Error {}

export function parseRemovalArguments(argv) {
  const options = { remove: false, json: false, help: false };
  for (const value of argv) {
    let name;
    if (value === "--remove") name = "remove";
    else if (value === "--json") name = "json";
    else if (value === "--help" || value === "-h") name = "help";
    else throw new RemovalUsageError(`unknown option: ${value}`);
    if (options[name]) throw new RemovalUsageError(`duplicate option: ${value}`);
    options[name] = true;
  }
  return Object.freeze(options);
}
