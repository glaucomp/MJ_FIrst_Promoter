import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const SES_SENDER = process.env.SES_SENDER || 'noreply@yourdomain.com';
const AWS_ACCESS_KEY_ID = process.env.SES_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.SES_AWS_SECRET_ACCESS_KEY;

const sesClient = new SESClient({
  region: AWS_REGION,
  credentials: AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  } : undefined
});

interface WelcomeEmailData {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  ref_id: string;
  loginUrl: string;
  // Optional override for the banner <img src>. When provided, replaces
  // the static EMAIL_VERIFY_HEADER_URL for this single send — typically
  // a `data:image/png;base64,…` URL produced by
  // `composeWelcomeHeaderDataUrl` containing the promoter's profile
  // photo composited onto the heart-background banner. Null/undefined
  // falls back to the static verify-header banner.
  headerImageOverrideUrl?: string | null;
}

interface SetPasswordEmailData {
  email: string;
  firstName?: string | null;
  setupUrl: string;
  invitedByName?: string | null;
  expiresAt: Date;
}

interface PasswordResetEmailData {
  email: string;
  firstName?: string | null;
  resetUrl: string;
  expiresAt: Date;
}

interface ReferralInviteEmailData {
  inviteeEmail: string;
  inviterName: string;
  campaignName: string;
  acceptUrl: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatExpiry = (expiresAt: Date) => {
  const hours = Math.max(
    1,
    Math.round((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)),
  );
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
};

const BRAND_PRIMARY = '#ff0f5f';
const BRAND_PRIMARY_DARK = '#cc0047';

// ─── Email header banner URLs ────────────────────────────────────────────────
//
// Mirrors the upstream Python settings.BUCKET_PUBLIC_URL + the per-template
// header constants. We host the same artwork in the same public S3 bucket
// so any banner already used by the Python pipeline (verify, reset, live-
// influencer) can be reused here without duplicating assets.
//
// Resolved once at module load — no need to re-read process.env on every
// email send. If `BUCKET_PUBLIC_URL` is unset we fall back to the known
// upstream value so dev environments don't ship broken <img> tags.
const BUCKET_PUBLIC_URL = (
  process.env.BUCKET_PUBLIC_URL?.trim() ||
  'https://bucket-image-tease-me.s3.us-east-1.amazonaws.com'
).replace(/\/+$/, '');

export const EMAIL_VERIFY_HEADER_URL = `${BUCKET_PUBLIC_URL}/email_verify_header.png`;
export const EMAIL_RESET_HEADER_URL = `${BUCKET_PUBLIC_URL}/email-assets/reset_password_header.jpg`;
export const EMAIL_INFLUENCER_HEADER_BG_URL = `${BUCKET_PUBLIC_URL}/influencer_header_background.png`;
export const EMAIL_WELCOME_HEADER_BG_URL = `${BUCKET_PUBLIC_URL}/welcome-email-header-bg.png`;

// Native pixel size of the banners hosted in the bucket (width, height).
// Mirrors the upstream Python EMAIL_HEADER_SIZE = (520, 150) so HTML
// renders at native resolution without scaling artefacts.
export const EMAIL_HEADER_SIZE: readonly [number, number] = [520, 150];

export class EmailService {
  /**
   * @deprecated Leaks the plaintext password in the email body. New users
   * are onboarded via `sendSetPasswordEmail` + the /set-password token flow.
   * Retained for one release in case any legacy caller still imports it.
   */
  async sendPromoterWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const { email, username, password, firstName, ref_id, loginUrl } = data;
    const headerOverride = data.headerImageOverrideUrl?.trim() || '';
    const name = firstName || username;
    const currentYear = new Date().getFullYear();

    const subject = '🎉 Welcome to MJ First Promoter Program!';

