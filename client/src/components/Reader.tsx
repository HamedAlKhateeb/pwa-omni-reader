/**
 * Design reminder — «مرسم التصفّح»: reader view is a calm paper surface.
 * Controls are compact and direct; typography changes save to local storage.
 */
import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, Check, ExternalLink, FileDown, FileText, Highlighter, ImageOff, Maximize, Minimize, Moon, Printer, Quote, Settings2, Sparkles, Volume2, X } from "lucide-react";
import type { Article, Highlight, Note, ReaderSettings } from "@/lib/types";
import { cleanHtml, highlightedHtml, isBrokenArticleContent, makeId } from "@/lib/article";
import { nextReaderControlsHidden } from "@/lib/readerControls";
import { renderLatexInHtml } from "@/lib/latex";

type SelectionMode = "highlight" | "note" | null;

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
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [noteText, setNoteText] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechRunRef = useRef(0);
  const speechIndexRef = useRef(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const lastScrollTop = useRef(0);
  const readerHighlights = useMemo(() => highlights.filter((item) => item.articleId === article.id), [highlights, article.id]);
  const readerNotes = useMemo(() => notes.filter((item) => item.articleId === article.id), [notes, article.id]);
  const normalizedContent = useMemo(() => cleanHtml(article.content, article.url), [article.content, article.url]);
  const html = useMemo(() => renderLatexInHtml(highlightedHtml(normalizedContent, readerHighlights, article.url)), [normalizedContent, article.url, readerHighlights]);
  const speechText = useMemo(() => new DOMParser().parseFromString(article.content || "", "text/html").body.textContent?.replace(/\s+/g, " ").trim() || "", [article.content]);
  const speechLanguage = /[\u0600-\u06ff]/.test(speechText) || settings.isRtl ? "ar-SA" : "en-US";
  const contentUnavailable = !article.content || isBrokenArticleContent(article.content);
  useEffect(() => { if (normalizedContent && normalizedContent !== article.content && !isBrokenArticleContent(normalizedContent)) onUpdateArticle({ content: normalizedContent }); }, [article.content, normalizedContent, onUpdateArticle]);
  useEffect(() => {
    const node = shellRef.current;
    if (!node || !article.progress) return;
    const frame = requestAnimationFrame(() => {
      const maximum = node.scrollHeight - node.clientHeight;
      if (maximum > 0) { node.scrollTop = maximum * Math.min(100, Math.max(0, article.progress)) / 100; lastScrollTop.current = node.scrollTop; }
    });
    return () => cancelAnimationFrame(frame);
  }, [article.id, normalizedContent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { if (noteOpen) setNoteOpen(false); else onClose(); } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose, noteOpen]);

  useEffect(() => {
    const loadVoices = () => setSpeechVoices(window.speechSynthesis?.getVoices() || []);
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    return () => { speechRunRef.current += 1; window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices); window.speechSynthesis?.cancel(); if (speechErrorTimerRef.current) clearTimeout(speechErrorTimerRef.current); };
  }, []);

  const saveProgress = () => {
    const node = shellRef.current;
    if (!node) return;
    const maximum = node.scrollHeight - node.clientHeight;
    const progress = maximum > 0 ? Math.min(100, Math.round((node.scrollTop / maximum) * 100)) : 100;
    if (Math.abs(progress - article.progress) >= 3 || progress >= 100) onUpdateArticle({ progress, isRead: progress >= 80 || article.isRead });
  };
  const handleReaderScroll = () => {
    const currentTop = shellRef.current?.scrollTop || 0;
    setControlsHidden((wasHidden) => nextReaderControlsHidden(lastScrollTop.current, currentTop, wasHidden));
    lastScrollTop.current = currentTop;
    saveProgress();
  };
  const readSelection = () => window.getSelection()?.toString().trim() || "";
  const captureSelection = () => {
    const current = readSelection();
    if (!current || !selectionMode) return;
    setSelection(current);
    if (selectionMode === "highlight") {
      if (!readerHighlights.some((item) => item.quote === current)) onAddHighlight({ id: makeId("highlight"), articleId: article.id, quote: current, createdAt: Date.now() });
      setSelection("");
      setSelectionMode(null);
      window.getSelection()?.removeAllRanges();
      return;
    }
    setNoteText("");
    setNoteOpen(true);
    setSelectionMode(null);
    window.getSelection()?.removeAllRanges();
  };
  const handleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const mark = (event.target as HTMLElement).closest("mark.reader-highlight");
    const id = mark?.getAttribute("data-highlight-id");
    if (!id) return;
    event.preventDefault(); event.stopPropagation();
    onRemoveHighlight(id); setSelection(""); setSelectionMode(null); window.getSelection()?.removeAllRanges();
  };
  const toggleHighlightMode = () => {
    setSelection("");
    setSelectionMode((mode) => mode === "highlight" ? null : "highlight");
    window.getSelection()?.removeAllRanges();
  };
  const toggleNoteMode = () => {
    setSelection("");
    setSelectionMode((mode) => mode === "note" ? null : "note");
    window.getSelection()?.removeAllRanges();
  };
  const saveNote = () => {
    const quote = selection || readSelection();
    if (!noteText.trim()) return;
    onAddNote({ id: makeId("note"), articleId: article.id, url: article.url, quote, content: noteText.trim(), isRtl: settings.isRtl, createdAt: Date.now(), updatedAt: Date.now() });
    setNoteOpen(false); setSelection(""); setSelectionMode(null); window.getSelection()?.removeAllRanges();
  };
  const showSpeechError = (message: string) => {
    if (speechErrorTimerRef.current) clearTimeout(speechErrorTimerRef.current);
    setSpeechError(message);
    speechErrorTimerRef.current = setTimeout(() => { setSpeechError(""); speechErrorTimerRef.current = null; }, 2000);
  };
  const toggleSpeech = () => {
    const synthesis = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synthesis) { showSpeechError("هذا المتصفح لا يدعم النطق الصوتي."); return; }
    if (speaking || synthesis.speaking || synthesis.pending) { speechRunRef.current += 1; speechIndexRef.current = 0; synthesis.cancel(); setSpeaking(false); return; }
    setSpeechError("");
    if (speechErrorTimerRef.current) { clearTimeout(speechErrorTimerRef.current); speechErrorTimerRef.current = null; }
    if (!speechText) return;
    const chunks = speechText.match(/[^.!?؟؛\n]+[.!?؟؛]?/g)?.flatMap((chunk) => chunk.trim().length > 220 ? (chunk.trim().match(/.{1,220}(?:\s|$)/g) || [chunk.trim()]) : [chunk.trim()]).filter(Boolean) || [speechText];
    const run = speechRunRef.current + 1;
    speechRunRef.current = run;
    speechIndexRef.current = 0;
    const currentVoices = synthesis.getVoices();
    if (currentVoices.length) setSpeechVoices(currentVoices);
    const availableVoices = currentVoices.length ? currentVoices : speechVoices;
    const voice = speechLanguage.startsWith("ar") ? availableVoices.find((item) => /^ar(?:-|$)/i.test(item.lang)) : availableVoices.find((item) => /^en(?:-|$)/i.test(item.lang));
    if (speechLanguage.startsWith("ar") && !voice) { showSpeechError("لا يوجد صوت عربي مفعّل على هذا الجهاز. فعّل صوتًا عربيًا من إعدادات تحويل النص إلى كلام ثم أعد المحاولة."); return; }
    const speakNext = () => {
      if (speechRunRef.current !== run) return;
      const text = chunks[speechIndexRef.current++];
      if (!text) { setSpeaking(false); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      else utterance.lang = speechLanguage;
      utterance.rate = settings.isRtl ? 0.94 : 1;
      utterance.onend = speakNext;
      utterance.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") { setSpeaking(false); showSpeechError(`تعذر تشغيل الصوت ${speechLanguage.startsWith("ar") ? "العربي" : "المحدد"}. تأكد من تفعيل محرك تحويل النص إلى كلام في الجهاز.`); } };
      synthesis.resume();
      synthesis.speak(utterance);
    };
    setSpeaking(true);
    speakNext();
  };
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) { await document.getElementById("reader-view")?.requestFullscreen?.(); setFullscreen(true); }
    else { await document.exitFullscreen(); setFullscreen(false); }
  };
  const toggleDirection = () => {
    const nextIsRtl = !settings.isRtl;
    const nextAlign = settings.textAlign === "justify" ? "justify" : nextIsRtl ? "right" : "left";
    onSaveSettings({ ...settings, isRtl: nextIsRtl, textAlign: nextAlign });
  };
  const exportHtml = () => {
    const blob = new Blob([`<!doctype html><html lang="${settings.isRtl ? "ar" : "en"}" dir="${settings.isRtl ? "rtl" : "ltr"}"><meta charset="utf-8"><title>${article.title}</title><body><h1>${article.title}</h1>${html}</body></html>`], { type: "text/html" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${article.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 56) || "article"}.html`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className={`reader-view reader-theme-${settings.theme} reader-direction-${settings.isRtl ? "rtl" : "ltr"}`} id="reader-view" dir={settings.isRtl ? "rtl" : "ltr"}>
    <aside className={`reader-rail ${controlsHidden ? "reader-controls-hidden" : ""}`} aria-label="أدوات القارئ">
      <button className="rail-button" onClick={onClose} title="العودة للمكتبة"><ArrowRight size={19} /></button><span className="rail-line" />
      <button className={showSettings ? "rail-button active" : "rail-button"} onClick={() => setShowSettings((value) => !value)} title="إعدادات القراءة"><Settings2 size={19} /></button>
      <button className={selectionMode === "highlight" ? "rail-button active" : "rail-button"} onClick={toggleHighlightMode} title={selectionMode === "highlight" ? "إلغاء وضع التمييز" : "ابدأ تحديد نص للتمييز"} aria-pressed={selectionMode === "highlight"}><Highlighter size={19} /></button>
      <button className={selectionMode === "note" ? "rail-button active" : "rail-button"} onClick={toggleNoteMode} title={selectionMode === "note" ? "إلغاء وضع الملاحظة" : "ابدأ تحديد نص للتعليق"} aria-pressed={selectionMode === "note"}><Quote size={19} /></button>
      <button className={speaking ? "rail-button speech-toggle active" : "rail-button speech-toggle"} onClick={toggleSpeech} title={speaking ? "إيقاف الاستماع" : "استمع للنص"} aria-pressed={speaking}><Volume2 size={19} /></button>
      <button className={!settings.showImages ? "rail-button image-toggle active" : "rail-button image-toggle"} onClick={() => onSaveSettings({ ...settings, showImages: !settings.showImages })} title={settings.showImages ? "إخفاء الصور" : "إظهار الصور"} aria-pressed={!settings.showImages}><ImageOff size={19} /></button>
      <button className={fullscreen ? "rail-button active" : "rail-button"} onClick={toggleFullscreen} title="ملء الشاشة">{fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}</button>
      <button className="rail-button" onClick={() => window.print()} title="طباعة"><Printer size={19} /></button><button className="rail-button" onClick={exportHtml} title="حفظ كـ HTML"><FileDown size={19} /></button>
    </aside>
    <main className="reader-scroll" ref={shellRef} onScroll={handleReaderScroll} onMouseUp={captureSelection} onTouchEnd={() => requestAnimationFrame(captureSelection)}>
      <article className={`reader-paper ${settings.fontFamily}`} style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, wordSpacing: `${settings.wordSpacing}px`, textAlign: settings.textAlign, maxWidth: `${settings.width}px` }}>
        <div className="reader-source"><Bookmark size={14} /> <span>{new URL(article.url).hostname.replace(/^www\./, "")}</span> <span>·</span> {article.readingTimeMinutes ? `${article.readingTimeMinutes} د قراءة` : "رابط محفوظ"} <a className="reader-source-link" href={article.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> فتح المصدر الأصلي</a></div>
        <h1>{article.title}</h1>
        <div className="reader-progress-row"><span>{article.progress}% مكتمل</span><div className="reader-progress"><i style={{ width: `${article.progress}%` }} /></div></div>
        {contentUnavailable ? <div className="reader-link-only"><FileText size={34} /><h2>لا يتوفر محتوى مقروء لهذا المقال</h2><p>أعاد الموقع قالبًا ديناميكيًا أو منع الاستخراج، لذلك لم يعرض «مسار» نصًا مكسورًا. افتح المصدر أو أعد المحاولة عند توفر الاتصال.</p><a href={article.url} target="_blank" rel="noreferrer">فتح المصدر</a></div> : <div className={settings.showImages ? "reader-content" : "reader-content hide-reader-images"} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: html }} />}

      </article>
    </main>
    <aside className="reader-insights"><div className="reader-orbit"><svg viewBox="0 0 36 36"><path className="orbit-back" d="M18 2.3a15.7 15.7 0 1 1 0 31.4 15.7 15.7 0 1 1 0-31.4"/><path className="orbit-front" strokeDasharray={`${article.progress}, 100`} d="M18 2.3a15.7 15.7 0 1 1 0 31.4 15.7 15.7 0 1 1 0-31.4"/></svg><strong>{article.progress}%</strong><span>تقدّم</span></div><div className="insight-group"><div className="insight-label">التمييزات</div>{readerHighlights.length ? readerHighlights.map((item) => <button className="highlight-item" key={item.id} onClick={() => onRemoveHighlight(item.id)}>{item.quote}<X size={12} /></button>) : <p>حدد نصًا للاحتفاظ بفكرته.</p>}</div><div className="insight-group"><div className="insight-label">الملاحظات</div>{readerNotes.length ? readerNotes.map((item) => <div className="reader-note" key={item.id}><span>{item.quote}</span><p>{item.content}</p></div>) : <p>لا توجد ملاحظات بعد.</p>}</div></aside>
    {speechError && <div className="speech-error" role="status">{speechError}</div>}
    {showSettings && <div className="reader-settings-panel"><button className="panel-close" onClick={() => setShowSettings(false)}><X size={17} /></button><div className="panel-heading"><Sparkles size={16} /> ضبط القراءة</div><label>حجم الخط <input type="range" min="14" max="32" value={settings.fontSize} onChange={(event) => onSaveSettings({ ...settings, fontSize: Number(event.target.value) })} /><b>{settings.fontSize}</b></label><label>تباعد السطور <input type="range" min="1.3" max="2.5" step="0.1" value={settings.lineHeight} onChange={(event) => onSaveSettings({ ...settings, lineHeight: Number(event.target.value) })} /><b>{settings.lineHeight.toFixed(1)}</b></label><label>تباعد الكلمات <input type="range" min="-1" max="8" step="0.5" value={settings.wordSpacing} onChange={(event) => onSaveSettings({ ...settings, wordSpacing: Number(event.target.value) })} /><b>{settings.wordSpacing}</b></label><label>عرض النص <input type="range" min="520" max="1220" step="20" value={settings.width} onChange={(event) => onSaveSettings({ ...settings, width: Number(event.target.value), widthCustomized: true })} /></label><div className="choice-row">{(["serif", "sans", "mono"] as const).map((font) => <button key={font} className={settings.fontFamily === font ? "choice active" : "choice"} onClick={() => onSaveSettings({ ...settings, fontFamily: font })}>{font === "serif" ? "تقليدي" : font === "sans" ? "واضح" : "ثابت"}</button>)}</div><div className="choice-row">{(["right", "justify", "left"] as const).map((align) => <button key={align} className={settings.textAlign === align ? "choice active" : "choice"} onClick={() => onSaveSettings({ ...settings, textAlign: align })}>{align === "right" ? "يمين" : align === "justify" ? "ضبط" : "يسار"}</button>)}</div><div className="choice-row">{(["light", "cream", "sepia", "dark"] as const).map((theme) => <button key={theme} aria-label={theme} className={`theme-dot ${theme} ${settings.theme === theme ? "active" : ""}`} onClick={() => onSaveSettings({ ...settings, theme })} />)}</div><button className={settings.isRtl ? "direction-button active" : "direction-button"} onClick={toggleDirection}>اتجاه القراءة: {settings.isRtl ? "من اليمين" : "من اليسار"}</button></div>}
    {noteOpen && <div className="modal-layer"><div className="note-dialog"><button className="icon-button dialog-close" onClick={() => setNoteOpen(false)}><X size={18} /></button><div className="dialog-kicker"><Quote size={15} /> ملاحظة مرتبطة بالنص</div><blockquote>{selection || readSelection()}</blockquote><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="اكتب الفكرة أو السؤال الذي تريد الرجوع إليه…" rows={5} autoFocus /><button className="ink-button" onClick={saveNote}><Check size={16} /> حفظ الملاحظة</button></div></div>}
  </div>;
}
