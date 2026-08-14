/** Design reminder — «مرسم التصفّح»: local reading is primary; the extension bridge is an optional companion. */
import { Toaster } from "@/components/ui/sonner";
import ExtensionSyncAgent from "@/components/ExtensionSyncAgent";
import Home from "@/pages/Home";

export default function App() { return <><ExtensionSyncAgent /><Home /><Toaster position="bottom-left" richColors closeButton /></>; }