    // Branded header banner. Reuses the upstream TeaseMe verify-header
    // artwork served from the public S3 bucket (BUCKET_PUBLIC_URL +
    // /email_verify_header.png). Width/height match the upstream Python
    // pipeline's EMAIL_HEADER_SIZE = (520, 150), so the image renders at
    // native resolution without scaling artefacts. To use a different
    // banner (reset-password header, influencer heart background, etc),
    // swap to one of the other exported constants from this module.
    const [, HEADER_HEIGHT_PX] = EMAIL_HEADER_SIZE;
    // When the caller provides a per-promoter composite (e.g. data URL
    // built by composeWelcomeHeaderDataUrl), use that as the banner;
    // otherwise fall back to the static verify-header artwork. Either
    // way the markup is identical — the image just changes.
    const headerImageUrl = headerOverride || EMAIL_VERIFY_HEADER_URL;

    const headerHtml = headerImageUrl
      ? `
          <tr>
            <td align="center" style="background:#0f1012;padding:0;">
              <img
                src="${headerImageUrl}"
                alt="TeaseMe"
                height="${HEADER_HEIGHT_PX}"
                style="width:100%;max-width:540px;height:${HEADER_HEIGHT_PX}px;display:block;border-top-left-radius:16px;border-top-right-radius:16px;object-fit:cover;"
              />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 40px 0 40px;">
              <div style="display:inline-block;padding:8px 16px;border:1px solid ${BRAND_PRIMARY};border-radius:999px;color:${BRAND_PRIMARY};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">TeaseMe HQ</div>
              <h1 style="font-size:26px;line-height:1.3;color:#ffffff;margin:20px 0 8px 0;font-weight:700;">
                Welcome ${escapeHtml(name)}!
              </h1>
              <p style="font-size:15px;color:#c7c7c7;margin:0;">
                Your promoter account is ready
              </p>
            </td>
          </tr>`
      : `
          <tr>
            <td align="center" style="padding:36px 40px 8px 40px;">
              <div style="display:inline-block;padding:8px 16px;border:1px solid ${BRAND_PRIMARY};border-radius:999px;color:${BRAND_PRIMARY};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">TeaseMe HQ</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 40px 0 40px;">
              <h1 style="font-size:26px;line-height:1.3;color:#ffffff;margin:0 0 8px 0;font-weight:700;">
                Welcome ${escapeHtml(name)}!
              </h1>
              <p style="font-size:15px;color:#c7c7c7;margin:0;">
                Your promoter account is ready
              </p>
            </td>
          </tr>`;

    const bodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Welcome to MJ First Promoter</title>
</head>
<body style="background:#0f1012;padding:0;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f1012;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">

          ${headerHtml}

