import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import multer from "multer";
import net from "net";
import apiRouter from "./src/server/api.js";
import { checkDbHealth } from "./src/server/db.js";

async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        tester.close();
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    tester.once("listening", () => {
      const port = (tester.address() as net.AddressInfo).port;
      tester.close(() => resolve(port));
    });
    tester.listen(startPort, "127.0.0.1");
  });
}

async function startServer() {
  // Start health check in background so it doesn't block server startup
  checkDbHealth().then(healthy => {
    if (!healthy) {
      console.warn("Database is not healthy. Some API features may not work.");
    } else {
      console.log("Database connection established successfully.");
    }
  });

  const desiredPort = Number(process.env.PORT || 3000);
  let PORT = desiredPort;
  const HOST = "0.0.0.0";
  
  if (process.env.NODE_ENV !== "production") {
    PORT = await findAvailablePort(desiredPort);
    if (PORT !== desiredPort) {
      console.warn(`Port ${desiredPort} is busy. Starting server on available port ${PORT}.`);
    }
  }

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
  });

  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/debug", async (req, res) => {
    try {
      const dbExists = fs.existsSync(path.join(process.cwd(), "dev.db"));
      const fallbackExists = fs.existsSync(path.join(process.cwd(), "prisma", "dev.db"));
      let prismaError = null;
      try {
        await checkDbHealth();
      } catch (err: any) {
        prismaError = err.message || String(err);
      }
      res.json({
        cwd: process.cwd(),
        dbExists,
        fallbackExists,
        envNodeEnv: process.env.NODE_ENV,
        envDbUrl: process.env.DATABASE_URL,
        prismaError
      });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use("/api", apiRouter);

  /**
   * رفع الملفات محلياً — بديل upload.php أثناء التطوير.
   *
   * على الاستضافة يعمل public/upload.php لأن PHP متاح هناك. أما محلياً
   * فلا يوجد مُفسّر PHP، وVite كان يُرجع نص الملف الخام فيفشل JSON.parse
   * برسالة: Unexpected token '<', "<?php hea"...
   *
   * هذا المسار يُنفَّذ قبل Vite ويُرجع نفس شكل الاستجابة بالضبط
   * { success, fileUrl, fileName } فلا يحتاج كود الواجهة أي تعديل.
   * ملف upload.php باقٍ كما هو للنشر.
   */
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  // امتدادات مرفوضة — لا نسمح برفع ما يمكن تنفيذه على الخادم
  const BLOCKED_EXT = new Set([
    ".php", ".php3", ".php4", ".php5", ".phtml", ".phar",
    ".js", ".mjs", ".cjs", ".exe", ".bat", ".cmd", ".com",
    ".sh", ".ps1", ".jsp", ".asp", ".aspx", ".cgi", ".pl", ".py", ".htaccess",
  ]);

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        // multer/busboy يقرأ اسم الملف بترميز latin1، فتتشوّه الأسماء العربية.
        // نُعيد فكّه كـ UTF-8 حتى يبقى «عقد-اختبار.txt» كما هو.
        const decoded = Buffer.from(file.originalname || "file", "latin1").toString("utf8");
        // نُنظّف الاسم: نمنع مسارات نسبية ونقصر المسموح على حروف آمنة
        const original = path.basename(decoded);
        const ext = path.extname(original).toLowerCase();
        const base = path
          .basename(original, path.extname(original))
          .replace(/[^\p{L}\p{N}._-]/gu, "_")
          .slice(0, 80) || "file";
        cb(null, `${Date.now()}_${base}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const decoded = Buffer.from(file.originalname || "", "latin1").toString("utf8");
      const ext = path.extname(decoded).toLowerCase();
      if (BLOCKED_EXT.has(ext)) {
        cb(new Error(`نوع الملف ${ext} غير مسموح برفعه`));
        return;
      }
      cb(null, true);
    },
  });

  app.options("/upload.php", (_req, res) => res.sendStatus(200));

  app.post("/upload.php", (req, res) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        res.status(400).json({ error: message });
        return;
      }
      // multer يُلحق req.file — نوصّفه صراحةً لأن @types/multer غير مثبّت
      const uploaded = (req as typeof req & { file?: { filename: string } }).file;
      if (!uploaded) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }
      res.json({
        success: true,
        fileUrl: `${req.protocol}://${req.get("host")}/uploads/${uploaded.filename}`,
        fileName: uploaded.filename,
      });
    });
  });

  // تقديم الملفات المرفوعة محلياً (على الاستضافة يتولاها الخادم مباشرة)
  app.use("/uploads", express.static(uploadsDir, { index: false }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const hmrPort = Number(process.env.HMR_PORT || 24679);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : {
          protocol: 'ws',
          host: 'localhost', // Changed from HOST to fix websocket connection errors
          port: hmrPort,
        },
      },
      appType: "custom", // Changed from "spa" to "custom" to handle index.html manually
    });
    app.use(vite.middlewares);

    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });


  server.on("error", (error: any) => {
    console.error("Server error:", error);
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Please stop the process using it or set PORT to another value.`);
    }
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down server...");
    server.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down server...");
    server.close(() => process.exit(0));
  });
}

startServer();
