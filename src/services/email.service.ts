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

export class EmailService {
  /**
   * @deprecated Leaks the plaintext password in the email body. New users
   * are onboarded via `sendSetPasswordEmail` + the /set-password token flow.
   * Retained for one release in case any legacy caller still imports it.
   */
  async sendPromoterWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    const { email, username, password, firstName, ref_id, loginUrl } = data;
    const name = firstName || username;
    const currentYear = new Date().getFullYear();

    const subject = '🎉 Welcome to MJ First Promoter Program!';
    
    const bodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Welcome to MJ First Promoter</title>
</head>
<body style="background:#f7f8fc;padding:0;margin:0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f8fc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:24px;box-shadow:0 10px 32px rgba(50,50,93,0.10),0 2px 4px rgba(0,0,0,0.07);overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 30px;">
              <h1 style="font-family:'Arial Rounded MT Bold',Arial,sans-serif;font-size:32px;font-weight:bold;margin:0;color:#fff;">
                🎉 Welcome ${name}!
              </h1>
              <p style="font-size:16px;color:#fff;margin:8px 0 0 0;opacity:0.9;">
                Your promoter account is ready
              </p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td align="center" style="padding:32px 30px 16px 30px;">
              <p style="font-size:16px;color:#666;margin:0 0 24px 0;text-align:left;">
                Hi ${name},
              </p>
              
              <p style="font-size:16px;color:#666;margin:0 0 24px 0;text-align:left;">
                Your promoter account has been successfully created! You can now start referring customers and earning commissions.
              </p>
              
              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9f9;border-left:4px solid #667eea;border-radius:8px;margin:24px 0;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="font-size:18px;font-weight:bold;margin:0 0 16px 0;color:#333;">📋 Your Login Credentials</h3>
                    <p style="font-size:14px;margin:8px 0;color:#555;">
                      <strong>Username:</strong> <code style="background:#fff;padding:4px 8px;border-radius:4px;font-family:monospace;">${username}</code>
                    </p>
                    <p style="font-size:14px;margin:8px 0;color:#555;">
                      <strong>Email:</strong> <code style="background:#fff;padding:4px 8px;border-radius:4px;font-family:monospace;">${email}</code>
                    </p>
                    <p style="font-size:14px;margin:8px 0;color:#555;">
                      <strong>Password:</strong> <code style="background:#fff;padding:4px 8px;border-radius:4px;font-family:monospace;">${password}</code>
                    </p>
                    <p style="font-size:14px;margin:8px 0;color:#555;">
                      <strong>Referral ID:</strong> <code style="background:#fff;padding:4px 8px;border-radius:4px;font-family:monospace;">${ref_id}</code>
                    </p>
                  </td>
                </tr>
              </table>
              
              <p style="font-size:14px;color:#e74c3c;margin:16px 0;padding:12px;background:#fff3f3;border-radius:6px;text-align:left;">
                ⚠️ <strong>Important:</strong> Please change your password after your first login for security.
              </p>
              
              <div style="text-align:center;margin:24px 0;">
                <a href="${loginUrl}"
                  style="background:#667eea;border-radius:8px;color:#fff;text-decoration:none;display:inline-block;padding:16px 40px;font-size:18px;font-weight:bold;box-shadow:0 4px 12px rgba(102,126,234,0.4);">
                  Login to Dashboard
                </a>
              </div>
              
              <div style="text-align:left;margin:24px 0 0 0;">
                <h3 style="font-size:16px;font-weight:bold;margin:0 0 12px 0;color:#333;">🚀 Next Steps:</h3>
                <ol style="font-size:14px;color:#666;margin:0;padding-left:20px;">
                  <li style="margin-bottom:8px;">Login to your dashboard</li>
                  <li style="margin-bottom:8px;">Change your password</li>
                  <li style="margin-bottom:8px;">Generate tracking links for campaigns</li>
                  <li style="margin-bottom:8px;">Start referring customers and earning commissions!</li>
                </ol>
              </div>
              
              <p style="margin:24px 0 0 0;font-size:13px;color:#999;text-align:center;">
                If you didn't sign up for this, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 0 12px 0;background:#e5e5e5;color:#999;font-size:13px;border-bottom-left-radius:24px;border-bottom-right-radius:24px;">
              © ${currentYear} MJ First Promoter Platform. All rights reserved.
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
    const greetName = escapeHtml(displayName);
    const expiryText = formatExpiry(expiresAt);
    const inviter = invitedByName?.trim()
      ? `${escapeHtml(invitedByName.trim())} has invited you to `
      : 'You have been invited to ';

    const subject = 'Set up your TeaseMe HQ account';
    const bodyHtml = this.renderActionTemplate({
      heading: `Welcome, ${greetName}!`,
      intro: `${inviter}join the TeaseMe HQ platform. Click the button below to create your password and activate your account.`,
      buttonLabel: 'Set My Password',
      buttonUrl: setupUrl,
      footerNote: `For security, this invite link expires in ${expiryText}. If it expires, ask whoever invited you to send a new one.`,
    });

    const bodyText = `Welcome, ${displayName}!

${inviter.replace(/<[^>]+>/g, '')}join the TeaseMe HQ platform.

Click the link below to set your password and activate your account:
${setupUrl}

This invite link expires in ${expiryText}.

If you weren't expecting this invite, you can safely ignore this email.`;

    return this.sendEmail(email, subject, bodyHtml, bodyText);
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    const { email, firstName, resetUrl, expiresAt } = data;
    const displayName = firstName?.trim() || email.split('@')[0];
    const greetName = escapeHtml(displayName);
    const expiryText = formatExpiry(expiresAt);

    const subject = 'Reset your TeaseMe HQ password';
    const bodyHtml = this.renderActionTemplate({
      heading: `Hi ${greetName},`,
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
