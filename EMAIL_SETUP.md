# Email Setup Guide

This guide explains how to configure email functionality for support tickets and MFA.

## Overview

The application uses email for:
1. **Support Tickets** - Sends submitted tickets to arkitechcloud@gmail.com
2. **MFA via Email** - Sends verification codes for two-factor authentication

## Local Development

By default, emails are **NOT sent** in development mode. Instead, they are logged to the console.

### Testing Email Functionality Locally

1. Start the backend server:
   ```bash
   npm run server
   ```

2. Submit a ticket from the dashboard
3. Check the terminal output - you'll see the ticket details printed:
   ```
   ============================================================
   SUPPORT TICKET (Development Mode)
   ============================================================
   Ticket #123456
   Subject: Test Issue
   From: Username (user@example.com)
   Date: 10/20/2025 02:30PM
   Message:
   This is a test ticket
   ============================================================
   ```

This allows you to test the ticket submission flow without sending actual emails.

---

## Production Email Setup

For production deployment, you need to configure SMTP email settings.

### Option 1: Gmail (Recommended for arkitechcloud@gmail.com)

#### Step 1: Enable 2-Step Verification

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security**
3. Enable **2-Step Verification** if not already enabled

#### Step 2: Generate App Password

1. Go to **App Passwords**: https://myaccount.google.com/apppasswords
2. Select **Mail** as the app
3. Select **Other (Custom name)** as the device
4. Enter name: "CchdDash Server"
5. Click **Generate**
6. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

#### Step 3: Configure Environment Variables

In your production environment (Render.com dashboard), set these variables:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=arkitechcloud@gmail.com
EMAIL_PASSWORD=your-app-password-here
EMAIL_FROM=CchdDash Support <noreply@cchddash.com>
```

**Important Notes:**
- Use the **App Password**, NOT your regular Gmail password
- Remove all spaces from the app password (e.g., `abcdefghijklmnop`)
- Keep EMAIL_SECURE=false with PORT=587 (uses STARTTLS)

---

### Option 2: SendGrid (Alternative)

SendGrid offers 100 free emails per day.

#### Step 1: Create SendGrid Account

1. Sign up at https://sendgrid.com/
2. Verify your email address
3. Complete Single Sender Verification for your email

#### Step 2: Create API Key

1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name: "CchdDash Server"
4. Permissions: **Full Access**
5. Copy the API key

#### Step 3: Configure Environment Variables

```
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key-here
EMAIL_FROM=CchdDash Support <noreply@yourdomain.com>
```

**Note:** The username is literally the word "apikey"

---

### Option 3: Other SMTP Providers

You can use any SMTP service:
- **Mailgun** - 5,000 free emails/month
- **Amazon SES** - Pay as you go
- **Microsoft 365** - If you have a business email

Configuration template:
```
EMAIL_HOST=smtp.yourprovider.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-username
EMAIL_PASSWORD=your-password
EMAIL_FROM=Your Name <your-email@domain.com>
```

---

## Deployment to Render.com

### Adding Environment Variables

1. Go to your **Web Service** on Render.com
2. Navigate to **Environment** tab
3. Add the email variables listed above
4. Click **Save Changes**
5. Render will automatically redeploy with new settings

### Verifying Email Works

1. After deployment completes, log into your application
2. Go to **Support** → **Submit a Ticket**
3. Fill out the form and submit
4. Check arkitechcloud@gmail.com inbox
5. You should receive the ticket email within seconds

---

## Testing in Production

### Test Support Ticket Email

1. Log into deployed application
2. Submit a test ticket:
   - Subject: "Test Email Configuration"
   - Message: "Testing email functionality in production"
3. Check arkitechcloud@gmail.com for the ticket
4. Verify all information is formatted correctly

### Test MFA Email (if using email 2FA)

1. Enable MFA for a test user
2. Choose "Email" as MFA method
3. Try to log in
4. Verify code is received via email

---

## Troubleshooting

### Email Not Sending in Production

**Check 1: Verify environment variables are set**
```bash
# In Render.com dashboard, check Environment tab
# Make sure EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD are set
```

**Check 2: Check server logs**
```bash
# In Render.com, go to Logs tab
# Look for email-related errors
```

**Check 3: Verify SMTP credentials**
- For Gmail: Make sure you're using App Password, not regular password
- For SendGrid: Verify API key is correct
- Test credentials with a mail client

### Gmail "Less Secure App" Error

**Solution:** Use App Password instead of regular password
- Regular Gmail passwords won't work
- You MUST use an App Password generated from Google Account settings

### Port 465 vs 587

- **Port 587** (recommended): Uses STARTTLS, set `EMAIL_SECURE=false`
- **Port 465**: Uses SSL/TLS, set `EMAIL_SECURE=true`

Most providers work best with port 587.

### Email Going to Spam

If tickets arrive in spam folder:

1. **For Gmail sending to Gmail:**
   - Add sender to contacts
   - Mark first email as "Not Spam"

2. **For production:**
   - Use a verified domain email in EMAIL_FROM
   - Set up SPF/DKIM records (advanced)

---

## Security Best Practices

### Environment Variables

✅ **DO:**
- Store email credentials in environment variables
- Use App Passwords for Gmail (never regular password)
- Rotate credentials periodically
- Use different credentials for dev/staging/production

❌ **DON'T:**
- Commit email passwords to git
- Share credentials in Slack/email
- Use the same password for multiple services
- Store credentials in code

### Gmail App Password Security

- Each app should have its own App Password
- Revoke unused App Passwords regularly
- If compromised, revoke and generate new one immediately

---

## Email Configuration Reference

### Development (.env not set)
```
EMAIL_HOST=                    # Not set
EMAIL_PORT=                    # Not set
EMAIL_USER=                    # Not set
EMAIL_PASSWORD=                # Not set

