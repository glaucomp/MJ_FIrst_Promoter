import sharp from "sharp";

import { EMAIL_HEADER_SIZE, EMAIL_WELCOME_HEADER_BG_URL } from "./email.service";
import { downloadObjectBuffer } from "./s3.service";

// ─── Email header composition ────────────────────────────────────────────────
//
// Server-side equivalent of the upstream Python `compose_email_header_image_url`.
// Builds a banner sized to EMAIL_HEADER_SIZE using the heart-background asset
// served from the same public S3 bucket as the other email header images
// (EMAIL_WELCOME_HEADER_BG_URL) and, when we have a profile photo key,
// composites the promoter's photo masked to a circle and centred on top.
// Returns the result as a `data:image/png;base64,…` URL so the welcome email
// can embed it inline (no expiry).
//
// Photo handling:
//   - photoKey provided + download succeeds → photo composited inside ring
//   - photoKey missing or download fails    → background only, no photo
//
// Returns null only when the background cannot be fetched (e.g. network error
// or the object is missing from the bucket), or sharp throws. In that null
// case the caller (sendPromoterWelcomeEmail) falls back to the upstream
// verify-header banner.

const [HEADER_W, HEADER_H] = EMAIL_HEADER_SIZE;
// Photo diameter + centred anchor — the circle sits in the middle of
// the banner. Tweak here if the team wants a different layout; the
// email template itself is unaware of these coordinates.
const CIRCLE_DIAMETER = 130;
const CIRCLE_CENTRE_X = Math.round(HEADER_W / 2);
const CIRCLE_CENTRE_Y = Math.round(HEADER_H / 2);
const RING_THICKNESS = 4;
const RING_COLOUR = "#FF5C74";

interface ComposeInput {
  // S3 key of the promoter's profile photo. Empty/null is supported —
  // in that case we still return a data URL, just without the photo
  // overlay (heart background only).
  photoKey?: string | null;
  // Free-form identifier used purely for log correlation when the
  // compose path fails. Mirrors the upstream Python signature.
  identifier?: string;
}

// Module-level cache so we don't re-fetch the same PNG from the public
// S3 bucket on every welcome-email send. The asset only changes on
// deploy; a single fetch at first use is enough. Concurrent first-callers
// all share the same in-flight promise.
let cachedBackgroundPromise: Promise<Buffer | null> | null = null;

const readBackgroundBuffer = async (): Promise<Buffer | null> => {
  if (!cachedBackgroundPromise) {
    cachedBackgroundPromise = (async () => {
      try {
        const response = await fetch(EMAIL_WELCOME_HEADER_BG_URL);
        if (!response.ok) {
          console.warn(
            "[email-compose] failed to fetch background asset from S3",
            { url: EMAIL_WELCOME_HEADER_BG_URL, status: response.status },
          );
          cachedBackgroundPromise = null;
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err) {
        console.warn(
          "[email-compose] failed to fetch background asset from S3",
          { url: EMAIL_WELCOME_HEADER_BG_URL, err: err instanceof Error ? err.message : String(err) },
        );
        // Don't poison the cache permanently — null this out so a later
        // call can retry after a transient network error.
        cachedBackgroundPromise = null;
        return null;
      }
    })();
  }
  return cachedBackgroundPromise;
};

const buildCircularPhotoBuffer = async (
  photoBytes: Buffer,
): Promise<Buffer> => {
  // Resize the source photo to the inner circle diameter (the ring
  // takes up RING_THICKNESS px of border on top of this), centred and
  // covering the square. Then mask to a circle by composing against
  // an SVG mask — sharp's `dest-in` blend keeps only the pixels that
  // overlap the white circle, producing a transparent-cornered PNG.
  const innerDiameter = CIRCLE_DIAMETER - RING_THICKNESS * 2;
  const r = innerDiameter / 2;
  const circleMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${innerDiameter}" height="${innerDiameter}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );

  const resized = await sharp(photoBytes)
    .resize(innerDiameter, innerDiameter, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return sharp(resized)
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
};

const buildRingedCircle = async (photoBytes: Buffer): Promise<Buffer> => {
  // Render the pink ring as an SVG circle (stroke-only) at the full
  // CIRCLE_DIAMETER size. The masked photo from `buildCircularPhotoBuffer`
  // is then dropped into the centre, leaving the SVG ring around it.
  const r = (CIRCLE_DIAMETER - RING_THICKNESS) / 2;
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CIRCLE_DIAMETER}" height="${CIRCLE_DIAMETER}">` +
      `<circle cx="${CIRCLE_DIAMETER / 2}" cy="${CIRCLE_DIAMETER / 2}" r="${r}" fill="none" stroke="${RING_COLOUR}" stroke-width="${RING_THICKNESS}"/>` +
      `</svg>`,
  );

  const masked = await buildCircularPhotoBuffer(photoBytes);

  // Place the masked photo onto a transparent CIRCLE_DIAMETER² canvas
  // so the ring SVG can be composited on top at the same dimensions.
  const photoCentered = await sharp({
    create: {
      width: CIRCLE_DIAMETER,
      height: CIRCLE_DIAMETER,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: masked, gravity: "centre" }])
    .png()
    .toBuffer();

  return sharp(photoCentered)
    .composite([{ input: ring, gravity: "centre" }])
    .png()
    .toBuffer();
};

