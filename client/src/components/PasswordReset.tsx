import { useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { completePasswordRecoveryFromUrl, updatePassword } from "@/lib/supabaseSync";

function appHomeUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export default function PasswordReset() {
  const handledRecovery = useRef(false);
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (handledRecovery.current) return;
    handledRecovery.current = true;
    if (!completePasswordRecoveryFromUrl()) setError("رابط الاستعادة غير مكتمل أو انتهت صلاحيته. أرسل رابطًا جديدًا من صفحة تسجيل الدخول.");
    else setReady(true);
  }, []);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 6) { setError("اكتب كلمة مرور من 6 أحرف على الأقل."); return; }
    if (newPassword !== confirmation) { setError("تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة."); return; }
    setBusy(true); setError("");
    try {
      await updatePassword(newPassword);
      setMessage("تم تغيير كلمة المرور بنجاح. يمكنك العودة الآن وتسجيل الدخول بكلمة المرور الجديدة.");
      setNewPassword(""); setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذّر تغيير كلمة المرور.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="password-reset-page" dir="rtl">
    <section className="password-reset-card">
      <div className="password-reset-icon"><KeyRound size={25} /></div>
      <p className="eyebrow">أمان الحساب</p>
      <h1>عيّن كلمة مرور جديدة</h1>
      <p>اكتب كلمة مرور جديدة لحساب Omni Reader. لن يُغادر هذا التدفق تطبيق «مسار».</p>
      {ready && !message && <form onSubmit={savePassword} className="password-reset-form">
        <label>كلمة المرور الجديدة<input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button className="ink-button" disabled={busy} type="submit">{busy ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} حفظ كلمة المرور الجديدة</button>
      </form>}
      {message && <p className="password-reset-feedback success"><CheckCircle2 size={16} /> {message}</p>}
      {error && <p className="password-reset-feedback error">{error}</p>}
      <a className="quiet-button password-reset-back" href={appHomeUrl()}>العودة إلى مسار</a>
    </section>
  </main>;
}
