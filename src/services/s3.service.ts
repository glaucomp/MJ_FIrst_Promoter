import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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

const credentials =
  accessKeyId && secretAccessKey
    ? { accessKeyId, secretAccessKey }
    : undefined;

const s3Client = new S3Client({ region, credentials });

// ─── Public email-assets bucket ──────────────────────────────────────────────
// Email clients (Gmail, Outlook, etc.) block data: URIs in <img> tags.
// Composed images must be uploaded to a publicly accessible S3 bucket so
// they are reachable via a plain HTTPS URL.
//
// The public bucket URL is parsed from BUCKET_PUBLIC_URL.
// Format: https://{bucket}.s3.{region}.amazonaws.com[/optional-prefix]
// We use the same IAM credentials — they are expected to have PutObject
// permission on this bucket (they already have GetObject for email assets).
const _rawPublicUrl = (
  process.env.BUCKET_PUBLIC_URL?.trim() ||
  'https://bucket-image-tease-me.s3.us-east-1.amazonaws.com'
).replace(/\/+$/, '');

const _publicBucketMatch = /https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com/.exec(_rawPublicUrl);
const PUBLIC_EMAIL_BUCKET = _publicBucketMatch?.[1] ?? '';
const PUBLIC_EMAIL_REGION = _publicBucketMatch?.[2] ?? 'us-east-1';
export const PUBLIC_EMAIL_BUCKET_URL = _rawPublicUrl;

const publicS3Client = PUBLIC_EMAIL_BUCKET
  ? new S3Client({ region: PUBLIC_EMAIL_REGION, credentials })
  : null;

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

/**
 * Uploads `buffer` to the public email-assets S3 bucket at `key` with the
 * given `contentType`, then returns the public HTTPS URL.
 *
 * Returns null if the public bucket could not be determined (misconfigured
 * BUCKET_PUBLIC_URL) or if the upload fails, so callers can degrade
 * gracefully (e.g. fall back to the static header image).
 */
export const uploadPublicEmailAsset = async (
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string | null> => {
  if (!publicS3Client || !PUBLIC_EMAIL_BUCKET) {
    console.warn('[s3.service] uploadPublicEmailAsset: public bucket not configured', {
      BUCKET_PUBLIC_URL: process.env.BUCKET_PUBLIC_URL,
    });
    return null;
  }
  try {
    await publicS3Client.send(
      new PutObjectCommand({
        Bucket: PUBLIC_EMAIL_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    const url = `${PUBLIC_EMAIL_BUCKET_URL}/${key}`;
    console.info('[s3.service] uploadPublicEmailAsset ok', { key, url, bytes: buffer.length });
    return url;
  } catch (err) {
    console.error('[s3.service] uploadPublicEmailAsset failed', {
      key,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};

export const teasemeBucket = bucket;
export const teasemeRegion = region;
