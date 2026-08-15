/** «مسار» remains local-first; the browser extension is no longer required for extraction. */
import { Toaster } from "@/components/ui/sonner";
import PasswordReset from "@/components/PasswordReset";
import Home from "@/pages/Home";

export default function App() {
  const isPasswordReset = new URLSearchParams(window.location.search).has("reset-password");
  return <>{isPasswordReset ? <PasswordReset /> : <Home />}<Toaster position="bottom-left" richColors closeButton /></>;
}
