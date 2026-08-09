// Checks the configured printer through the exact privileged-source command installed by setup.
// It reuses the live connection boundary and sends only the identity/readiness query allowlist.
import { openNetcat } from "../live_session/netcat.mjs";
import { probeDevice } from "./device_probe.mjs";

export function checkAuthorizedDevice(manifest, runtime = {}) {
  const route = manifest?.routes?.find((value) => value.name === "live");
  if (!route || !Array.isArray(route.sourcePorts) || route.sourcePorts.length === 0) {
    throw new Error("the installed policy has no authorized live device-check route");
  }
  const endpoint = { host: route.host, port: route.destinationPort };
  return probeDevice(endpoint, { checkReadiness: true }, {
    openConnection: () => openNetcat({ host: route.host, port: route.destinationPort },
      route.sourcePorts[0], runtime.netcat),
  });
}
