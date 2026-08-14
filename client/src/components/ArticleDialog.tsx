/**
 * Design reminder — «مرسم التصفّح»: a restrained, paper-like capture form.
 * Capturing always works locally; network extraction is a best-effort enhancement.
 */
import { useState } from "react";
import { FileText, Link2, Loader2, X } from "lucide-react";
import type { Article } from "@/lib/types";
import { createArticle, extractArticleFromHtml } from "@/lib/article";

type Props = { open: boolean; onClose: () => void; onSave: (article: Article, notice?: string) => Promise<void> };

export default function ArticleDialog({ open, onClose, onSave }: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;

  const submit = async () => {
    setError("");
    let normalized: URL;
    try { normalized = new URL(url); } catch { setError("أدخلي رابطًا كاملًا يبدأ بـ https:// أو http://"); return; }
    setIsSaving(true);
    try {
      if (content.trim()) {
        await onSave(createArticle(normalized.href, title, content));
      } else {
        try {
          const response = await fetch(normalized.href, { mode: "cors" });
          if (!response.ok) throw new Error("فشل الوصول إلى المصدر");
          const html = await response.text();
          const article = extractArticleFromHtml(html, normalized.href);
          if (title.trim()) article.title = title.trim();
          await onSave(article);
        } catch {
          await onSave(createArticle(normalized.href, title), "حُفظ الرابط محليًا. لم يسمح الموقع باستخراج المحتوى من المتصفح، لذا أضيفي النص يدويًا أو استورديه من نسخة Omni Reader.");
        }
      }
      setUrl(""); setTitle(""); setContent(""); onClose();
    } finally { setIsSaving(false); }
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="capture-title">
    <div className="capture-dialog">
      <button className="icon-button dialog-close" onClick={onClose} aria-label="إغلاق"><X size={19} /></button>
      <div className="dialog-kicker"><Link2 size={15} /> حفظ للقراءة لاحقًا</div>
      <h2 id="capture-title">أضيفي مقالًا إلى مكتبتك</h2>
      <p className="dialog-copy">سيبقى الرابط والمحتوى المحفوظ متاحين على هذا الجهاز، حتى عند انقطاع الاتصال.</p>
      <label>رابط المقال<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" inputMode="url" autoFocus /></label>
      <label>عنوان اختياري<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="يُستخرج تلقائيًا عندما يسمح المصدر" /></label>
      <label className="content-label">النص أو HTML اختياريًا<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="الصقي محتوى المقال هنا لحفظه وقراءته بلا اتصال…" rows={6} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions"><button className="quiet-button" onClick={onClose}>إلغاء</button><button className="ink-button" onClick={submit} disabled={isSaving}>{isSaving ? <><Loader2 size={16} className="spin" /> جارٍ الحفظ</> : <><FileText size={16} /> حفظ في المكتبة</>}</button></div>
    </div>
  </div>;
}
