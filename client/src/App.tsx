/** «مسار» remains local-first; the browser extension is no longer required for extraction. */
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import PasswordReset from "@/components/PasswordReset";
import { isPasswordRecoveryRoute } from "@/lib/recoveryRoute";
import Home from "@/pages/Home";

export default function App() {
  const [locationState, setLocationState] = useState(() => ({ search: window.location.search, hash: window.location.hash }));
  useEffect(() => {
    const updateLocation = () => setLocationState({ search: window.location.search, hash: window.location.hash });
    addEventListener("hashchange", updateLocation);
    addEventListener("popstate", updateLocation);
    return () => { removeEventListener("hashchange", updateLocation); removeEventListener("popstate", updateLocation); };
  }, []);
  const isPasswordReset = isPasswordRecoveryRoute(locationState.search, locationState.hash);
  return <>{isPasswordReset ? <PasswordReset /> : <Home />}<Toaster position="bottom-left" richColors closeButton /></>;
}
