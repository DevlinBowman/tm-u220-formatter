// Interprets the four Epson real-time status replies without performing device I/O.
// Identity verification remains independent from this optional readiness assessment.
export function summarizeReadiness(statuses) {
  const reasons = [];
  if (!statuses.printer.online) reasons.push("offline");
  if (statuses.printer.waitingForRecovery) reasons.push("waiting_for_recovery");
  if (statuses.offline.coverOpen) reasons.push("cover_open");
  if (statuses.offline.stoppedForPaperEnd || statuses.paper.paperEnd) reasons.push("paper_out");
  if (statuses.offline.error || statuses.error.recoverable || statuses.error.cutter
      || statuses.error.unrecoverable || statuses.error.autoRecoverable) {
    reasons.push("printer_error");
  }
  return { checked: true, ready: reasons.length === 0, reasons, statuses };
}