Result: Emails logged to console, not sent
```

### Production (Render.com)
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=arkitechcloud@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_FROM=CchdDash Support <noreply@cchddash.com>

Result: Emails sent via Gmail to arkitechcloud@gmail.com
```

---

## Gmail Setup Checklist

For setting up arkitechcloud@gmail.com:

- [ ] Log into Google Account
- [ ] Enable 2-Step Verification
- [ ] Generate App Password for "CchdDash Server"
- [ ] Copy 16-character app password
- [ ] Remove spaces from password
- [ ] Add to Render.com environment variables:
  - [ ] EMAIL_HOST=smtp.gmail.com
  - [ ] EMAIL_PORT=587
  - [ ] EMAIL_SECURE=false
  - [ ] EMAIL_USER=arkitechcloud@gmail.com
  - [ ] EMAIL_PASSWORD=(your app password)
  - [ ] EMAIL_FROM=CchdDash Support <noreply@cchddash.com>
- [ ] Save and wait for redeploy
- [ ] Test by submitting a ticket
- [ ] Verify email received at arkitechcloud@gmail.com

---

## Support Ticket Email Format

When a ticket is submitted, arkitechcloud@gmail.com receives:

**Subject:** `Support Ticket #123456: Brief description`

**Body:**
```
Support Ticket #123456

Subject: Brief description

Submitted By: Username
Email: user@example.com (if available)
Date: 10/20/2025 02:30PM

Message:
User's detailed message here...

---
Submitted from CchdDash Financial Dashboard
```

The email includes:
- Ticket number for reference
- User's subject line
- Submitter username and email
- Timestamp
- Full message content
- Professional HTML formatting

---

## Files Modified for Email Support

- `server/src/emailService.ts` - Email sending functions
- `server/src/server.ts` - Ticket submission endpoint
- `src/components/SubmitTicket.tsx` - Frontend ticket form
- `src/config.ts` - API endpoint configuration
- `server/.env.example` - Email configuration template
- `EMAIL_SETUP.md` - This documentation

---

## Need Help?

If you encounter issues setting up email:

1. Check server logs in Render.com dashboard
2. Verify all environment variables are set correctly
3. Test SMTP credentials with a mail client
4. Review this guide's troubleshooting section
5. Check Google Account settings if using Gmail

---

## Quick Reference

### Test Locally (no email sent)
```bash
npm run server    # Backend
npm start         # Frontend
# Submit ticket - check console for output
```

### Deploy to Production
```bash
1. Set email environment variables in Render.com
2. Deploy application
3. Submit test ticket
4. Check arkitechcloud@gmail.com inbox
```

### Gmail App Password Link
https://myaccount.google.com/apppasswords
