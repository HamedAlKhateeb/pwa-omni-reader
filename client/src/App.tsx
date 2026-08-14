/** «مسار» remains local-first; the browser extension is no longer required for extraction. */
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";

export default function App() { return <><Home /><Toaster position="bottom-left" richColors closeButton /></>; }
