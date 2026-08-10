// Coalesces live profile previews into one worker so stale drafts cannot accumulate processes.
// A newer draft or disconnected request aborts current work before the latest preview begins.
function abortFailure(message = "profile preview was superseded") {
  return Object.assign(new Error(message), { name: "AbortError", status: 409 });
}

export function createPreviewQueue(compile) {
  if (typeof compile !== "function") throw new TypeError("preview compiler must be a function");
  let active = null;
  let pending = null;

  function detach(job) {
    job.signal?.removeEventListener("abort", job.cancel);
  }

  function rejectPending(job, error) {
    if (pending === job) pending = null;
    detach(job);
    job.reject(error);
  }

  function pump() {
    if (active || !pending) return;
    const job = pending;
    pending = null;
    active = job;
    job.controller = new AbortController();
    if (job.signal?.aborted) job.controller.abort();
    Promise.resolve().then(() => compile(job.source, {
      ...job.options, signal: job.controller.signal,
    })).then((value) => {
      if (job.controller.signal.aborted) job.reject(abortFailure());
      else job.resolve(value);
    }, (error) => job.reject(error)).finally(() => {
      detach(job);
      if (active === job) active = null;
      pump();
    });
  }

  function run(source, options, signal) {
    return new Promise((resolve, reject) => {
      const job = { source, options, signal, resolve, reject };
      job.cancel = () => {
        if (pending === job) rejectPending(job, abortFailure("profile preview was cancelled"));
        else if (active === job) job.controller.abort();
      };
      if (signal?.aborted) { reject(abortFailure("profile preview was cancelled")); return; }
      signal?.addEventListener("abort", job.cancel, { once: true });
      if (pending) rejectPending(pending, abortFailure());
      pending = job;
      if (active) active.controller.abort();
      pump();
    });
  }

  return { run };
}
