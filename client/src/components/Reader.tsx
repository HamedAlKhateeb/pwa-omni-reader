/**
 * Design reminder — «مرسم التصفّح»: reader view is a calm paper surface.
 * Controls are compact and direct; typography changes save to local storage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, Check, FileDown, FileText, Highlighter, ImageOff, Maximize, Minimize, Moon, Printer, Quote, Settings2, Sparkles, Volume2, X } from "lucide-react";
import type { Article, Highlight, Note, ReaderSettings } from "@/lib/types";
import { highlightedHtml, makeId } from "@/lib/article";

type Props = {
  article: Article; highlights: Highlight[]; notes: Note[]; settings: ReaderSettings;
  onClose: () => void; onSaveSettings: (settings: ReaderSettings) => void;
  onUpdateArticle: (patch: Partial<Article>) => void; onAddHighlight: (highlight: Highlight) => void;
  onRemoveHighlight: (id: string) => void; onAddNote: (note: Note) => void;
};

export default function Reader({ article, highlights, notes, settings, onClose, onSaveSettings, onUpdateArticle, onAddHighlight, onRemoveHighlight, onAddNote }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selection, setSelection] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const readerHighlights = useMemo(() => highlights.filter((item) => item.articleId === article.id), [highlights, article.id]);
  const readerNotes = useMemo(() => notes.filter((item) => item.articleId === article.id), [notes, article.id]);
  const html = useMemo(() => highlightedHtml(article.content, readerHighlights), [article.content, readerHighlights]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (noteOpen) setNoteOpen(false); else onClose(); } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose, noteOpen]);

  useEffect(() => () => speechSynthesis.cancel(), []);

  const saveProgress = () => {
    const node = shellRef.current;
    if (!node) return;
    const maximum = node.scrollHeight - node.clientHeight;
    const progress = maximum > 0 ? Math.min(100, Math.round((node.scrollTop / maximum) * 100)) : 100;
    if (Math.abs(progress - article.progress) >= 3 || progress >= 100) onUpdateArticle({ progress, isRead: progress >= 80 || article.isRead });
  };
  const readSelection = () => window.getSelection()?.toString().trim() || "";
  const addHighlight = () => {
    const quote = selection || readSelection();
    if (!quote) return;
    if (!readerHighlights.some((item) => item.quote === quote)) onAddHighlight({ id: makeId("highlight"), articleId: article.id, quote, createdAt: Date.now() });
    window.getSelection()?.removeAllRanges(); setSelection("");
  };
  const openNote = () => { const quote = selection || readSelection(); if (!quote) return; setNoteText(""); setNoteOpen(true); };
  const saveNote = () => {
    const quote = selection || readSelection();
    if (!noteText.trim()) return;
    onAddNote({ id: makeId("note"), articleId: article.id, url: article.url, quote, content: noteText.trim(), isRtl: settings.isRtl, createdAt: Date.now(), updatedAt: Date.now() });
    setNoteOpen(false); setSelection(""); window.getSelection()?.removeAllRanges();
  };
  const toggleSpeech = () => {
    if (speaking) { speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance((new DOMParser().parseFromString(article.content, "text/html").body.textContent || ""));
    utterance.lang = settings.isRtl ? "ar" : "en"; utterance.rate = 1; utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance); setSpeaking(true);
  };
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) { await document.getElementById("reader-view")?.requestFullscreen?.(); setFullscreen(true); }
    else { await document.exitFullscreen(); setFullscreen(false); }
  };
  const exportHtml = () => {
    const blob = new Blob([`<!doctype html><html lang="${settings.isRtl ? "ar" : "en"}" dir="${settings.isRtl ? "rtl" : "ltr"}"><meta charset="utf-8"><title>${article.title}</title><body><h1>${article.title}</h1>${html}</body></html>`], { type: "text/html" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${article.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 56) || "article"}.html`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className={`reader-view reader-theme-${settings.theme}`} id="reader-view" dir={settings.isRtl ? "rtl" : "ltr"}>
    <aside className="reader-rail" aria-label="أدوات القارئ">
      <button className="rail-button" onClick={onClose} title="العودة للمكتبة"><ArrowRight size={19} /></button><span className="rail-line" />
      <button className={showSettings ? "rail-button active" : "rail-button"} onClick={() => setShowSettings((value) => !value)} title="إعدادات القراءة"><Settings2 size={19} /></button>
      <button className="rail-button" onClick={addHighlight} title="تمييز النص المحدد"><Highlighter size={19} /></button>
      <button className="rail-button" onClick={openNote} title="إضافة ملاحظة إلى النص المحدد"><Quote size={19} /></button>
      <button className={speaking ? "rail-button active" : "rail-button"} onClick={toggleSpeech} title="استمع للنص"><Volume2 size={19} /></button>
      <button className="rail-button" onClick={() => onSaveSettings({ ...settings, showImages: !settings.showImages })} title="إظهار أو إخفاء الصور"><ImageOff size={19} /></button>
      <button className={fullscreen ? "rail-button active" : "rail-button"} onClick={toggleFullscreen} title="ملء الشاشة">{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>
      <button className="rail-button" onClick={() => window.print()} title="طباعة"><Printer size={19} /></button><button className="rail-button" onClick={exportHtml} title="حفظ كـ HTML"><FileDown size={19} /></button>
    </aside>
    <main className="reader-scroll" ref={shellRef} onScroll={saveProgress} onMouseUp={() => setSelection(readSelection())}>
      <article className={`reader-paper ${settings.fontFamily}`} style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, maxWidth: `${settings.width}px` }}>
        <div className="reader-source"><Bookmark size={14} /> {new URL(article.url).hostname.replace(/^www\./, "")} <span>·</span> {article.readingTimeMinutes ? `${article.readingTimeMinutes} د قراءة` : "رابط محفوظ"}</div>
        <h1>{article.title}</h1>
        <div className="reader-progress-row"><span>{article.progress}% مكتمل</span><div className="reader-progress"><i style={{ width: `${article.progress}%` }} /></div></div>
        {!article.content ? <div className="reader-link-only"><FileText size={34} /><h2>المحتوى غير مخبأ بعد</h2><p>هذا الرابط محفوظ محليًا، لكن الموقع لم يسمح باستخراج النص من المتصفح. افتحي المصدر أو استوردي المحتوى من نسخة Omni Reader.</p><a href={article.url} target="_blank" rel="noreferrer">فتح المصدر</a></div> : <div className={settings.showImages ? "reader-content" : "reader-content hide-reader-images"} dangerouslySetInnerHTML={{ __html: html }} />}
        {selection && <div className="selection-strip"><span>تم تحديد نص</span><button onClick={addHighlight}><Highlighter size={14} /> تمييز</button><button onClick={openNote}><Quote size={14} /> ملاحظة</button><button onClick={() => { window.getSelection()?.removeAllRanges(); setSelection(""); }}><X size={14} /></button></div>}
      </article>
    </main>
    <aside className="reader-insights"><div className="reader-orbit"><svg viewBox="0 0 36 36"><path className="orbit-back" d="M18 2.3a15.7 15.7 0 1 1 0 31.4 15.7 15.7 0 1 1 0-31.4"/><path className="orbit-front" strokeDasharray={`${article.progress}, 100`} d="M18 2.3a15.7 15.7 0 1 1 0 31.4 15.7 15.7 0 1 1 0-31.4"/></svg><strong>{article.progress}%</strong><span>تقدّم</span></div><div className="insight-group"><div className="insight-label">التمييزات</div>{readerHighlights.length ? readerHighlights.map((item) => <button className="highlight-item" key={item.id} onClick={() => onRemoveHighlight(item.id)}>{item.quote}<X size={12} /></button>) : <p>حددي نصًا للاحتفاظ بفكرته.</p>}</div><div className="insight-group"><div className="insight-label">الملاحظات</div>{readerNotes.length ? readerNotes.map((item) => <div className="reader-note" key={item.id}><span>{item.quote}</span><p>{item.content}</p></div>) : <p>لا توجد ملاحظات بعد.</p>}</div></aside>
    {showSettings && <div className="reader-settings-panel"><button className="panel-close" onClick={() => setShowSettings(false)}><X size={17} /></button><div className="panel-heading"><Sparkles size={16} /> ضبط القراءة</div><label>حجم الخط <input type="range" min="14" max="32" value={settings.fontSize} onChange={(event) => onSaveSettings({ ...settings, fontSize: Number(event.target.value) })} /><b>{settings.fontSize}</b></label><label>تباعد السطور <input type="range" min="1.3" max="2.5" step="0.1" value={settings.lineHeight} onChange={(event) => onSaveSettings({ ...settings, lineHeight: Number(event.target.value) })} /><b>{settings.lineHeight.toFixed(1)}</b></label><label>عرض النص <input type="range" min="520" max="980" step="20" value={settings.width} onChange={(event) => onSaveSettings({ ...settings, width: Number(event.target.value) })} /></label><div className="choice-row">{(["serif", "sans", "mono"] as const).map((font) => <button key={font} className={settings.fontFamily === font ? "choice active" : "choice"} onClick={() => onSaveSettings({ ...settings, fontFamily: font })}>{font === "serif" ? "تقليدي" : font === "sans" ? "واضح" : "ثابت"}</button>)}</div><div className="choice-row">{(["light", "cream", "sepia", "dark"] as const).map((theme) => <button key={theme} aria-label={theme} className={`theme-dot ${theme} ${settings.theme === theme ? "active" : ""}`} onClick={() => onSaveSettings({ ...settings, theme })} />)}</div><button className={settings.isRtl ? "direction-button active" : "direction-button"} onClick={() => onSaveSettings({ ...settings, isRtl: !settings.isRtl })}>اتجاه القراءة: {settings.isRtl ? "من اليمين" : "من اليسار"}</button></div>}
    {noteOpen && <div className="modal-layer"><div className="note-dialog"><button className="icon-button dialog-close" onClick={() => setNoteOpen(false)}><X size={18} /></button><div className="dialog-kicker"><Quote size={15} /> ملاحظة مرتبطة بالنص</div><blockquote>{selection || readSelection()}</blockquote><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="اكتبي الفكرة أو السؤال الذي تريدين الرجوع إليه…" rows={5} autoFocus /><button className="ink-button" onClick={saveNote}><Check size={16} /> حفظ الملاحظة</button></div></div>}
  </div>;
}
