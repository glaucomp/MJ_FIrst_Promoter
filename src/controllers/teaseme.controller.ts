import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  syncUserFromTeaseMe,
  TeaseMeApiError,
  TeaseMeSyncValidationError,
} from '../services/teaseme.service';
import { getPresignedUrl } from '../services/s3.service';

/**
 * POST /api/users/:id/sync-teaseme — admin-only.
 * Pulls the latest profile for the user (keyed by username) from TeaseMe,
 * stores voiceId / S3 keys / social links, and returns the refreshed user
 * with freshly-presigned media URLs (1h expiry).
 */
export const syncTeaseMeForUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Missing user id' });
    }

    const synced = await syncUserFromTeaseMe(id);

    const [photoUrl, videoUrl] = await Promise.all([
      getPresignedUrl(synced.profilePhotoKey),
      getPresignedUrl(synced.profileVideoKey),
    ]);

    return res.json({
      user: {
        id: synced.id,
        username: synced.username,
        voiceId: synced.voiceId,
        teasemeSyncedAt: synced.teasemeSyncedAt,
        photoUrl,
        videoUrl,
        socialLinks: synced.socialLinks,
      },
      message: 'User synced from TeaseMe',
    });
  } catch (error) {
    if (error instanceof TeaseMeSyncValidationError) {
      console.error('TeaseMe sync validation error:', error.message);
      return res.status(error.status).json({ error: error.message });
    }

    if (error instanceof TeaseMeApiError) {
      console.error('TeaseMe sync error:', error.message, error.status, error.body);
      let statusCode = 502;
      if (typeof error.status === 'number') {
        if (error.status >= 500) {
          statusCode = 502;
        } else {
          statusCode = error.status;
        }
      }
      return res.status(statusCode).json({
        error: error.message,
        teasemeStatus: error.status,
      });
    }
    console.error('TeaseMe sync error:', error);
    return res.status(500).json({ error: 'Failed to sync user from TeaseMe' });
  }
};
