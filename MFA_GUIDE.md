# Multi-Factor Authentication (MFA) Guide

## Overview

CchdDash now supports **Multi-Factor Authentication (MFA)** using Time-based One-Time Passwords (TOTP). This adds a second layer of security beyond your username and password.

**Compatible with:**
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- LastPass Authenticator
- Any TOTP-compatible authenticator app

## What is MFA?

MFA requires two forms of verification to log in:
1. **Something you know:** Your password
2. **Something you have:** Your phone with an authenticator app

Even if someone steals your password, they can't log in without access to your phone.

## Features

✅ **TOTP-based:** Industry standard 6-digit codes that change every 30 seconds
✅ **QR Code Setup:** Easy setup by scanning a QR code
✅ **Backup Codes:** 10 one-time use codes for account recovery
✅ **Audit Logging:** All MFA events are logged for security
✅ **Optional:** Users can choose to enable MFA

## How It Works

### 1. Setup MFA

**Step 1: Access MFA Setup**
- Log in to your account
- Go to your account settings (My Account page)
- Click "Enable Multi-Factor Authentication"

**Step 2: Scan QR Code**
- A QR code will be displayed
- Open your authenticator app (Google Authenticator, etc.)
- Tap "Add Account" or "+"
- Scan the QR code with your phone's camera

**Step 3: Verify Setup**
- Your authenticator app will show a 6-digit code
- Enter this code to verify setup
- Click "Enable MFA"

**Step 4: Save Backup Codes**
- You'll receive 10 backup codes
- **CRITICAL:** Save these in a secure location!
- Each code can only be used once
- You'll need these if you lose your phone

### 2. Login with MFA

**Normal Login Process:**
1. Enter your username and password
2. Click "Login"
3. You'll be prompted for your MFA code
4. Open your authenticator app
5. Enter the current 6-digit code
6. Click "Verify"

**Login with Backup Code:**
- If you've lost your phone, use a backup code instead
- Enter the backup code in the MFA code field
- The backup code will be used once and discarded

### 3. Disable MFA

**To turn off MFA:**
1. Log in to your account
2. Go to account settings
3. Click "Disable MFA"
4. Enter your password to confirm
5. MFA will be turned off

**⚠️ Warning:** Disabling MFA reduces your account security!

## Backup Codes

### What are Backup Codes?

Backup codes are one-time use codes that let you access your account if you:
- Lose your phone
- Get a new phone
- Can't access your authenticator app
- Authenticator app is not working

### When You Get Backup Codes

You receive 10 backup codes when you:
- First enable MFA
- The codes are shown ONCE - save them immediately!

### How to Store Backup Codes

**✅ DO:**
- Print them and store in a safe
- Save in a password manager
- Write them down and lock in a secure drawer
- Store in encrypted cloud storage

**❌ DON'T:**
- Email them to yourself
- Store in an unencrypted file
- Share them with anyone
- Leave them where others can see

### Using a Backup Code

1. At the MFA prompt, click "Use backup code"
2. Enter one of your backup codes
3. The code will be used and removed from your list
4. You'll have one less backup code available

### Example Backup Codes
```
A3F2-B8D1
C9E4-7A2F
D1B8-3C9E
E7F3-4D8A
...
```

## API Endpoints

### For Developers

**MFA Setup:**
```
POST /api/mfa/setup
Headers: Authorization: Bearer <token>
Response: { secret, qrCode, manualEntryKey }
```

**Enable MFA:**
```
POST /api/mfa/enable
Headers: Authorization: Bearer <token>
Body: { secret, verificationCode }
Response: { success, backupCodes, message }
```

**Disable MFA:**
```
POST /api/mfa/disable
Headers: Authorization: Bearer <token>
Body: { password }
Response: { success, message }
```

**Check MFA Status:**
```
GET /api/mfa/status
Headers: Authorization: Bearer <token>
Response: { mfaEnabled, backupCodesRemaining }
```

**Login with MFA:**
```
POST /api/auth/login
Body: { username, password, mfaToken }
OR
Body: { username, password, backupCode }
```

## Security Features

### Audit Logging

All MFA events are logged:
- MFA setup attempts
- MFA enable/disable actions
- Failed MFA verifications
- Backup code usage
- Login attempts with MFA

View MFA-related logs:
```bash
cd server
npm run view-logs -- --category SECURITY
```

### Failed Attempt Tracking

