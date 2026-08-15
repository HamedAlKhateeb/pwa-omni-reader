import { writeFileSync } from "node:fs";

const debugPort = process.env.CHROME_DEBUG_PORT || "9222";
const baseUrl = "https://hamedalkhateeb.github.io/pwa-omni-reader/";
const articleUrl = "https://en.wikipedia.org/wiki/Readability";
const shareUrl = `${baseUrl}?share=1&share_url=${encodeURIComponent(articleUrl)}&share_title=Readability`;
const screenshotPath = "/home/ubuntu/webdev-static-assets/masar-github-pages-mobile-e2e.png";

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("لم تُعثر صفحة Chromium قابلة للاختبار.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++requestId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await cdp("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36" });
await cdp("Page.enable");
await cdp("Page.navigate", { url: shareUrl });
await delay(5000);

const sharedForm = await evaluate(`(() => ({
  url: document.querySelector('input[placeholder="https://example.com/article"]')?.value || "",
  title: document.querySelector('input[placeholder="يُستخرج تلقائيًا من المقال"]')?.value || "",
  saveVisible: Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('استخراج وحفظ'))
}))()`);

if (sharedForm.url !== articleUrl || sharedForm.title !== "Readability" || !sharedForm.saveVisible) {
  throw new Error(`تعذر استقبال رابط المشاركة في viewport الهاتف: ${JSON.stringify(sharedForm)}`);
}

await evaluate(`(() => Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('استخراج وحفظ'))?.click())()`);
await delay(12000);

const library = await evaluate(`(() => ({
  saved: document.body.innerText.includes('Readability'),
  count: Array.from(document.querySelectorAll('article')).length,
  pageText: document.body.innerText.slice(0, 1800)
}))()`);
if (!library.saved || library.count < 1) throw new Error(`تعذر حفظ المقال في المكتبة: ${JSON.stringify(library)}`);

const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
writeFileSync("/home/ubuntu/chrome-web-app/docs/github-pages-mobile-e2e.md", `# تحقق الهاتف من GitHub Pages\n\n- **Viewport:** 375×812، Chrome Android محاكى.\n- **المشاركة:** فُتحت صفحة Pages مع \`share_url\` و\`share_title\`، ثم ظهر نموذج الحفظ مع الرابط والعنوان تلقائيًا.\n- **الاستخراج والحفظ:** نُقر «استخراج وحفظ»، ثم ظهر مقال Readability في المكتبة (` + `${library.count}` + ` مقال).\n- **اللقطة:** التقطت داخليًا خارج حزمة النشر في \`${screenshotPath}\`.\n`);
socket.close();
console.log(JSON.stringify({ sharedForm, library }, null, 2));
