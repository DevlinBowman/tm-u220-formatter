import {
  ASB_DISABLE_COMMAND,
  LINE_CHECKPOINT_QUERY,
  isBasicAsbHeader,
} from "./status.mjs";

async function readByte(connection, deadline, label) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`${label} timed out`);
  return connection.read(remaining, label);
}

async function consumeAsbTail(connection, deadline, label) {
  for (let index = 1; index < 4; index += 1) {
    await readByte(connection, deadline, `${label} ASB frame`);
  }
}

export async function readFramedStatus(connection, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const byte = await readByte(connection, deadline, label);
    if (!isBasicAsbHeader(byte)) return byte;
    await consumeAsbTail(connection, deadline, label);
  }
}

export async function pendingUnexpectedByte(connection, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (connection.pendingBytes?.() > 0) {
    const byte = await readByte(connection, deadline, label);
    if (!isBasicAsbHeader(byte)) return byte;
    await consumeAsbTail(connection, deadline, label);
  }
  return null;
}

export function checkpointRequest(step) {
  const chunks = [];
  let cursor = 0;
  for (const offset of step.resetAfterByteOffsets) {
    chunks.push(step.payload.subarray(cursor, offset), ASB_DISABLE_COMMAND);
    cursor = offset;
  }
  chunks.push(step.payload.subarray(cursor), LINE_CHECKPOINT_QUERY);
  return Buffer.concat(chunks);
}
