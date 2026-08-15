import { describe, expect, it } from "vitest";
import { renderLatexInHtml } from "./latex";

describe("عرض LaTeX", () => {
  it("يعرض المعادلة المضمّنة بأمان", () => {
    expect(renderLatexInHtml("المعادلة $x^2 + y^2$")).toContain("katex");
  });

  it("يعرض المعادلة المنفصلة", () => {
    expect(renderLatexInHtml("$$\\frac{a}{b}$$")).toContain("katex-display");
  });
});