          <tr>
            <td style="padding:28px 40px 8px 40px;">
              <p style="font-size:15px;line-height:1.6;color:#c7c7c7;margin:0 0 16px 0;">
                Hi ${escapeHtml(name)},
              </p>
              <p style="font-size:15px;line-height:1.6;color:#c7c7c7;margin:0 0 24px 0;">
                Your promoter account has been successfully created. You can now start referring customers and earning commissions.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f1012;border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${BRAND_PRIMARY};border-radius:10px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="font-size:15px;font-weight:700;margin:0 0 14px 0;color:#ffffff;letter-spacing:0.3px;">Your Login Credentials</h3>
                    <p style="font-size:13px;margin:8px 0;color:#9a9a9a;">
                      <strong style="color:#c7c7c7;">Username:</strong> <code style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;font-family:'SFMono-Regular',Menlo,monospace;color:#ffffff;font-size:12px;">${escapeHtml(username)}</code>
                    </p>
                    <p style="font-size:13px;margin:8px 0;color:#9a9a9a;">
                      <strong style="color:#c7c7c7;">Email:</strong> <code style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;font-family:'SFMono-Regular',Menlo,monospace;color:#ffffff;font-size:12px;">${escapeHtml(email)}</code>
                    </p>
                    <p style="font-size:13px;margin:8px 0;color:#9a9a9a;">
                      <strong style="color:#c7c7c7;">Password:</strong> <code style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;font-family:'SFMono-Regular',Menlo,monospace;color:#ffffff;font-size:12px;">${escapeHtml(password)}</code>
                    </p>
                    <p style="font-size:13px;margin:8px 0;color:#9a9a9a;">
                      <strong style="color:#c7c7c7;">Referral ID:</strong> <code style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;font-family:'SFMono-Regular',Menlo,monospace;color:#ffffff;font-size:12px;">${escapeHtml(ref_id)}</code>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 40px 0 40px;">
              <p style="font-size:13px;line-height:1.6;color:${BRAND_PRIMARY};margin:0;padding:12px 14px;background:rgba(255,15,95,0.08);border:1px solid rgba(255,15,95,0.25);border-radius:8px;">
                <strong>Important:</strong> Please change your password after your first login for security.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 40px 8px 40px;">
              <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(180deg,${BRAND_PRIMARY} 0%,${BRAND_PRIMARY_DARK} 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">Login to Dashboard</a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 40px 0 40px;">
              <h3 style="font-size:14px;font-weight:700;margin:0 0 10px 0;color:#ffffff;letter-spacing:0.3px;">Next Steps</h3>
              <ol style="font-size:13px;line-height:1.7;color:#9a9a9a;margin:0;padding-left:20px;">
                <li>Login to your dashboard</li>
                <li>Change your password</li>
                <li>Generate tracking links for campaigns</li>
                <li>Start referring customers and earning commissions</li>
              </ol>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 12px 40px;border-top:1px solid rgba(255,255,255,0.06);margin-top:24px;">
              <p style="font-size:12px;line-height:1.6;color:#7a7a7a;margin:0;">
                If you didn't sign up for this, please ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="background:#0f1012;padding:16px;">
              <p style="font-size:11px;color:#555555;margin:0;">© ${currentYear} TeaseMe HQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const bodyText = `
Welcome ${name}!

Your promoter account has been successfully created.

Your Login Credentials:
- Username: ${username}
- Email: ${email}
- Password: ${password}
- Referral ID: ${ref_id}

Login at: ${loginUrl}

IMPORTANT: Please change your password after your first login.

Next Steps:
1. Login to your dashboard
2. Change your password
3. Generate tracking links for campaigns
4. Start referring customers and earning commissions!

© ${currentYear} MJ First Promoter Platform
    `.trim();

    return this.sendEmail(email, subject, bodyHtml, bodyText);
  }

  async sendSetPasswordEmail(data: SetPasswordEmailData): Promise<boolean> {
    const { email, firstName, setupUrl, invitedByName, expiresAt } = data;
    const displayName = firstName?.trim() || email.split('@')[0];
    const expiryText = formatExpiry(expiresAt);
    const trimmedInviter = invitedByName?.trim();
    const inviter = trimmedInviter
      ? `${trimmedInviter} has invited you to `
      : 'You have been invited to ';

    const subject = 'Set up your TeaseMe HQ account';
    const bodyHtml = this.renderActionTemplate({
      heading: `Welcome, ${displayName}!`,
      intro: `${inviter}join the TeaseMe HQ platform. Click the button below to create your password and activate your account.`,
      buttonLabel: 'Set My Password',
      buttonUrl: setupUrl,
      footerNote: `For security, this invite link expires in ${expiryText}. If it expires, ask whoever invited you to send a new one.`,
    });

    const bodyText = `Welcome, ${displayName}!

${inviter}join the TeaseMe HQ platform.

Click the link below to set your password and activate your account:
${setupUrl}

This invite link expires in ${expiryText}.

If you weren't expecting this invite, you can safely ignore this email.`;

    return this.sendEmail(email, subject, bodyHtml, bodyText);
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    const { email, firstName, resetUrl, expiresAt } = data;
    const displayName = firstName?.trim() || email.split('@')[0];
    const expiryText = formatExpiry(expiresAt);

    const subject = 'Reset your TeaseMe HQ password';
    const bodyHtml = this.renderActionTemplate({
      heading: `Hi ${displayName},`,
      intro:
        'We received a request to reset the password on your TeaseMe HQ account. Click the button below to choose a new one.',
      buttonLabel: 'Reset Password',
      buttonUrl: resetUrl,
      footerNote: `This link expires in ${expiryText}. If you didn't request a reset, you can safely ignore this email — your password will stay the same.`,
    });

    const bodyText = `Hi ${displayName},

We received a request to reset the password on your TeaseMe HQ account.

Use the link below to choose a new password:
${resetUrl}

This link expires in ${expiryText}. If you didn't request a reset, you can ignore this email.`;

    return this.sendEmail(email, subject, bodyHtml, bodyText);
  }

