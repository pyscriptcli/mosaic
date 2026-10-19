// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeWordHtml } from "./wordDocument";

describe("sanitizeWordHtml", () => {
  it("preserves document structure and removes executable or remote content", () => {
    const html = '<h1 onclick="alert(1)">Payment</h1><script>alert(2)</script><p><a href="javascript:alert(3)">Terms</a></p><iframe src="https://evil.example"></iframe><img src="https://evil.example/image.png" onerror="alert(4)"><table><tr><td colspan="2">Amount</td></tr></table>';
    const safe = sanitizeWordHtml(html);

    expect(safe).toContain("<h1>Payment</h1>");
    expect(safe).toContain('<td colspan="2">Amount</td>');
    expect(safe).not.toContain("script");
    expect(safe).not.toContain("iframe");
    expect(safe).not.toContain("onclick");
    expect(safe).not.toContain("onerror");
    expect(safe).not.toContain("javascript:");
    expect(safe).not.toContain("evil.example");
  });

  it("keeps embedded image data and safe document formatting", () => {
    const safe = sanitizeWordHtml('<p><strong>Bold</strong><em> emphasis</em></p><img src="data:image/png;base64,AAAA" alt="Seal">');

    expect(safe).toContain("<strong>Bold</strong>");
    expect(safe).toContain("<em> emphasis</em>");
    expect(safe).toContain('src="data:image/png;base64,AAAA"');
  });
});
