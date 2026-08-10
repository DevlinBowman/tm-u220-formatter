// Owns canonical read, optimistic save, and serialization for one fixed image profile.
// Lua remains the only parser while the store queues writes and rejects stale browser state.
import path from "node:path";
import { inspectProfile } from "./compiler.mjs";
import { readFixedProfile, writeFixedProfile } from "./fixed_file.mjs";

function profileFailure(result, status = 422) {
  const first = result?.diagnostics?.[0];
  return Object.assign(new Error(first?.message || "image profile is invalid"), {
    status, diagnostics: result?.diagnostics || [],
  });
}

export class ImageProfileStore {
  constructor(profilePath, root) {
    this.path = profilePath;
    this.root = root;
    this.queue = Promise.resolve();
  }

  async inspect(source) {
    return inspectProfile(source, { root: this.root });
  }

  async read() {
    const current = readFixedProfile(this.path);
    const inspected = await this.inspect(current.source);
    if (!inspected.valid) throw profileFailure(inspected, 500);
    return {
      profile_name: path.basename(this.path),
      source: inspected.profile_source,
      revision: current.revision,
      image_profile: inspected.image_profile,
      schema: inspected.schema,
    };
  }

  save(request) {
    const operation = this.queue.then(() => this.saveNow(request));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async saveNow(request) {
    if (!request || typeof request.source !== "string"
        || typeof request.revision !== "string") {
      throw Object.assign(new Error("profile save requires source and revision"), { status: 400 });
    }
    const current = readFixedProfile(this.path);
    if (request.revision !== current.revision) {
      throw Object.assign(new Error(
        "image profile changed on disk; reload before saving"), { status: 409 });
    }
    const inspected = await this.inspect(request.source);
    if (!inspected.valid) throw profileFailure(inspected);
    writeFixedProfile(this.path, inspected.profile_source, current.stat);
    return this.read();
  }
}
