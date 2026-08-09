// Binds post-install status to the exact reviewed bundle and package version.
// A receipt, healthy-looking subset, or matching file metadata alone is insufficient.

function mismatch(message) {
  throw new Error(`installation could not be verified: ${message}`);
}

export function verifyInstalledSetup(report, bundle, packageInfo) {
  if (!report?.healthy) {
    const codes = (report?.issues || []).map((value) => value.code).join(", ");
    mismatch(codes || "the canonical status audit did not report healthy");
  }
  if (report.packageReceipt.version !== packageInfo.version) {
    mismatch("the package receipt version differs from the reviewed package");
  }
  if (report.artifacts.manifest.sha256 !== bundle.artifacts.manifest.hash) {
    mismatch("the installed manifest differs from the reviewed manifest");
  }
  if (report.artifacts.profile.sha256 !== bundle.artifacts.profile.hash) {
    mismatch("the installed profile differs from the reviewed profile");
  }
  if (report.configuration?.account?.name !== bundle.identity.name
      || report.configuration?.account?.uid !== bundle.identity.uid) {
    mismatch("the installed account differs from the reviewed account");
  }
  if (report.configuration?.endpoint?.host !== bundle.manifest.host
      || report.configuration?.endpoint?.port !== 9100) {
    mismatch("the installed endpoint differs from the reviewed endpoint");
  }
  if (!report.authorization.exact) {
    mismatch("effective passwordless netcat commands are not the exact reviewed set");
  }
  return true;
}
