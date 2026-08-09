// Captures the invoking POSIX account through the canonical real/effective UID checks.
// It compares name and numeric UID independently so status cannot mistake another user's grants.
export function auditInvokingAccount(installedIdentity, captureCurrentIdentity, runtime = {}) {
  const installedName = installedIdentity?.name ?? null;
  const installedUid = installedIdentity?.uid ?? null;
  try {
    if (typeof captureCurrentIdentity !== "function") {
      throw new Error("canonical account capture is unavailable");
    }
    const identity = captureCurrentIdentity(runtime);
    const nameMatchesInstalled = installedIdentity ? identity.name === installedName : null;
    const uidMatchesInstalled = installedIdentity ? identity.uid === installedUid : null;
    return {
      checked: true, available: true, name: identity.name, uid: identity.uid,
      installedName, installedUid, nameMatchesInstalled, uidMatchesInstalled,
      matchesInstalled: installedIdentity
        ? nameMatchesInstalled && uidMatchesInstalled : null,
      error: null,
    };
  } catch (error) {
    return {
      checked: true, available: false, name: null, uid: null,
      installedName, installedUid,
      nameMatchesInstalled: installedIdentity ? false : null,
      uidMatchesInstalled: installedIdentity ? false : null,
      matchesInstalled: installedIdentity ? false : null,
      error: String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 240),
    };
  }
}
