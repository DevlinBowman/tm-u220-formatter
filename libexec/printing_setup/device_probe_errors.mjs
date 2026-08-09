// Classifies bounded TCP failures without conflating oversized replies with reachability.
// Protocol-specific wrong-device and framing failures remain owned by the probe orchestrator.
export function classifyTransportProbeError(error) {
  if (error?.code === "EMSGSIZE") {
    return { outcome: "malformed_response", code: "DEVICE_RESPONSE_TOO_LARGE" };
  }
  if (error?.code === "ETIMEDOUT" || /timed out/i.test(String(error?.message || ""))) {
    return { outcome: "unreachable", code: "DEVICE_CONNECTION_TIMEOUT" };
  }
  if (error?.code === "ECONNREFUSED") {
    return { outcome: "unreachable", code: "DEVICE_CONNECTION_REFUSED" };
  }
  if (["EHOSTUNREACH", "ENETUNREACH"].includes(error?.code)) {
    return { outcome: "unreachable", code: "DEVICE_UNREACHABLE" };
  }
  if (["ECONNRESET", "ECONNABORTED", "EPIPE", "ENETDOWN", "EHOSTDOWN",
    "EADDRNOTAVAIL", "ENOBUFS"].includes(error?.code)) {
    return { outcome: "unreachable", code: "DEVICE_NETWORK_ERROR" };
  }
  return { outcome: "probe_error", code: "DEVICE_PROBE_ERROR" };
}
