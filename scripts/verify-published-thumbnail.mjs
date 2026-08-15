import { writeFileSync } from "node:fs";

const pageUrl = "https://hamedalkhateeb.github.io/pwa-omni-reader/";
const thumbnail = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663217306960/JXtIdhPscLLVagHz.jpg";
const targets = await fetch("http://127.0.0.1:9229/json").then((response) => response.json());
const ws = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
await new Promise((resolve) => { ws.onopen = resolve; });
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  ws.send(JSON.stringify({ id, method, params }));
});
await command("Page.enable");
await command("Runtime.enable");
await command("Page.navigate", { url: pageUrl });
await new Promise((resolve) => setTimeout(resolve, 2000));
const addArticle = `new Promise((resolve,reject)=>{const open=indexedDB.open('omni-reader-local',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('articles','readwrite');tx.objectStore('articles').put({id:'published-thumbnail-proof',url:'https://example.com/published-proof',title:'تحقق الصورة المصغرة المنشورة',excerpt:'تأكيد بصري لظهور الصورة المصغرة في بطاقة المكتبة على GitHub Pages.',content:'<p>اختبار.</p>',image:'${thumbnail}',tags:['اختبار'],savedAt:Date.now(),updatedAt:Date.now(),progress:0,isRead:false,isArchived:false,isFavorite:false,readingTimeMinutes:2,sourceStatus:'cached'});tx.oncomplete=()=>resolve('saved');tx.onerror=()=>reject(tx.error)}})`;
await command("Runtime.evaluate", { expression: `(${addArticle}).then(()=>location.reload())`, awaitPromise: true });
await new Promise((resolve) => setTimeout(resolve, 2200));
const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync("/home/ubuntu/webdev-static-assets/masar-pages-thumbnail-proof.png", Buffer.from(screenshot.data, "base64"));
const body = await command("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
if (!body.result.value.includes("تحقق الصورة المصغرة المنشورة")) throw new Error("Published thumbnail card did not render");
ws.close();
