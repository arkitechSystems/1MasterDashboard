import nodemailer from 'nodemailer';
import crypto from 'crypto';

/**
 * Email 2FA Service
 *
 * Sends time-limited codes via email as an alternative to authenticator apps
 */

// In-memory store for email codes (in production, use Redis or database)
interface EmailCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

const emailCodes = new Map<string, EmailCode>();

// Email configuration
const createTransporter = () => {
  // For development, use a test account or configure your SMTP
  // For production, use your actual email service

  if (process.env.EMAIL_HOST) {
    // Production: Use configured SMTP
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  } else {
    // Development: Log to console (no actual email sent)
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    });
  }
};

/**
 * Generate a 6-digit code
 */
const generateEmailCode = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Send 2FA code via email
 */
export const sendEmailCode = async (email: string, username: string): Promise<{ success: boolean; message: string }> => {
  try {
    // Generate code
    const code = generateEmailCode();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

    // Store code
    emailCodes.set(email, {
      code,
      expiresAt,
      attempts: 0
    });

    // Create email
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'CchdDash Security <noreply@cchddash.com>',
      to: email,
      subject: 'Your CchdDash Verification Code',
      text: `
Hello ${username},

Your verification code is: ${code}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email and ensure your account is secure.

- CchdDash Security Team
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .code-box { background: #f4f4f4; border: 2px solid #2c3e50; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; }
    .warning { color: #e74c3c; font-size: 14px; margin-top: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Your Verification Code</h2>
    <p>Hello ${username},</p>
    <p>Your CchdDash verification code is:</p>
    <div class="code-box">${code}</div>
    <p><strong>This code will expire in 10 minutes.</strong></p>
    <div class="warning">
      <p>⚠️ If you didn't request this code, please ignore this email and ensure your account is secure.</p>
    </div>
    <div class="footer">
      <p>CchdDash Security Team<br>
      This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    // In development, log the code
    if (!process.env.EMAIL_HOST) {
      console.log('\n' + '='.repeat(60));
      console.log('EMAIL 2FA CODE (Development Mode)');
      console.log('='.repeat(60));
      console.log(`To: ${email}`);
      console.log(`Username: ${username}`);
      console.log(`Code: ${code}`);
      console.log(`Expires: ${new Date(expiresAt).toLocaleString()}`);
      console.log('='.repeat(60) + '\n');
    }

    return {
      success: true,
      message: 'Verification code sent to your email'
    };
  } catch (error) {
    console.error('Email send error:', error);
    return {
      success: false,
      message: 'Failed to send verification code'
    };
  }
};

/**
 * Verify email code
 */
export const verifyEmailCode = (email: string, code: string): { valid: boolean; message: string } => {
  const storedCode = emailCodes.get(email);

  if (!storedCode) {
    return {
      valid: false,
      message: 'No code found. Please request a new code.'
    };
  }

  // Check expiration
  if (Date.now() > storedCode.expiresAt) {
    emailCodes.delete(email);
    return {
      valid: false,
      message: 'Code expired. Please request a new code.'
    };
  }

  // Check attempts
  if (storedCode.attempts >= 3) {
    emailCodes.delete(email);
    return {
      valid: false,
      message: 'Too many failed attempts. Please request a new code.'
    };
  }

  // Verify code
  if (storedCode.code !== code) {
    storedCode.attempts++;
    return {
      valid: false,
      message: `Invalid code. ${3 - storedCode.attempts} attempts remaining.`
    };
  }

  // Code is valid - remove it
  emailCodes.delete(email);

  return {
    valid: true,
    message: 'Code verified successfully'
  };
};

/**
 * Clear expired codes (run periodically)
 */
export const clearExpiredCodes = () => {
  const now = Date.now();
  for (const [email, codeData] of emailCodes.entries()) {
    if (now > codeData.expiresAt) {
      emailCodes.delete(email);
    }
  }
};

// Clear expired codes every 5 minutes
setInterval(clearExpiredCodes, 5 * 60 * 1000);

/**
 * Send support ticket email
 */
export const sendSupportTicket = async (
  ticketNumber: string,
  subject: string,
  message: string,
  userEmail?: string,
  username?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const transporter = createTransporter();

    const timestamp = new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'CchdDash Support <noreply@cchddash.com>',
      to: 'arkitechcloud@gmail.com',
      replyTo: userEmail || undefined,
      subject: `Support Ticket #${ticketNumber}: ${subject}`,
      text: `
Support Ticket #${ticketNumber}

Subject: ${subject}

Submitted By: ${username || 'Unknown User'}
${userEmail ? `Email: ${userEmail}` : ''}
Date: ${timestamp}

Message:
${message}

---
Submitted from CchdDash Financial Dashboard
      `,
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(145deg, #2c3e50, #1abc9c); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .ticket-number { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .info-box { background: #f8f9fa; padding: 15px; border-left: 4px solid #1abc9c; margin: 20px 0; }
    .message-box { background: #fff; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    .label { font-weight: bold; color: #2c3e50; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="ticket-number">Support Ticket #${ticketNumber}</div>
      <div>${subject}</div>
    </div>
    <div class="content">
      <div class="info-box">
        <p><span class="label">Submitted By:</span> ${username || 'Unknown User'}</p>
        ${userEmail ? `<p><span class="label">Email:</span> ${userEmail}</p>` : ''}
        <p><span class="label">Date:</span> ${timestamp}</p>
      </div>

      <h3>Message:</h3>
      <div class="message-box">
        ${message.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}
      </div>

      <div class="footer">
        <p>Submitted from CchdDash Financial Dashboard<br>
        This is an automated message from the support ticket system.</p>
      </div>
    </div>
  </div>
</body>
</html>
      `
    };

    await transporter.sendMail(mailOptions);

    // In development, log ticket details
    if (!process.env.EMAIL_HOST) {
      console.log('\n' + '='.repeat(60));
      console.log('SUPPORT TICKET (Development Mode)');
      console.log('='.repeat(60));
      console.log(`Ticket #${ticketNumber}`);
      console.log(`Subject: ${subject}`);
      console.log(`From: ${username || 'Unknown'} ${userEmail ? `(${userEmail})` : ''}`);
      console.log(`Date: ${timestamp}`);
      console.log('Message:');
      console.log(message);
      console.log('='.repeat(60) + '\n');
    }

    return {
      success: true,
      message: 'Support ticket submitted successfully'
    };
  } catch (error) {
    console.error('Support ticket email error:', error);
    return {
      success: false,
      message: 'Failed to submit support ticket'
    };
  }
};

export default {
  sendEmailCode,
  verifyEmailCode,
  clearExpiredCodes,
  sendSupportTicket
};
