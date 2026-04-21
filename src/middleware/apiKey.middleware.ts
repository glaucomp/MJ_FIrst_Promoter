import { PrismaClient } from "@prisma/client";
import { NextFunction, Request, Response } from "express";

const prisma = new PrismaClient();

export interface ApiKeyRequest extends Request {
  apiKey?: any;
  accountId?: string;
}

// Middleware for v1 API (X-API-KEY header)
export const validateApiKeyV1 = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) => {
  console.log(`[API v1] ➡️  ${req.method} ${req.originalUrl}`);
  try {
    const apiKey = req.headers["x-api-key"] as string;
    const apiKeyPreview = apiKey
      ? `${apiKey.slice(0, 8)}… (len=${apiKey.length})`
      : "MISSING";
    console.log(`[API v1] x-api-key header: ${apiKeyPreview}`);

    if (!apiKey) {
      console.warn("[API v1] ❌ 401 — API key required");
      return res.status(401).json({ error: "API key required" });
    }

    const allKeys = await prisma.apiKey.findMany({
      select: { key: true, isActive: true },
    });
    console.log(
      `[API v1] keys in DB: total=${allKeys.length}, active=${allKeys.filter((k) => k.isActive).length}`,
    );

    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey, isActive: true },
      include: { user: true },
    });

    if (!key) {
      console.warn(
        `[API v1] ❌ 401 — Invalid API key (prefix=${apiKey.slice(0, 8)}…)`,
      );
      return res.status(401).json({ error: "Invalid API key" });
    }

    console.log(
      `[API v1] ✅ API key valid — keyId=${key.id}, userId=${key.userId ?? "n/a"}`,
    );

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    req.apiKey = key;
    next();
  } catch (error) {
    console.error("[API v1] 💥 API key validation error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

// Middleware for v2 API (Bearer token + Account-ID)
export const validateApiKeyV2 = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    const accountId = req.headers["account-id"] as string;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Bearer token required" });
    }

    if (!accountId) {
      return res.status(401).json({ error: "Account-ID header required" });
    }

    const token = authHeader.substring(7);

    const key = await prisma.apiKey.findFirst({
      where: {
        token,
        accountId,
        isActive: true,
      },
      include: { user: true },
    });

    if (!key) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    req.apiKey = key;
    req.accountId = accountId;
    next();
  } catch (error) {
    console.error("API key validation error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};
