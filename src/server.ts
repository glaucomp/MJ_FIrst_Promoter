import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { getAppVersion } from "./lib/version";
import apiV1Routes from "./routes/api.v1.routes";
import apiV2Routes from "./routes/api.v2.routes";
import authRoutes from "./routes/auth.routes";
import campaignRoutes from "./routes/campaign.routes";
import chatterRoutes from "./routes/chatter.routes";
import chatterGroupRoutes from "./routes/chatter-group.routes";
import commissionRoutes from "./routes/commission.routes";
import customerRoutes from "./routes/customer.routes";
import transactionRoutes from "./routes/transaction.routes";
import wiseRoutes from "./routes/wise.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import publicRoutes from "./routes/public.routes";
import referralRoutes from "./routes/referral.routes";
import userRoutes from "./routes/user.routes";
import elevenLabsRoutes from "./routes/elevenlabs.routes";
import helpRoutes from "./routes/help.routes";
import webhookRoutes from "./routes/webhook.routes";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Trust the first reverse-proxy hop (e.g. AWS ALB) so `req.ip` reflects the
// real client IP. Required for per-IP rate limiting to work in production.
// Override via TRUST_PROXY_HOPS if the deployment has a different number of
// proxies in front of the app (e.g. CloudFront + ALB = 2).
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10);
app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

// Middleware
const allowedOrigins = (() => {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  try {
    const url = new URL(base);
    const hostname = url.hostname; // e.g. "www.mjpromoter.com"
    const apex = hostname.startsWith('www.') ? hostname.slice(4) : null;
    const origins = new Set([base]);
    if (apex) {
      origins.add(`${url.protocol}//${apex}`);
    }
    return [...origins];
  } catch {
    return [base];
  }
})();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    // Vite may use 5174+ when 5173 is busy; allow any localhost port in dev.
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
  });
});

// Public routes (no authentication)
app.use("/api/public", publicRoutes);

// Webhook routes (authenticated via shared secret, not JWT)
app.use("/api/webhooks", webhookRoutes);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/chatters", chatterRoutes);
app.use("/api/chatter-groups", chatterGroupRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/commissions", commissionRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/wise", wiseRoutes);
app.use("/api/elevenlabs", elevenLabsRoutes);
app.use("/api/help-videos", helpRoutes);

// FirstPromoter-compatible API routes
app.use("/api/v1", apiV1Routes);
app.use("/api/v2", apiV2Routes);

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  },
);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 App version: ${getAppVersion()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🛍️ Customers API: http://localhost:${PORT}/api/customers`);
});

export default app;
