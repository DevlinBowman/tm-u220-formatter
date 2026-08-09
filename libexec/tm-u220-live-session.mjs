#!/usr/bin/env node
import fs from "node:fs";
import { loadPlan } from "./live_session/plan.mjs";
import {
  isAuthorizationFailure,
  openNetcat,
  shouldRotateSourcePort,
} from "./live_session/netcat.mjs";
import { LiveSessionError, preflight, runSteps } from "./live_session/session.mjs";
import { TerminalView, attachCancellation } from "./live_session/terminal.mjs";

function clean(value) {
  return encodeURIComponent(String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 300));
}

function writeResult(path, fields) {
  const values = fields.map((value) => clean(value));
  fs.writeFileSync(path, `${values.join("\t")}\n`, { encoding: "utf8", mode: 0o600 });
}

async function connect(plan, emit) {
  let lastError;
  for (const sourcePort of plan.sourcePorts) {
    emit({ type: "connecting", sourcePort });
    const connection = openNetcat(plan, sourcePort);
    try {
      await preflight(connection, Math.min(plan.timeoutMs, 5000), emit);
      return connection;
    } catch (error) {
      await connection.close();
      const failure = connection.failure(error);
      if (isAuthorizationFailure(failure)) {
        throw new LiveSessionError(
          "LIVE_AUTHORIZATION_MISSING",
          "live printing authorization is unavailable; run 220 setup-printing",
          { stage: "connect" },
        );
      }
      if (!shouldRotateSourcePort(connection, error)) {
        if (error instanceof LiveSessionError) throw error;
        throw new LiveSessionError("LIVE_CONNECTION_FAILED", failure.message, {
          stage: "connect",
        });
      }
      lastError = failure;
    }
  }
  throw new LiveSessionError(
    "LIVE_SOURCE_PORTS_BUSY",
    lastError?.message
      ? `no authorized source port could start the connection: ${lastError.message}`
      : "every authorized live source port is busy",
    { stage: "connect" },
  );
}

async function main(argv) {
  if (argv.length !== 2) {
    process.stderr.write("tm-u220 live session requires a plan and result path\n");
    return 2;
  }
  const [planPath, resultPath] = argv;
  let plan;
  try {
    plan = loadPlan(planPath);
  } catch (error) {
    process.stderr.write(`live plan rejected: ${error.message}\n`);
    writeResult(resultPath, ["error", "LIVE_PLAN_REJECTED", "plan", 0, 0, 0, 0,
      0, 0, error.message, 0]);
    return 2;
  }
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    const message = "run 220 without sudo; only the fixed printer connection is elevated";
    process.stderr.write(`${message}\n`);
    writeResult(resultPath, ["error", "LIVE_TOP_LEVEL_SUDO", "privilege", 0,
      0, 0, 0, 0, 0, message, 0]);
    return 2;
  }

  const view = new TerminalView({ plan, silent: plan.silent });
  const cancellation = attachCancellation({
    onRequest: () => view.handle({ type: "cancel_requested" }),
  });
  const emit = (event) => view.handle(event);
  let connection;
  try {
    connection = await connect(plan, emit);
    const sourcePort = connection.sourcePort;
    const result = await runSteps(plan, connection, cancellation.state, emit);
    await connection.close();
    connection = null;
    if (result.status === "cancelled") {
      view.finish("amber",
        `printer disconnected · print cancelled · ${result.confirmedLines}/${plan.lineCount} lines confirmed`);
      writeResult(resultPath, ["cancelled", sourcePort,
        result.confirmedSteps, result.confirmedLines, result.confirmedBytes,
        plan.payloadBytes]);
      return 130;
    }
    view.finish("green",
      `printer session complete · connection closed · ${result.confirmedLines}/${plan.lineCount} lines confirmed`);
    writeResult(resultPath, ["completed", sourcePort,
      result.confirmedSteps, result.confirmedLines, result.confirmedBytes,
      plan.payloadBytes]);
    return 0;
  } catch (error) {
    const sourcePort = connection?.sourcePort || 0;
    if (connection) await connection.close();
    connection = null;
    const code = error.code || "LIVE_SESSION_FAILED";
    const stage = error.stage || "session";
    const step = error.step || 0;
    const confirmedSteps = error.confirmedSteps || 0;
    const confirmedLines = error.confirmedLines || 0;
    const confirmedBytes = error.confirmedBytes || 0;
    const releasedBytes = error.releasedBytes || 0;
    const unknown = error.outcomeUnknown ? 1 : 0;
    const suffix = unknown
      ? ` · operation ${step} outcome unknown; later operations were not sent`
      : "";
    view.finish("red", `printer disconnected · ${error.message}${suffix}`);
    writeResult(resultPath, ["error", code, stage, step, confirmedSteps,
      confirmedLines, confirmedBytes, releasedBytes, unknown, error.message,
      sourcePort]);
    return 1;
  } finally {
    cancellation.cleanup();
    view.cleanup();
  }
}

process.exitCode = await main(process.argv.slice(2));
