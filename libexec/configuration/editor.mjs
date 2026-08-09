// Opens prepared authoring configuration in the fixed system Vim without shell interpretation.
// Child signals and failures are normalized to the small public CLI status contract.
import { spawnSync } from "node:child_process";

export const VIM_PATH = "/usr/bin/vim";

export function openInVim(paths, options = {}) {
  const spawn = options.spawn || spawnSync;
  const result = spawn(VIM_PATH, ["-p", "--", ...paths], {
    shell: false,
    stdio: "inherit",
    env: options.environment || process.env,
  });
  if (result.error) throw result.error;
  if (result.signal === "SIGINT") return 130;
  return result.status === 0 ? 0 : 1;
}
