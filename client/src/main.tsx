/** Design reminder — «مرسم التصفّح»: offline capability begins at the application shell. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./masar-refinement.css";
import App from "./App";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
