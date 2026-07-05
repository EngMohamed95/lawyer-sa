import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
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
