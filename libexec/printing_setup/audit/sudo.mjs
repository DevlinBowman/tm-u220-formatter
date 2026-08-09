// Compares effective passwordless netcat grants with the canonical command allowlist.
// It uses only non-interactive sudo listing and intentionally omits unrelated sudo privileges.
import { spawnSync as nodeSpawnSync } from "node:child_process";

const READ_ONLY_ENVIRONMENT = Object.freeze({
  LC_ALL: "C", LANG: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
});

function entries(text) {
  return String(text || "").split(/^Sudoers entry:\s*$/m).slice(1).flatMap((block) => {
    const runAs = block.match(/^\s*RunAsUsers:\s*(.+)$/m)?.[1]?.trim() || "";
    const runAsUsers = runAs.split(",").map((value) => value.trim());
    const optionText = block.match(/^\s*Options:\s*(.+)$/m)?.[1] || "";
    const options = new Set(optionText.split(",").map((value) => value.trim()).filter(Boolean));
    const lines = block.split(/^\s*Commands:\s*$/m)[1]?.split(/\r?\n/) || [];
    return lines.map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({
        command: value.startsWith("!") ? value.slice(1).trimStart() : value,
        negated: value.startsWith("!"),
        runAsRoot: runAs === "root", allowsRoot: runAsUsers.includes("root")
          || runAsUsers.includes("ALL"),
        nopasswd: options.has("!authenticate"),
        noexec: options.has("noexec"), nosetenv: options.has("!setenv"),
      }));
  });
}

function globMatches(pattern, value) {
  const memo = new Map();
  function match(patternIndex, valueIndex) {
    const key = `${patternIndex}:${valueIndex}`;
    if (memo.has(key)) return memo.get(key);
    let result;
    const token = pattern[patternIndex];
    if (patternIndex === pattern.length) result = valueIndex === value.length;
    else if (token === "*") {
      result = match(patternIndex + 1, valueIndex)
        || (valueIndex < value.length && match(patternIndex, valueIndex + 1));
    } else if (token === "?") {
      result = valueIndex < value.length && match(patternIndex + 1, valueIndex + 1);
    } else if (token === "[") {
      const end = pattern.indexOf("]", patternIndex + 1);
      if (end < 0 || valueIndex >= value.length) result = false;
      else {
        let body = pattern.slice(patternIndex + 1, end);
        const negated = body.startsWith("!") || body.startsWith("^");
        if (negated) body = body.slice(1);
        let included = body.includes(value[valueIndex]);
        for (let index = 1; index < body.length - 1; index += 1) {
          if (body[index] === "-") {
            included ||= value[valueIndex] >= body[index - 1]
              && value[valueIndex] <= body[index + 1];
          }
        }
        result = (negated ? !included : included) && match(end + 1, valueIndex + 1);
      }
    } else {
      result = valueIndex < value.length && token === value[valueIndex]
        && match(patternIndex + 1, valueIndex + 1);
    }
    memo.set(key, result);
    return result;
  }
  return match(0, 0);
}

function broadlyAuthorizesNetcat(command) {
  if (command === "ALL") return true;
  const words = command.split(/\s+/);
  const executableIndex = words.findIndex((value) => value.startsWith("/"));
  if (executableIndex < 0) return false;
  const executable = words[executableIndex];
  if (/[*?[\]]/.test(executable) && globMatches(executable, "/usr/bin/nc")) return true;
  if (executable !== "/usr/bin/nc") return false;
  const argumentsText = words.slice(executableIndex + 1).join(" ");
  return argumentsText === "" || /[*?[\]]/.test(argumentsText);
}

function deniesCommand(entry, command) {
  if (!entry.negated || !entry.allowsRoot) return false;
  if (entry.command === "ALL" || entry.command === command) return true;
  return /[*?[\]]/.test(entry.command) && globMatches(entry.command, command);
}

function safeError(result) {
  const detail = String(result?.error?.message || result?.stderr || result?.stdout || "")
    .replace(/[\r\n]+/g, " ").trim().slice(0, 240);
  return detail || "sudo could not list effective permissions non-interactively";
}

function unique(values) {
  return [...new Set(values)];
}

export function parseSudoListing(text, expectedCommands) {
  const expected = unique(expectedCommands);
  const expectedSet = new Set(expected);
  const found = entries(text);
  const secure = (entry) => entry.runAsRoot && entry.nopasswd && entry.noexec && entry.nosetenv;
  const netcat = found.filter((entry) => entry.command.includes("/usr/bin/nc"));
  const active = expected.filter((command) => netcat.some(
    (entry) => entry.command === command && !entry.negated && secure(entry))
      && !found.some((entry) => deniesCommand(entry, command)));
  const missing = expected.filter((command) => !active.includes(command));
  const extraEntries = netcat.filter((entry) => !entry.negated && entry.allowsRoot && entry.nopasswd
    && !expectedSet.has(entry.command));
  const broad = found.filter((entry) => !entry.negated && entry.allowsRoot && entry.nopasswd
    && broadlyAuthorizesNetcat(entry.command))
    .map((entry) => entry.command).filter((value, index, values) => values.indexOf(value) === index)
    .sort();
  const extra = unique(extraEntries.map((entry) => entry.command)).sort();
  const misconfigured = expected.flatMap((command) => netcat
    .filter((entry) => entry.command === command && !entry.negated && !secure(entry))
    .map((entry) => ({ command, runAsRoot: entry.runAsRoot, nopasswd: entry.nopasswd,
      noexec: entry.noexec, nosetenv: entry.nosetenv })));
  return {
    expected, active, missing, extra, broad,
    extraDetails: extra.map((command) => {
      const matching = extraEntries.filter((entry) => entry.command === command);
      return { command,
        rootOnly: matching.length > 0 && matching.every((entry) => entry.runAsRoot),
        nopasswd: matching.length > 0 && matching.every((entry) => entry.nopasswd),
        noexec: matching.length > 0 && matching.every((entry) => entry.noexec),
        nosetenv: matching.length > 0 && matching.every((entry) => entry.nosetenv) };
    }),
    misconfigured,
    exact: missing.length === 0 && extra.length === 0
      && broad.length === 0 && misconfigured.length === 0,
  };
}

export function auditSudoAuthorization(expectedCommands, runtime = {}) {
  const spawnSync = runtime.spawnSync || nodeSpawnSync;
  const result = spawnSync("/usr/bin/sudo", ["-n", "-ll"], {
    encoding: "utf8", timeout: runtime.sudoTimeoutMs || 3000,
    maxBuffer: 256 * 1024,
    env: READ_ONLY_ENVIRONMENT,
  });
  if (result?.error || result?.status !== 0) {
    return {
      queried: true, available: false, exitStatus: result?.status ?? null,
      error: safeError(result), expected: unique(expectedCommands), active: [],
      missing: unique(expectedCommands), extra: [], broad: [], extraDetails: [],
      misconfigured: [], exact: false,
    };
  }
  return {
    queried: true, available: true, exitStatus: 0, error: null,
    ...parseSudoListing(String(result.stdout || "") + String(result.stderr || ""),
      expectedCommands),
  };
}
