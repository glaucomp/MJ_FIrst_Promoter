import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.TEASEME_S3_REGION || 'ap-southeast-2';
const bucket = process.env.TEASEME_S3_BUCKET || 'bucket-live-message-tease-me';

// Reuse the SES_* IAM credentials — they already have access to the TeaseMe bucket
// (confirmed via the sample presigned URL). Falls back to the default AWS SDK
// credential provider chain when the vars are missing (e.g. on EC2 with a role).
const accessKeyId = process.env.SES_AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.SES_AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region,
  credentials:
    accessKeyId && secretAccessKey
      ? { accessKeyId, secretAccessKey }
      : undefined,
});

/**
 * Returns a presigned GET URL for the given S3 key in the TeaseMe bucket.
 * Returns null when the key is falsy so callers can safely inline the result.
 */
export const getPresignedUrl = async (
  key?: string | null,
  expiresInSeconds = 3600
): Promise<string | null> => {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (error) {
    console.error('[s3.service] Failed to presign key', key, error);
    return null;
  }
};

export const teasemeBucket = bucket;
export const teasemeRegion = region;
