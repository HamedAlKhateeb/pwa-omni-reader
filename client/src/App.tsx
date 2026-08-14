/** Design reminder — «مرسم التصفّح»: the application is a quiet local workspace, not a landing page. */
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";

export default function App() {
  return <><Home /><Toaster position="bottom-left" richColors closeButton /></>;
}
