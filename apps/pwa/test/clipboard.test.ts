import { describe, expect, it } from "vitest";
import { base64ToBlob } from "../src/clipboard";

describe("base64ToBlob", () => {
  it("returns a Blob with the given type and the decoded byte length", async () => {
    const blob = base64ToBlob("AAEC", "image/png");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([0, 1, 2]);
  });
});