/**
 * Builds the composed welcome-email banner (heart background + circular
 * promoter photo + pink ring) and returns it as a `data:image/png;base64`
 * URL ready to drop straight into an `<img src>`. Mirrors the upstream
 * Python `compose_email_header_image_url`, except the result is inlined
 * into the email rather than uploaded to S3 so we don't manage object
 * lifetimes or presigned-URL expiry.
 */
export const composeWelcomeHeaderDataUrl = async (
  input: ComposeInput,
): Promise<string | null> => {
  const { photoKey, identifier } = input;
  const trimmedPhotoKey = photoKey?.trim() || "";

  try {
    // Download the photo (best-effort) and fetch the S3 background in
    // parallel. The background is the deal-breaker; the photo is
    // optional — a missing photo just means we skip the overlay.
    const [photoBytes, backgroundBytes] = await Promise.all([
      trimmedPhotoKey ? downloadObjectBuffer(trimmedPhotoKey) : Promise.resolve(null),
      readBackgroundBuffer(),
    ]);
    if (!backgroundBytes) {
      console.warn(
        "[email-compose] compose skipped — background asset unavailable",
        { identifier, backgroundUrl: EMAIL_WELCOME_HEADER_BG_URL },
      );
      return null;
    }

    // Resize the background to the canonical email header size in case
    // the asset is at a different resolution (the upstream pipeline
    // uses 520x150). `cover` preserves the aspect ratio, cropping any
    // overflow.
    const resizedBackground = await sharp(backgroundBytes)
      .resize(HEADER_W, HEADER_H, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();

    // No photo bytes → return the heart background as-is. This is the
    // graceful path when the upstream sync didn't yield a photo key
    // (e.g. TeaseMe 404), or when the S3 object is missing — the email
    // still gets the branded banner instead of the generic upstream
    // verify-header.
    if (!photoBytes) {
      const base64 = resizedBackground.toString("base64");
      console.info("[email-compose] built background-only welcome banner", {
        identifier,
        photoKey: trimmedPhotoKey || null,
        bytes: resizedBackground.length,
        reason: trimmedPhotoKey ? "photo download failed" : "no photo key",
      });
      return `data:image/png;base64,${base64}`;
    }

    const ringedPhoto = await buildRingedCircle(photoBytes);

    // Final composite: photo dropped onto the resized background at
    // the chosen centre coordinates. sharp's `top`/`left` are the
    // top-left corner of the overlay, so we offset by half the circle
    // diameter to keep CIRCLE_CENTRE_X / CIRCLE_CENTRE_Y meaningful.
    const composed = await sharp(resizedBackground)
      .composite([
        {
          input: ringedPhoto,
          top: CIRCLE_CENTRE_Y - Math.round(CIRCLE_DIAMETER / 2),
          left: CIRCLE_CENTRE_X - Math.round(CIRCLE_DIAMETER / 2),
        },
      ])
      .png()
      .toBuffer();

    const base64 = composed.toString("base64");
    console.info("[email-compose] built composed welcome banner", {
      identifier,
      photoKey: trimmedPhotoKey,
      bytes: composed.length,
    });
    return `data:image/png;base64,${base64}`;
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
