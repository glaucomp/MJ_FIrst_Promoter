import sharp from "sharp";

import { EMAIL_HEADER_SIZE, EMAIL_INFLUENCER_HEADER_BG_URL } from "./email.service";
import { downloadObjectBuffer } from "./s3.service";

// ─── Email header composition ────────────────────────────────────────────────
//
// Builds the welcome-email banner by layering three planes:
//
//   1. Solid base canvas (opaque, covers the full header area)
//   2. Promoter profile photo — circular crop, centred on the canvas
//   3. influencer_header_background.png — full-width overlay that has a
//      transparent (alpha) hole in the centre; the hole reveals the photo
//      from layer 2.  All decorative framing / ring is baked into the PNG.
//
// The overlay asset replaces the old heart-background approach where the
// photo was composited ON TOP of the background.  Now the photo sits
// BEHIND the overlay so it shows through the alpha hole.
//
// Photo handling:
//   - photoKey provided + download succeeds → photo shows through the hole
//   - photoKey missing or download fails    → overlay renders on base colour
//
// Returns null only when the overlay cannot be fetched or sharp throws.
// The caller falls back to the static verify-header banner in that case.

const [HEADER_W, HEADER_H] = EMAIL_HEADER_SIZE;

// Desired diameter of the circular photo crop. The effective diameter is
// clamped to the header bounds so a centred composite never overflows the
// base canvas.
const DESIRED_PHOTO_DIAMETER = 160;
const PHOTO_DIAMETER = Math.min(DESIRED_PHOTO_DIAMETER, HEADER_W, HEADER_H);
const PHOTO_CENTRE_X = Math.round(HEADER_W / 2);
const PHOTO_CENTRE_Y = Math.round(HEADER_H / 2);

// Colour shown through the alpha hole when there is no profile photo.
// Dark near-black matches common dark-themed email clients.
const BASE_BG = { r: 13, g: 5, b: 10, alpha: 1 } as const;

interface ComposeInput {
  // S3 key of the promoter's profile photo. Empty/null is supported —
  // in that case the overlay still renders on the base colour.
  photoKey?: string | null;
  // Free-form identifier used purely for log correlation.
  identifier?: string;
}

// Module-level cache so we don't re-fetch the overlay PNG from S3 on
// every welcome-email send.  Concurrent first-callers share the same
// in-flight promise.
let cachedOverlayPromise: Promise<Buffer | null> | null = null;

const readOverlayBuffer = async (): Promise<Buffer | null> => {
  if (!cachedOverlayPromise) {
    cachedOverlayPromise = (async () => {
      try {
        const response = await fetch(EMAIL_INFLUENCER_HEADER_BG_URL);
        if (!response.ok) {
          console.warn(
            "[email-compose] failed to fetch overlay asset from S3",
            { url: EMAIL_INFLUENCER_HEADER_BG_URL, status: response.status },
          );
          cachedOverlayPromise = null;
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err) {
        console.warn(
          "[email-compose] failed to fetch overlay asset from S3",
          { url: EMAIL_INFLUENCER_HEADER_BG_URL, err: err instanceof Error ? err.message : String(err) },
        );
        cachedOverlayPromise = null;
        return null;
      }
    })();
  }
  return cachedOverlayPromise;
};

// Resize `photoBytes` to `diameter × diameter` with a centre-cover crop,
// then apply a circular SVG mask so only the disc is opaque.
const buildCircularPhotoBuffer = async (
  photoBytes: Buffer,
  diameter: number,
): Promise<Buffer> => {
  const r = diameter / 2;
  const circleMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">` +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/>` +
      `</svg>`,
  );

  const resized = await sharp(photoBytes)
    .resize(diameter, diameter, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return sharp(resized)
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
};

/**
 * Builds the composed welcome-email banner and returns it as a
 * `data:image/png;base64` URL ready to drop straight into an `<img src>`.
 *
 * Layer order (bottom → top):
 *   1. Solid base canvas
 *   2. Circular profile photo centred at the alpha-hole position
 *   3. influencer_header_background.png overlay (alpha hole reveals the photo)
 */
export const composeWelcomeHeaderDataUrl = async (
  input: ComposeInput,
): Promise<string | null> => {
  const { photoKey, identifier } = input;
  const trimmedPhotoKey = photoKey?.trim() || "";

  try {
    const [photoBytes, overlayBytes] = await Promise.all([
      trimmedPhotoKey ? downloadObjectBuffer(trimmedPhotoKey) : Promise.resolve(null),
      readOverlayBuffer(),
    ]);

    if (!overlayBytes) {
      console.warn(
        "[email-compose] compose skipped — overlay asset unavailable",
        { identifier, overlayUrl: EMAIL_INFLUENCER_HEADER_BG_URL },
      );
      return null;
    }

    // Resize overlay to the canonical email header dimensions.
    const resizedOverlay = await sharp(overlayBytes)
      .resize(HEADER_W, HEADER_H, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();

    // Opaque base so there is always solid content behind the overlay.
    const baseCanvas = await sharp({
      create: {
        width: HEADER_W,
        height: HEADER_H,
        channels: 4,
        background: BASE_BG,
      },
    })
      .png()
      .toBuffer();

    if (!photoBytes) {
      // No photo — overlay on base colour only.
      const composed = await sharp(baseCanvas)
        .composite([{ input: resizedOverlay, top: 0, left: 0 }])
        .png()
        .toBuffer();

      console.info("[email-compose] built overlay-only welcome banner", {
        identifier,
        photoKey: trimmedPhotoKey || null,
        bytes: composed.length,
        reason: trimmedPhotoKey ? "photo download failed" : "no photo key",
      });
      return `data:image/png;base64,${composed.toString("base64")}`;
    }

    // Circular photo crop sized to fill the alpha hole in the overlay PNG.
    const circularPhoto = await buildCircularPhotoBuffer(photoBytes, PHOTO_DIAMETER);

    // Layer 1 → base canvas
    // Layer 2 → circular photo centred at the alpha-hole position
    // Layer 3 → overlay frame (alpha hole reveals the photo)
    const composed = await sharp(baseCanvas)
      .composite([
        {
          input: circularPhoto,
          top: PHOTO_CENTRE_Y - Math.round(PHOTO_DIAMETER / 2),
          left: PHOTO_CENTRE_X - Math.round(PHOTO_DIAMETER / 2),
        },
        { input: resizedOverlay, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();

    console.info("[email-compose] built composed welcome banner", {
      identifier,
      photoKey: trimmedPhotoKey,
      bytes: composed.length,
    });
    return `data:image/png;base64,${composed.toString("base64")}`;
  } catch (err) {
    console.warn(
      "[email-compose] failed to build composed welcome banner",
      {
        identifier,
        photoKey: trimmedPhotoKey || null,
        err: err instanceof Error ? err.message : String(err),
      },
    );
    return null;
  }
};
