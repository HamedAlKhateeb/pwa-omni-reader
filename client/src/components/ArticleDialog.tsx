/** The mobile and desktop web app both use the server extractor; no extension is required. */
import { useState } from "react";
import { FileText, Link2, Loader2, X } from "lucide-react";
import type { Article } from "@/lib/types";
import { createArticle, extractArticleFromHtml } from "@/lib/article";
import { trpc } from "@/lib/trpc";
import { extractWithSupabase, isGitHubPagesBuild } from "@/lib/supabaseExtractor";

type Props = { open: boolean; onClose: () => void; onSave: (article: Article, notice?: string) => Promise<void> };

export default function ArticleDialog({ open, onClose, onSave }: Props) {
  const [url, setUrl] = useState(""); const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [error, setError] = useState("");
  const extraction = trpc.article.extract.useMutation();
  if (!open) return null;
  const submit = async () => {
    setError(""); let normalized: URL;
    try { normalized = new URL(url); } catch { setError("أدخل رابطًا كاملًا يبدأ بـ https:// أو http://"); return; }
    try {
      if (content.trim()) {
        const article = content.includes("<") ? extractArticleFromHtml(content, normalized.href) : createArticle(normalized.href, title, `<p>${content.replace(/</g, "&lt;")}</p>`);
        if (title.trim()) article.title = title.trim(); await onSave(article);
      } else {
        const extracted = isGitHubPagesBuild ? await extractWithSupabase(normalized.href) : await extraction.mutateAsync({ url: normalized.href });
        const article = createArticle(extracted.url, title.trim() || extracted.title, extracted.content);
        article.excerpt = extracted.excerpt; article.image = extracted.image; article.readingTimeMinutes = extracted.readingTimeMinutes;
        await onSave(article, "استُخرج المقال وحُفظ على جهازك.");
      }
      setUrl(""); setTitle(""); setContent(""); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذّر استخراج المقال."); }
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="capture-dialog"><button className="icon-button dialog-close" onClick={onClose} aria-label="إغلاق"><X size={19} /></button><div className="dialog-kicker"><Link2 size={15} /> حفظ للقراءة لاحقًا</div><h2 id="capture-title">أضف مقالًا إلى مكتبتك</h2><p className="dialog-copy">أدخل الرابط فقط. يستخرج تطبيق الويب المقال من خدمته الآمنة، ثم يبقي النسخة المحفوظة متاحة بلا اتصال.</p><label>رابط المقال<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" inputMode="url" autoFocus /></label><label>عنوان اختياري<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="يُستخرج تلقائيًا من المقال" /></label><label className="content-label">المحتوى اختياريًا<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="الصق محتوى المقال هنا لحفظه وقراءته بلا اتصال…" rows={6} /></label>{error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button className="quiet-button" onClick={onClose}>إلغاء</button><button className="ink-button" onClick={submit} disabled={extraction.isPending}>{extraction.isPending ? <><Loader2 size={16} className="spin" /> جارٍ الاستخراج</> : <><FileText size={16} /> استخراج وحفظ</>}</button></div></div></div>;
}
