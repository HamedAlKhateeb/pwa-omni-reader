import katex from "katex";

function render(expression: string, displayMode: boolean) {
  try {
    return katex.renderToString(expression.trim(), { displayMode, throwOnError: false, trust: false, strict: "ignore" });
  } catch {
    return displayMode ? `$$${expression}$$` : `$${expression}$`;
  }
}

export function renderLatexInHtml(html: string) {
  return html
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression: string) => render(expression, true))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_match, prefix: string, expression: string) => `${prefix}${render(expression, false)}`);
}
