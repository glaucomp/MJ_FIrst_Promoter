import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import apiV1Routes from "./routes/api.v1.routes";
import apiV2Routes from "./routes/api.v2.routes";
import authRoutes from "./routes/auth.routes";
import campaignRoutes from "./routes/campaign.routes";
import commissionRoutes from "./routes/commission.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import publicRoutes from "./routes/public.routes";
import referralRoutes from "./routes/referral.routes";
import userRoutes from "./routes/user.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public routes (no authentication)
app.use("/api/public", publicRoutes);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/commissions", commissionRoutes);

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
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
