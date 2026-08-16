import { describe, expect, it } from "vitest";
import { renderLatexInHtml } from "./latex";

describe("عرض LaTeX", () => {
  it("يعرض المعادلة المضمّنة بأمان", () => {
    expect(renderLatexInHtml("المعادلة $x^2 + y^2$")).toContain("katex");
  });

  it("يعرض المعادلة المنفصلة", () => {
    expect(renderLatexInHtml("$$\\frac{a}{b}$$")).toContain("katex-display");
  });

  it("يعرض صيغة \\( ... \\) داخل HTML", () => {
    const html = renderLatexInHtml("<p>القيمة \\(x^2\\) هنا</p>");
    expect(html).toContain("katex");
    expect(html).not.toContain("\\\\(");
  });

  it("يعرض صيغة \\[ ... \\] كمعادلة منفصلة", () => {
    expect(renderLatexInHtml("\\[\\frac{a}{b}\\]")).toContain("katex-display");
  });

  it("يعرض align* متعدد الأسطر داخل \\( ... \\)", () => {
    const html = renderLatexInHtml("\\(\\begin{align*}\n\\cos(t)\\&amp;=\\frac{e^{it}+e^{-it}}{2} \\\\\n\\sin(t)\\&amp;=\\frac{e^{it}-e^{-it}}{2i}.\n\\end{align*}\\)");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("\\\\begin{align*");
  });
});
