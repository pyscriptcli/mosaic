import { describe, expect, it } from "vitest";
import { readTextFile, readTextSections } from "./textDocument";

describe("readTextSections", () => {
  it("preserves paragraph order, punctuation, case, and line breaks", () => {
    expect(readTextSections("Payment IS due!\r\nwithin 30 days.\r\n\r\nNew clause.")).toEqual([
      { number: "1", heading: "Paragraph 1", text: "Payment IS due!\nwithin 30 days.", comments: [] },
      { number: "2", heading: "Paragraph 2", text: "New clause.", comments: [] },
    ]);
  });

  it("rejects empty and over-limit text with recovery guidance", () => {
    expect(() => readTextSections("  \n")).toThrow("text input is empty");
    expect(() => readTextSections("x".repeat(500_001))).toThrow("500,000 characters");
  });

  it("reads UTF-8 text files and rejects invalid byte sequences", async () => {
    const valid = new File(["Clause café."], "lease.txt");
    expect(await readTextFile(valid)).toBe("Clause café.");
    const invalid = new File([new Uint8Array([0xc3, 0x28])], "broken.txt");
    await expect(readTextFile(invalid)).rejects.toThrow("broken.txt is not valid UTF-8 text");
  });
});
