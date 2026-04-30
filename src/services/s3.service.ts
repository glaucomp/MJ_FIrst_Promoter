import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const region = process.env.TEASEME_S3_REGION;
if (!region) {
  throw new Error('[s3.service] Missing required environment variable: TEASEME_S3_REGION');
}

const bucket = process.env.TEASEME_S3_BUCKET;
if (!bucket) {
  throw new Error('[s3.service] Missing required environment variable: TEASEME_S3_BUCKET');
}

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

/**
 * Downloads an S3 object into a Buffer. Returns null when the key is
 * falsy or the fetch fails. Used by server-side image-composition
 * pipelines (e.g. email-compose.service.ts) that need the raw bytes
 * rather than a presigned URL — typically because the result is then
 * processed in-memory and embedded as a data URL.
 */
export const downloadObjectBuffer = async (
  key?: string | null,
): Promise<Buffer | null> => {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return null;
    // The SDK returns Body as a Readable stream in Node — collect into
    // a Buffer. transformToByteArray() is provided by the smithy stream
    // helpers and is the documented way to materialise small objects.
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    console.error('[s3.service] Failed to download key', key, error);
    return null;
  }
};

export const teasemeBucket = bucket;
export const teasemeRegion = region;
