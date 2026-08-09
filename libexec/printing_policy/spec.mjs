// Declares the immutable installed paths, metadata, and transport specifications for printing.
// Machine choices live in the manifest; security-sensitive route shapes remain product policy.

function frozenRoute(value) {
  return Object.freeze({
    ...value,
    sourcePorts: Object.freeze([...value.sourcePorts]),
  });
}

export const SCHEMA_VERSION = 1;
export const MANIFEST_HEADER = `!tm-u220 printing-policy ${SCHEMA_VERSION}`;
export const MANIFEST_DESTINATION = "/private/etc/tm-u220/printing.conf";
export const PROFILE_DESTINATION = "/private/etc/tm-u220/printer.u220p";
export const SUDOERS_DESTINATION = "/private/etc/sudoers.d/tm-u220-live-raw";
export const LEGACY_TOMBSTONE_DESTINATION = "/private/etc/sudoers.d/tm-u220-lpd";
export const PACKAGE_ID = "org.tm-u220.printing-policy";
export const PACKAGE_NAME = "TM-U220 Printing Policy.pkg";

export const LIVE_ROUTE_SPEC = frozenRoute({
  name: "live",
  destinationPort: 9100,
  timeoutSeconds: 30,
  sourcePorts: [1023, 1021, 1020, 1019, 1018, 1017, 1016, 1015],
});

export const LPD_ROUTE_SPEC = frozenRoute({
  name: "lpd",
  queue: "lp",
  destinationPort: 515,
  timeoutSeconds: 5,
  sourcePorts: [731, 730, 729, 728, 727, 726, 725, 724, 723, 722, 721],
});

export const FIXED_ROUTE_SPECS = Object.freeze([LIVE_ROUTE_SPEC, LPD_ROUTE_SPEC]);

export const artifactPolicy = Object.freeze({
  manifest: Object.freeze({
    path: MANIFEST_DESTINATION, uid: 0, gid: 0, mode: 0o444, maxBytes: 4096,
  }),
  profile: Object.freeze({
    path: PROFILE_DESTINATION, uid: 0, gid: 0, mode: 0o444, maxBytes: 4096,
  }),
  sudoers: Object.freeze({
    path: SUDOERS_DESTINATION, uid: 0, gid: 0, mode: 0o440, maxBytes: 8192,
  }),
  legacyTombstone: Object.freeze({
    path: LEGACY_TOMBSTONE_DESTINATION, uid: 0, gid: 0, mode: 0o440, maxBytes: 1024,
  }),
});

export const printingPolicy = Object.freeze({
  schema: Object.freeze({ name: "tm-u220-printing-policy", version: SCHEMA_VERSION,
    header: MANIFEST_HEADER }),
  artifacts: artifactPolicy,
  package: Object.freeze({ identifier: PACKAGE_ID, name: PACKAGE_NAME, scripts: false }),
  routes: FIXED_ROUTE_SPECS,
});