- Failed MFA codes are logged
- Multiple failures trigger security alerts
- IP addresses are tracked
- All attempts are auditable

### Backup Code Security

- Backup codes are hashed (like passwords)
- Codes are single-use only
- Used codes are immediately removed
- Remaining code count is tracked

## Troubleshooting

### "Invalid MFA code" Error

**Problem:** Code keeps being rejected

**Solutions:**
1. **Time Sync:** Ensure your phone's clock is accurate
   - Go to Settings → Date & Time → Set Automatically
2. **Code Timing:** Enter the code quickly (30-second window)
3. **Try Next Code:** Wait for a new code to appear
4. **Use Backup Code:** If all else fails, use a backup code

### Lost Phone

**Problem:** Can't access authenticator app

**Solution:**
1. Use a backup code to log in
2. Once logged in, disable MFA
3. Set up MFA again with your new phone

### Lost Backup Codes

**Problem:** Lost access to backup codes

**Solutions:**
1. If you can still log in with MFA:
   - Disable MFA
   - Re-enable MFA to get new backup codes
2. If you can't log in:
   - Contact administrator
   - Administrator can reset your account

### Setup QR Code Won't Scan

**Problem:** Can't scan QR code

**Solution:**
1. Try manual entry instead
2. Copy the "Manual Entry Key" shown
3. In your authenticator app, choose "Manual Entry"
4. Enter the key manually

## Best Practices

### For Users

1. **Enable MFA:** Protect your account
2. **Save Backup Codes:** Store them securely
3. **Use Trusted Device:** Only set up MFA on your personal phone
4. **Keep Phone Secure:** Use a strong phone lock screen
5. **Update Apps:** Keep authenticator app updated

### For Administrators

1. **Encourage MFA:** Recommend all users enable it
2. **Educate Users:** Share this guide
3. **Monitor Logs:** Watch for suspicious MFA failures
4. **Have Process:** Document backup code recovery process
5. **Test Regularly:** Verify MFA is working

## Security Considerations

### Why MFA is Important

**Without MFA:**
- Password theft = account compromise
- Phishing can steal passwords
- Brute force attacks possible
- No second layer of defense

**With MFA:**
- Password + phone both needed
- Phishing is much harder
- Brute force won't work
- Multiple layers of security

### MFA vs. SMS

**Why TOTP (not SMS)?**
- SMS can be intercepted
- SIM swapping attacks exist
- TOTP is more secure
- Works without cell service
- Industry best practice

## Recovery Procedures

### User Locked Out

**Scenario:** User lost phone AND backup codes

**Administrator Steps:**
1. Verify user identity (in person, ID check, etc.)
2. Access database directly:
   ```sql
   UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, backup_codes = NULL
   WHERE username = 'locked_user';
   ```
3. Log the action:
   ```bash
   npm run view-logs -- --username locked_user
   ```
4. Require user to:
   - Change password immediately
   - Set up MFA again
   - Save new backup codes

### Emergency Disable

**If MFA system has issues:**

```sql
-- Disable MFA for all users (emergency only!)
UPDATE users SET mfa_enabled = 0;
```

**⚠️ Only use in emergencies!**

## Statistics

View MFA adoption:
```sql
SELECT
  COUNT(*) as total_users,
  SUM(CASE WHEN mfa_enabled = 1 THEN 1 ELSE 0 END) as mfa_enabled,
  ROUND(SUM(CASE WHEN mfa_enabled = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as percentage
FROM users;
```

## Compliance

MFA helps meet requirements for:
- ✅ HIPAA Security Rule
- ✅ SOC 2 compliance
- ✅ PCI DSS (if applicable)
- ✅ NIST 800-53 controls
- ✅ Industry best practices

## Support

### For Users
- Review this guide
- Contact your administrator
- Check the troubleshooting section

### For Administrators
- See SECURITY.md
- Check audit logs
- Review AUDIT_LOGGING.md

## Additional Resources

- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/)
- [OWASP Multi-Factor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- Google Authenticator: [iOS](https://apps.apple.com/app/google-authenticator/id388497605) | [Android](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
- Microsoft Authenticator: [iOS](https://apps.apple.com/app/microsoft-authenticator/id983156458) | [Android](https://play.google.com/store/apps/details?id=com.azure.authenticator)

---

**Implementation Date:** October 19, 2025
**Version:** 1.0
**Status:** ✅ Production Ready
