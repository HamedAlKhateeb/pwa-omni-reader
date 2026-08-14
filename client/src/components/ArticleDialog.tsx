/**
 * Design reminder — «مرسم التصفّح»: capture starts from a URL and remains local.
 * The browser uses direct fetch first, then delegates to the companion extension.
 */
import { useState } from "react";
import { FileText, Link2, Loader2, X } from "lucide-react";
import type { Article } from "@/lib/types";
import { createArticle, extractArticleFromHtml } from "@/lib/article";
import { fetchHtmlThroughExtension } from "@/lib/extensionBridge";

type Props = { open: boolean; onClose: () => void; onSave: (article: Article, notice?: string) => Promise<void> };

export default function ArticleDialog({ open, onClose, onSave }: Props) {
  const [url, setUrl] = useState(""); const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [isSaving, setIsSaving] = useState(false); const [error, setError] = useState("");
  if (!open) return null;
  const submit = async () => {
    setError(""); let normalized: URL;
    try { normalized = new URL(url); } catch { setError("أدخل رابطًا كاملًا يبدأ بـ https:// أو http://"); return; }
    setIsSaving(true);
    try {
      if (content.trim()) {
        const article = content.includes("<") ? extractArticleFromHtml(content, normalized.href) : createArticle(normalized.href, title, `<p>${content.replace(/</g, "&lt;")}</p>`);
        if (title.trim()) article.title = title.trim(); await onSave(article);
      } else {
        let html = ""; let usedExtension = false;
        try { const response = await fetch(normalized.href, { mode: "cors", credentials: "omit" }); if (!response.ok) throw new Error("فشل الوصول إلى المصدر"); html = await response.text(); }
        catch { html = await fetchHtmlThroughExtension(normalized.href); usedExtension = true; }
        const article = extractArticleFromHtml(html, normalized.href); if (title.trim()) article.title = title.trim();
        await onSave(article, usedExtension ? "استُخرج المقال عبر إضافة Omni Reader وحُفظ محليًا." : "استُخرج المقال بـ Readability وحُفظ محليًا.");
      }
      setUrl(""); setTitle(""); setContent(""); onClose();
    } catch (reason) { setError(reason instanceof Error ? "لم يستطع المتصفح استخراج المقال. تأكد من تثبيت نسخة الإضافة المحدثة أو الصق المحتوى يدويًا." : "تعذّر استخراج المقال."); }
    finally { setIsSaving(false); }
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="capture-dialog"><button className="icon-button dialog-close" onClick={onClose} aria-label="إغلاق"><X size={19} /></button><div className="dialog-kicker"><Link2 size={15} /> حفظ للقراءة لاحقًا</div><h2 id="capture-title">أضف مقالًا إلى مكتبتك</h2><p className="dialog-copy">أدخل الرابط فقط: سيستخدم التطبيق Readability، ويستعين بالإضافة عند منع CORS. يبقى المقال المستخرج متاحًا محليًا بلا اتصال.</p><label>رابط المقال<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" inputMode="url" autoFocus /></label><label>عنوان اختياري<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="يُستخرج تلقائيًا من المقال" /></label><label className="content-label">المحتوى اختياريًا<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="الصق محتوى المقال هنا لحفظه وقراءته بلا اتصال…" rows={6} /></label>{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button className="quiet-button" onClick={onClose}>إلغاء</button><button className="ink-button" onClick={submit} disabled={isSaving}>{isSaving ? <><Loader2 size={16} className="spin" /> جارٍ الاستخراج</> : <><FileText size={16} /> استخراج وحفظ</>}</button></div></div></div>;
}
