// Normalizes the device-verification state embedded in the installed manifest.
// Authorization-first setups record why device contact must wait for the privileged route.
import { freezePolicy, validateTimestamp } from "./validation.mjs";

const OFFLINE_ERRORS = new Set([
  "timeout", "connection_refused", "unreachable", "network_error",
]);

export function normalizeProbeEvidence(value) {
  if (!value || typeof value !== "object") throw new Error("probe evidence is required");
  const mode = value.mode ?? value.probe_mode;
  const recordedAt = validateTimestamp(value.recordedAt ?? value.probe_recorded_at);
  if (mode === "verified") {
    const model = value.model ?? value.probe_model;
    const modelId = Number(value.modelId ?? value.probe_model_id);
    if (model !== "TM-U220" || modelId !== 13) {
      throw new Error("verified probe evidence requires exact TM-U220 name and model ID 13");
    }
    return freezePolicy({ mode, recordedAt, model, modelId });
  }
  if (mode === "offline") {
    const error = value.error ?? value.probe_error;
    if (!OFFLINE_ERRORS.has(error)) throw new Error("offline probe evidence has an unknown error");
    const acceptance = value.acceptance ?? value.probe_acceptance;
    if (acceptance !== "allow_offline") {
      throw new Error("offline probe evidence requires explicit allow_offline acceptance");
    }
    return freezePolicy({ mode, recordedAt, error, acceptance });
  }
  if (mode === "deferred") {
    const reason = value.reason ?? value.probe_reason;
    if (reason !== "privileged_source_required") {
      throw new Error("deferred device evidence requires privileged_source_required");
    }
    return freezePolicy({ mode, recordedAt, reason });
  }
  throw new Error("probe mode must be verified, deferred, or explicitly accepted offline");
}
