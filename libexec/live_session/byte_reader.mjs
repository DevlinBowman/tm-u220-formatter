export class ByteReader {
  constructor(stream, options = {}) {
    this.buffer = [];
    this.waiter = null;
    this.ended = false;
    this.endError = null;
    stream.on("data", (chunk) => this.push(chunk));
    if (options.endOnStream !== false) {
      stream.on("end", () => this.end(new Error("printer response ended")));
    }
    stream.on("error", (error) => this.end(error));
  }

  push(chunk) {
    for (const byte of chunk) this.buffer.push(byte);
    this.flush();
  }

  end(error) {
    this.ended = true;
    this.endError = error;
    this.flush();
  }

  flush() {
    if (!this.waiter) return;
    if (this.buffer.length > 0) {
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.resolve(this.buffer.shift());
    } else if (this.ended) {
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(this.endError || new Error("printer response ended"));
    }
  }

  read(timeoutMs, label = "printer response") {
    if (this.waiter) return Promise.reject(new Error("a printer read is already pending"));
    if (this.buffer.length > 0) return Promise.resolve(this.buffer.shift());
    if (this.ended) return Promise.reject(this.endError || new Error("printer response ended"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiter) return;
        this.waiter = null;
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }

  pendingBytes() {
    return this.buffer.length;
  }
}
