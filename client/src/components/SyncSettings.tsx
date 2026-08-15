import { useEffect, useState } from "react";
import { Cloud, CloudOff, KeyRound, Loader2, LogIn, LogOut, RefreshCw, UserPlus } from "lucide-react";
import {
  fullSync,
  getLastSyncAt,
  getSession,
  recoverPassword,
  resolveConflict,
  signIn,
  signOut,
  signUp,
  type SyncConflict,
  type SyncSession,
} from "@/lib/supabaseSync";
import "../sync-settings.css";

type Props = { onSyncFinished: () => void };
type Mode = "signin" | "signup";

const keyName: Record<SyncConflict["key"], string> = {
  reader_bookmarks: "المكتبة",
  reader_folders: "المجلدات",
  reader_notes: "الملاحظات",
  reader_highlights: "التمييز",
  reader_custom_rules: "قواعد المواقع",
  reader_important_sites: "المواقع المهمة",
  reader_auto_open_sites: "مواقع الفتح التلقائي",
  reader_auto_open_enabled: "تفعيل الفتح التلقائي",
  reader_positions: "مواضع القراءة",
  reader_theme: "ثيم القارئ",
  reader_font_size: "حجم الخط",
  reader_font: "عائلة الخط",
  reader_align: "محاذاة النص",
  reader_width: "عرض النص",
  reader_line_height: "تباعد السطور",
  reader_word_spacing: "تباعد الكلمات",
  reader_rtl: "اتجاه القراءة",
  reader_show_photos: "إظهار الصور",
  library_bg_color: "خلفية المكتبة",
  reader_deleted: "سجل حذف المقالات",
};

export default function SyncSettings({ onSyncFinished }: Props) {
  const [session, setSession] = useState<SyncSession | null>(() => getSession());
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() => getLastSyncAt());
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const runSync = async () => {
    setBusy(true); setError(""); setMessage("");
    const result = await fullSync();
    setBusy(false);
    if (!result.ok) { setError(result.error || "تعذّرت المزامنة."); return; }
    setLastSyncAt(result.syncedAt || getLastSyncAt());
    setConflicts(result.conflicts);
    if (result.conflicts.length) { setMessage("تحتاج بعض الإعدادات إلى اختيار النسخة التي تريد الاحتفاظ بها."); return; }
    setMessage("اكتملت المزامنة مع حسابك. استُعيد محتوى المقالات المتزامنة من روابطها عند توفره."); onSyncFinished();
  };

  useEffect(() => {
    if (session && navigator.onLine) void runSync();
    // The initial pull is intentional and must run once when Settings opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) { setError("أدخل البريد الإلكتروني وكلمة المرور."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "signin") {
        const next = await signIn(email.trim(), password);
        setSession(next); setMessage("تم تسجيل الدخول. يبدأ تنزيل البيانات الآن.");
        await runSync();
      } else {
        const result = await signUp(email.trim(), password);
        setSession(result.session);
        if (result.confirmationRequired) setMessage("أُنشئ الحساب. راجع بريدك لتأكيده ثم سجّل الدخول.");
        else { setMessage("أُنشئ الحساب وتم تسجيل الدخول."); await runSync(); }
      }
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذّر إتمام العملية.");
    } finally {
      setBusy(false);
    }
  };

  const sendRecovery = async () => {
    if (!email.trim()) { setError("أدخل بريدك الإلكتروني أولًا لإرسال رابط الاستعادة."); return; }
    setBusy(true); setError("");
    try { await recoverPassword(email.trim()); setMessage("أُرسل رابط استعادة كلمة المرور إلى بريدك."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذّر إرسال الرابط."); }
    finally { setBusy(false); }
  };

  const chooseConflict = async (conflict: SyncConflict, side: "local" | "server") => {
    setBusy(true); setError("");
    try {
      await resolveConflict(conflict, side);
      const remaining = conflicts.filter((item) => item.key !== conflict.key);
      setConflicts(remaining);
      if (!remaining.length) { setMessage("حُفظ اختيارك واكتملت المزامنة."); onSyncFinished(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذّر حفظ اختيار التعارض."); }
    finally { setBusy(false); }
  };

  if (session) return <>
    <article className="settings-card sync-card account-card">
      <div><div className="account-title"><Cloud size={21} /><h2>المزامنة مع حسابك</h2></div><p>تم تسجيل الدخول باسم <bdi>{session.email}</bdi>. تبقى القراءة محفوظة محليًا، وتُزامن نسخة صغيرة من مكتبتك وإعداداتك مع الإضافة عند الطلب.</p>{lastSyncAt && <small className="sync-time">آخر مزامنة: {new Date(lastSyncAt).toLocaleString("ar-EG")}</small>}</div>
      <div className="account-actions"><button className="ink-button" onClick={() => void runSync()} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} مزامنة الآن</button><button className="quiet-button" onClick={() => void signOut().then(() => { setSession(null); setConflicts([]); setMessage("تم تسجيل الخروج من هذا الجهاز."); })} disabled={busy}><LogOut size={16} /> تسجيل الخروج</button></div>
    </article>
    {conflicts.length > 0 && <section className="conflicts-card"><h3>اختر النسخة التي تريد الاحتفاظ بها</h3><p>تغيرت هذه الإعدادات على هذا الجهاز وفي الإضافة منذ آخر مزامنة.</p>{conflicts.map((conflict) => <div className="conflict-row" key={conflict.key}><div><strong>{keyName[conflict.key]}</strong><small>تغيير الخادم: {new Date(conflict.serverUpdatedAt).toLocaleString("ar-EG")}</small></div><div><button className="quiet-button" disabled={busy} onClick={() => void chooseConflict(conflict, "local")}>احتفظ بنسخة هذا الجهاز</button><button className="ink-button" disabled={busy} onClick={() => void chooseConflict(conflict, "server")}>استخدم نسخة الحساب</button></div></div>)}</section>}
    {(message || error) && <p className={error ? "sync-feedback error" : "sync-feedback"}>{error || message}</p>}
  </>;

  return <article className="settings-card sync-card auth-card">
    <div className="auth-copy"><div className="account-title"><CloudOff size={21} /><h2>المزامنة مع الإضافة</h2></div><p>استخدم البريد وكلمة المرور نفسيهما لحساب Omni Reader. لا يستخدم التطبيق سوى مفتاح Supabase العام، ولا يرسل محتوى المقالات الكامل إلى المزامنة.</p></div>
    <form className="sync-form" onSubmit={authenticate}>
      <label>البريد الإلكتروني<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>كلمة المرور<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button className="ink-button" disabled={busy} type="submit">{busy ? <Loader2 className="spin" size={16} /> : mode === "signin" ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === "signin" ? "تسجيل الدخول" : "إنشاء الحساب"}</button>
      <div className="auth-links"><button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "إنشاء حساب جديد" : "لديك حساب؟ سجّل الدخول"}</button><button type="button" onClick={() => void sendRecovery()} disabled={busy}><KeyRound size={13} /> نسيت كلمة المرور</button></div>
      {(message || error) && <p className={error ? "sync-feedback error" : "sync-feedback"}>{error || message}</p>}
    </form>
  </article>;
}
