import {
  ASB_DISABLE_COMMAND,
  ERROR_STATUS_QUERY,
  OFFLINE_STATUS_QUERY,
  PAPER_STATUS_QUERY,
  PRINTER_STATUS_QUERY,
  decodeCheckpointStatus,
  decodeErrorStatus,
  decodeOfflineStatus,
  decodePrinterStatus,
  decodeRealtimePaperStatus,
} from "./status.mjs";
import {
  checkpointRequest,
  pendingUnexpectedByte,
  readFramedStatus,
} from "./framing.mjs";

export class LiveSessionError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.name = "LiveSessionError";
    this.code = code;
    Object.assign(this, fields);
  }
}

async function exchange(connection, request, timeoutMs, label) {
  if (await pendingUnexpectedByte(connection, timeoutMs, label) !== null) {
    throw new LiveSessionError("LIVE_UNEXPECTED_STATUS", "unexpected printer status bytes");
  }
  await connection.write(request);
  return readFramedStatus(connection, timeoutMs, label);
}

function deviceFailure(statuses) {
  const causes = [];
  if (!statuses.printer.online) causes.push("printer is offline");
  if (statuses.printer.waitingForRecovery) causes.push("printer is waiting for recovery");
  if (statuses.offline.coverOpen) causes.push("cover is open");
  if (statuses.offline.stoppedForPaperEnd || statuses.paper.paperEnd) {
    causes.push("paper is out");
  }
  if (statuses.offline.error || statuses.error.recoverable
      || statuses.error.cutter || statuses.error.unrecoverable
      || statuses.error.autoRecoverable) {
    causes.push("printer reports an error");
  }
  return causes;
}

export async function preflight(connection, timeoutMs, emit = () => {}) {
  await connection.write(ASB_DISABLE_COMMAND);
  const printer = decodePrinterStatus(await exchange(
    connection, PRINTER_STATUS_QUERY, timeoutMs, "online status"));
  emit({ type: "connected", printer });
  const offline = decodeOfflineStatus(await exchange(
    connection, OFFLINE_STATUS_QUERY, timeoutMs, "offline status"));
  const error = decodeErrorStatus(await exchange(
    connection, ERROR_STATUS_QUERY, timeoutMs, "error status"));
  const paper = decodeRealtimePaperStatus(await exchange(
    connection, PAPER_STATUS_QUERY, timeoutMs, "paper status"));
  const statuses = { printer, offline, error, paper };
  const causes = deviceFailure(statuses);
  if (causes.length > 0) {
    throw new LiveSessionError("LIVE_PRINTER_NOT_READY", causes.join("; "), {
      stage: "preflight",
    });
  }
  emit({ type: paper.nearEnd ? "near_end" : "ready", statuses });
  return statuses;
}

export async function runSteps(plan, connection, cancellation, emit = () => {}) {
  let confirmedSteps = 0;
  let confirmedLines = 0;
  let confirmedBytes = 0;
  let releasedBytes = 0;
  if (cancellation.requested) {
    return { status: "cancelled", confirmedSteps, confirmedLines,
      confirmedBytes, releasedBytes };
  }

  for (const step of plan.steps) {
    if (cancellation.requested && confirmedSteps < plan.steps.length) {
      return { status: "cancelled", confirmedSteps, confirmedLines,
        confirmedBytes, releasedBytes };
    }
    if (await pendingUnexpectedByte(
      connection, plan.timeoutMs, `checkpoint ${step.index}`) !== null) {
      throw new LiveSessionError(
        "LIVE_UNEXPECTED_STATUS",
        `unexpected printer status before checkpoint ${step.index}`,
        {
          stage: "checkpoint",
          step: step.index,
          confirmedSteps,
          confirmedLines,
          confirmedBytes,
          releasedBytes,
          outcomeUnknown: false,
        },
      );
    }
    emit({ type: "in_flight", step, confirmedSteps, confirmedLines });
    let byte;
    try {
      releasedBytes += step.payload.length;
      await connection.write(checkpointRequest(step));
      byte = await readFramedStatus(
        connection, plan.timeoutMs, `checkpoint ${step.index}`);
    } catch (error) {
      throw new LiveSessionError(
        "LIVE_CHECKPOINT_FAILED",
        `checkpoint ${step.index} failed: ${error.message}`,
        {
          stage: "checkpoint",
          step: step.index,
          confirmedSteps,
          confirmedLines,
          confirmedBytes,
          releasedBytes,
          outcomeUnknown: true,
        },
      );
    }

    let paper;
    try {
      paper = decodeCheckpointStatus(byte);
    } catch (error) {
      throw new LiveSessionError("LIVE_CHECKPOINT_INVALID", error.message, {
        stage: "checkpoint",
        step: step.index,
        confirmedSteps,
        confirmedLines,
        confirmedBytes,
        releasedBytes,
        outcomeUnknown: true,
      });
    }
    if (await pendingUnexpectedByte(
      connection, plan.timeoutMs, `checkpoint ${step.index}`) !== null) {
      throw new LiveSessionError(
        "LIVE_UNEXPECTED_STATUS",
        `unexpected status followed checkpoint ${step.index}`,
        {
          stage: "checkpoint",
          step: step.index,
          confirmedSteps,
          confirmedLines,
          confirmedBytes,
          releasedBytes,
          outcomeUnknown: true,
        },
      );
    }

    confirmedSteps += 1;
    confirmedBytes += step.payload.length;
    if (step.previewLineIndex) confirmedLines += 1;
    emit({ type: "confirmed", step, paper, confirmedSteps, confirmedLines });
    if (paper.paperEnd) {
      throw new LiveSessionError("LIVE_PAPER_OUT", "paper ran out", {
        stage: "checkpoint",
        step: step.index,
        confirmedSteps,
        confirmedLines,
        confirmedBytes,
        releasedBytes,
      });
    }
    if (paper.nearEnd) emit({ type: "near_end", paper, step });
    if (cancellation.requested && confirmedSteps < plan.steps.length) {
      return { status: "cancelled", confirmedSteps, confirmedLines,
        confirmedBytes, releasedBytes };
    }
  }
  return { status: "completed", confirmedSteps, confirmedLines,
    confirmedBytes, releasedBytes };
}

export async function runSession(plan, connection, cancellation, emit = () => {}) {
  await preflight(connection, Math.min(plan.timeoutMs, 5000), emit);
  return runSteps(plan, connection, cancellation, emit);
}
