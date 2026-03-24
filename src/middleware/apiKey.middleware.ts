import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ApiKeyRequest extends Request {
  apiKey?: any;
  accountId?: string;
}

// Middleware for v1 API (X-API-KEY header)
export const validateApiKeyV1 = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    console.log(`[AUTH DEBUG] Received X-API-KEY: "${apiKey}"`);

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const allKeys = await prisma.apiKey.findMany({ select: { key: true, isActive: true } });
    console.log(`[AUTH DEBUG] Keys in DB:`, allKeys.map(k => `${k.key} (active=${k.isActive})`));

    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey, isActive: true },
      include: { user: true }
    });

    if (!key) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    });

    req.apiKey = key;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Middleware for v2 API (Bearer token + Account-ID)
export const validateApiKeyV2 = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers['authorization'] as string;
    const accountId = req.headers['account-id'] as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Bearer token required' });
    }

    if (!accountId) {
      return res.status(401).json({ error: 'Account-ID header required' });
    }

    const token = authHeader.substring(7);

    const key = await prisma.apiKey.findFirst({
      where: {
        token,
        accountId,
        isActive: true
      },
      include: { user: true }
    });

    if (!key) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    });

    req.apiKey = key;
    req.accountId = accountId;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
