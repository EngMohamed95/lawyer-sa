import express from "express";
import cors from "cors";
import apiRouter from "../src/server/api.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure all API routes are prefixed with /api
app.use("/api", apiRouter);

export default app;
