export const PRINTER_STATUS_QUERY = Buffer.from([0x10, 0x04, 0x01]);
export const OFFLINE_STATUS_QUERY = Buffer.from([0x10, 0x04, 0x02]);
export const ERROR_STATUS_QUERY = Buffer.from([0x10, 0x04, 0x03]);
export const PAPER_STATUS_QUERY = Buffer.from([0x10, 0x04, 0x04]);
export const LINE_CHECKPOINT_QUERY = Buffer.from([0x1d, 0x72, 0x01]);
export const ASB_DISABLE_COMMAND = Buffer.from([0x1d, 0x61, 0x00]);

function oneByte(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${label} must be one byte`);
  }
  return value;
}

function realtime(value, label) {
  const byte = oneByte(value, label);
  if ((byte & 0x93) !== 0x12) {
    throw new Error(`${label} has invalid fixed bits: 0x${byte.toString(16).padStart(2, "0")}`);
  }
  return byte;
}

export function isBasicAsbHeader(value) {
  const byte = oneByte(value, "ASB status");
  return (byte & 0x93) === 0x10;
}

export function decodePrinterStatus(value) {
  const byte = realtime(value, "printer status");
  return {
    byte,
    online: (byte & 0x08) === 0,
    waitingForRecovery: (byte & 0x20) !== 0,
    feedButtonActive: (byte & 0x40) !== 0,
  };
}

export function decodeOfflineStatus(value) {
  const byte = realtime(value, "offline status");
  return {
    byte,
    coverOpen: (byte & 0x04) !== 0,
    feedButtonActive: (byte & 0x08) !== 0,
    stoppedForPaperEnd: (byte & 0x20) !== 0,
    error: (byte & 0x40) !== 0,
  };
}

export function decodeErrorStatus(value) {
  const byte = realtime(value, "error status");
  return {
    byte,
    recoverable: (byte & 0x04) !== 0,
    cutter: (byte & 0x08) !== 0,
    unrecoverable: (byte & 0x20) !== 0,
    autoRecoverable: (byte & 0x40) !== 0,
  };
}

export function decodeRealtimePaperStatus(value) {
  const byte = realtime(value, "real-time paper status");
  return {
    byte,
    nearEnd: (byte & 0x0c) === 0x0c,
    paperEnd: (byte & 0x60) === 0x60,
  };
}

export function decodeCheckpointStatus(value) {
  const byte = oneByte(value, "checkpoint status");
  if (![0x00, 0x03, 0x0c, 0x0f].includes(byte)) {
    throw new Error(`checkpoint status is invalid: 0x${byte.toString(16).padStart(2, "0")}`);
  }
  const nearEndBits = byte & 0x03;
  const paperEndBits = byte & 0x0c;
  return {
    byte,
    nearEnd: nearEndBits === 3,
    paperEnd: paperEndBits === 12,
  };
}
