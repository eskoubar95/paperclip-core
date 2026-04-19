import { Readable } from "node:stream";
import type { StorageService } from "../storage/types.js";

/** Minimal `StorageService` for route unit tests that do not exercise file uploads. */
export const testStorageService: StorageService = {
  provider: "local_disk",
  async putFile(input) {
    return {
      provider: "local_disk",
      objectKey: `${input.companyId}/test/object`,
      contentType: input.contentType,
      byteSize: input.body.length,
      sha256: "0".repeat(64),
      originalFilename: input.originalFilename,
    };
  },
  async getObject() {
    return { stream: Readable.from(Buffer.alloc(0)), contentLength: 0 };
  },
  async headObject() {
    return { exists: false };
  },
  async deleteObject() {
    // noop
  },
};
