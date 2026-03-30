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

export class EmailService {
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