  async sendReferralInviteEmail(data: ReferralInviteEmailData): Promise<boolean> {
    const { inviteeEmail, inviterName, campaignName, acceptUrl } = data;
    const safeInviter = inviterName?.trim() || 'A promoter';

    const subject = `${safeInviter} invited you to join ${campaignName}`;
    const bodyHtml = this.renderActionTemplate({
      heading: `You're invited to ${campaignName}`,
      intro: `${safeInviter} sent you a referral invite. Click the button below to accept and get started.`,
      buttonLabel: 'Accept Invite',
      buttonUrl: acceptUrl,
      footerNote:
        'This invite link is single-use. If you weren\u2019t expecting this email, you can safely ignore it.',
    });

    const bodyText = `You're invited to ${campaignName}

${safeInviter} sent you a referral invite.

Click the link below to accept and get started:
${acceptUrl}

This invite link is single-use. If you weren't expecting this email, you can safely ignore it.`;

    return this.sendEmail(inviteeEmail, subject, bodyHtml, bodyText);
  }

  private renderActionTemplate({
    heading,
    intro,
    buttonLabel,
    buttonUrl,
    footerNote,
  }: {
    heading: string;
    intro: string;
    buttonLabel: string;
    buttonUrl: string;
    footerNote: string;
  }): string {
    const currentYear = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>TeaseMe HQ</title>
</head>
<body style="background:#0f1012;padding:0;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f1012;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:36px 32px 16px 32px;">
              <div style="display:inline-block;padding:8px 16px;border:1px solid ${BRAND_PRIMARY};border-radius:999px;color:${BRAND_PRIMARY};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">TeaseMe HQ</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 0 40px;">
              <h1 style="font-size:26px;line-height:1.3;color:#ffffff;margin:0 0 16px 0;font-weight:700;">${escapeHtml(heading)}</h1>
              <p style="font-size:15px;line-height:1.6;color:#c7c7c7;margin:0 0 28px 0;">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 28px 40px;">
              <a href="${buttonUrl}" style="display:inline-block;background:linear-gradient(180deg,${BRAND_PRIMARY} 0%,${BRAND_PRIMARY_DARK} 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(buttonLabel)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 12px 40px;">
              <p style="font-size:12px;line-height:1.6;color:#7a7a7a;margin:0 0 8px 0;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="font-size:12px;line-height:1.6;color:${BRAND_PRIMARY};word-break:break-all;margin:0;">
                <a href="${buttonUrl}" style="color:${BRAND_PRIMARY};text-decoration:underline;">${escapeHtml(buttonUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="font-size:12px;line-height:1.6;color:#7a7a7a;margin:0;">${escapeHtml(footerNote)}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background:#0f1012;padding:16px;">
              <p style="font-size:11px;color:#555555;margin:0;">© ${currentYear} TeaseMe HQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private async sendEmail(
    toEmail: string,
    subject: string,
    bodyHtml: string,
    bodyText: string
  ): Promise<boolean> {
    try {
      const command = new SendEmailCommand({
        Source: SES_SENDER,
        Destination: {
          ToAddresses: [toEmail]
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: bodyHtml,
              Charset: 'UTF-8'
            },
            Text: {
              Data: bodyText,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const response = await sesClient.send(command);
      console.log(`✅ Email sent to ${toEmail}: ${response.MessageId}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to send email to ${toEmail}:`, error.message);
      return false;
    }
  }
}

export const emailService = new EmailService();
