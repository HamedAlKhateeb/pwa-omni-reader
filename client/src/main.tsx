/** Design reminder — «مرسم التصفّح»: offline capability begins at the application shell. */
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { createRoot } from "react-dom/client";
import { trpc } from "@/lib/trpc";
import "./index.css";
import "./masar-refinement.css";
import App from "./App";

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })] });
createRoot(document.getElementById("root")!).render(<StrictMode><trpc.Provider client={trpcClient} queryClient={queryClient}><QueryClientProvider client={queryClient}><App /></QueryClientProvider></trpc.Provider></StrictMode>);
