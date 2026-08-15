import katex from "katex";

function render(expression: string, displayMode: boolean) {
  try {
    return katex.renderToString(expression.trim(), { displayMode, throwOnError: false, trust: false, strict: "ignore" });
  } catch {
    return displayMode ? `$$${expression}$$` : `$${expression}$`;
  }
}

function renderLatexInText(text: string) {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression: string) => render(expression, true))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_match, prefix: string, expression: string) => `${prefix}${render(expression, false)}`);
}

export function renderLatexInHtml(html: string) {
  const tags: string[] = [];
  const protectedText = html.replace(/<[^>]*>/g, (tag) => {
    const token = `\uE000${tags.length}\uE001`;
    tags.push(tag);
    return token;
  });
  return renderLatexInText(protectedText).replace(/\uE000(\d+)\uE001/g, (_match, index: string) => tags[Number(index)] || "");
}
