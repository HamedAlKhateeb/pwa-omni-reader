import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { extractArticleFromUrl } from "../articleExtractor";

const PUBLIC_WEB_ORIGINS = new Set([
  "https://hamedalkhateeb.github.io",
  "https://chromeapp-vfkdzams.manus.space",
  "http://localhost:5173",
]);
const recentExtractionRequests = new Map<string, number[]>();

function extractionCors(req: express.Request, res: express.Response) {
  const origin = req.header("origin");
  if (!origin || !PUBLIC_WEB_ORIGINS.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  return true;
}

function allowExtraction(clientId: string) {
  const now = Date.now();
  const cutoff = now - 10 * 60_000;
  const requests = (recentExtractionRequests.get(clientId) || []).filter((time) => time > cutoff);
  if (requests.length >= 15) return false;
  requests.push(now);
  recentExtractionRequests.set(clientId, requests);
  return true;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.options("/api/extract", (req, res) => {
    if (!extractionCors(req, res)) return res.status(403).end();
    return res.status(204).end();
  });
  app.post("/api/extract", async (req, res) => {
    if (!extractionCors(req, res)) return res.status(403).json({ error: "مصدر الطلب غير مسموح." });
    if (!allowExtraction(req.ip || "unknown")) return res.status(429).json({ error: "الطلبات كثيرة، حاول بعد بضع دقائق." });
    if (!req.body || typeof req.body.url !== "string" || req.body.url.length > 2048) return res.status(400).json({ error: "أرسل رابط مقال صالحًا." });
    try {
      return res.json(await extractArticleFromUrl(req.body.url));
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "تعذّر استخراج المقال." });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
