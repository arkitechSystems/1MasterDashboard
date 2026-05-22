# Security & Audit Documentation

This document outlines the security features and audit capabilities of the CchdDash application.

## Security Features

### 1. Authentication & Authorization

**JWT-Based Authentication:**
- All API requests require valid JWT tokens
- Tokens expire after 24 hours
- Tokens are signed with a secret key (configurable in `.env`)

**Password Security:**
- Passwords are hashed using bcrypt with 10 salt rounds
- Plain-text passwords are never stored
- Passwords can be reset by administrators

**Default Credentials:**
- Username: `Concho1`
- Password: `password`
- ⚠️ **MUST be changed in production!**

### 2. Audit Logging

**Comprehensive Activity Tracking:**
- All login attempts (successful and failed)
- User management actions
- Data access and exports
- Security events
- System errors

**What's Logged:**
- User ID and username
- Timestamp (UTC)
- IP address
- User agent (browser/device)
- Event type and category
- Status (success/failure)
- Detailed description
- Additional metadata

**See [AUDIT_LOGGING.md](AUDIT_LOGGING.md) for complete details.**

### 3. Data Access Controls

**Authentication Required:**
- All dashboard and financial data endpoints require authentication
- Invalid or missing tokens return 401 Unauthorized
- Unauthorized access attempts are logged

**Token Verification:**
- Tokens are verified on every request
- Expired tokens are rejected
- Invalid tokens trigger security alerts

### 4. Network Security

**CORS Configuration:**
- Cross-Origin Resource Sharing (CORS) enabled
- Can be restricted to specific domains in production

**IP Tracking:**
- All requests log IP addresses
- Enables tracking of suspicious activity
- Helps identify unauthorized access attempts

## Regular Security Tasks

### Daily Monitoring

**Check for failed login attempts:**
```bash
cd server
npm run view-logs -- --type LOGIN_FAILURE --days 1
```

**Review unauthorized access:**
```bash
npm run view-logs -- --category SECURITY --days 1
```

### Weekly Review

**Check all security events:**
```bash
npm run view-logs -- --category SECURITY --days 7
```

**Review data exports:**
```bash
npm run view-logs -- --type DATA_EXPORT --days 7
```

**Check user activity:**
```bash
npm run view-logs -- --limit 100 --days 7
```

### Monthly Tasks

**Review user accounts:**
```bash
cd server
sqlite3 database.sqlite "SELECT username, email, created_at FROM users;"
```

**Archive old audit logs:**
```bash
# Export logs older than 90 days
sqlite3 database.sqlite <<EOF
.headers on
.mode csv
.output audit_archive_$(date +%Y%m).csv
SELECT * FROM audit_logs WHERE created_at < date('now', '-90 days');
.quit
EOF
```

**Check for suspicious patterns:**
```bash
# Multiple failed logins
npm run view-logs -- --type LOGIN_FAILURE --days 30 --limit 200
```

## Security Alerts

### Immediate Action Required

🚨 **Multiple Failed Login Attempts**
- Query: `npm run view-logs -- --type LOGIN_FAILURE --days 1`
- Action: Investigate IP address, consider blocking if malicious
- Document in incident log

🚨 **Unauthorized Access Attempts**
- Query: `npm run view-logs -- --type UNAUTHORIZED_ACCESS`
- Action: Review source IP, check for patterns
- Consider implementing IP blocking

🚨 **After-Hours Access**
- Query: Review audit logs for activity outside business hours
- Action: Verify legitimate use, investigate if suspicious

### Investigate Further

⚠️ **Large Data Exports**
- Query: `npm run view-logs -- --type DATA_EXPORT`
- Action: Verify user authorization and business need

⚠️ **Access from New Locations**
- Query: Review IP addresses in audit logs
- Action: Confirm with user if access from unexpected location

⚠️ **Successful Login After Multiple Failures**
- Query: Combine LOGIN_FAILURE and LOGIN_SUCCESS queries
- Action: May indicate compromised credentials

## User Management Security

### Adding Users

Only administrators should create new users:
```bash
cd server
npm run create-user <username> <strong-password> <email>
```

**Password Requirements (Recommended):**
- Minimum 12 characters
- Mix of uppercase and lowercase
- Include numbers and special characters
- No dictionary words
- No personal information

**Example strong password:** `K9$mPz2@Qw7L`

### Resetting Passwords

When users forget passwords:
```bash
cd server
npm run reset-password <username> <new-password>
```

**Action is logged:**
```bash
npm run view-logs -- --type PASSWORD_RESET
```

### Removing Users

Currently requires direct database access:
```bash
cd server
sqlite3 database.sqlite
DELETE FROM users WHERE username = 'olduser';
.quit
```

**Note:** Consider implementing soft deletes for audit trail.

## Incident Response

### Suspected Breach

1. **Immediately change compromised credentials:**
   ```bash
   npm run reset-password <compromised-username> <new-strong-password>
   ```

2. **Review all audit logs for suspicious activity:**
   ```bash
   npm run view-logs -- --username <compromised-username> --days 30
   ```

3. **Check for unauthorized data exports:**
   ```bash
   npm run view-logs -- --type DATA_EXPORT --username <compromised-username>
   ```

4. **Document the incident:**
   - What was accessed
   - When it occurred
   - Who was affected
   - Actions taken

5. **Notify relevant parties:**
   - Management
   - IT security team
   - Affected users (if applicable)

### Failed Login Flood

If seeing many failed login attempts:

1. **Identify the source:**
   ```bash
   npm run view-logs -- --type LOGIN_FAILURE --days 1
   ```

2. **Check if from single IP:**
   ```sql
   sqlite3 database.sqlite <<EOF
   SELECT ip_address, COUNT(*) as attempts
   FROM audit_logs
   WHERE event_type = 'LOGIN_FAILURE'
     AND created_at >= datetime('now', '-1 hour')
   GROUP BY ip_address
   ORDER BY attempts DESC;
   EOF
   ```

3. **Consider implementing rate limiting** (future enhancement)

## Production Security Checklist

Before deploying to production:

### Must Do
- [ ] Change default admin password (`Concho1`)
- [ ] Set strong JWT_SECRET in `server/.env`
- [ ] Enable HTTPS (Render provides free SSL)
- [ ] Restrict CORS to your domain only
- [ ] Review all user accounts
- [ ] Set up regular log review schedule
- [ ] Backup database regularly

### Should Do
- [ ] Implement rate limiting on login endpoint
- [ ] Add password complexity requirements
- [ ] Implement account lockout after failed attempts
- [ ] Set up automated security alerts
- [ ] Enable database encryption at rest
- [ ] Implement session timeout
- [ ] Add two-factor authentication (future)

### Nice to Have
- [ ] Integrate with SIEM system
- [ ] Automated anomaly detection
- [ ] Real-time security dashboard
- [ ] Penetration testing
- [ ] Security audit by third party

## Compliance Considerations

### Data Retention

**Audit Logs:**
- Recommended: 90 days minimum
- Consider: Legal/regulatory requirements
- Archive older logs for compliance

**User Data:**
- Document data retention policies
- Implement data deletion procedures
- Maintain audit trail of deletions

### Access Controls

**Principle of Least Privilege:**
- Users should only access data they need
- Future: Implement role-based access control (RBAC)
- Review access permissions regularly

### Privacy

**Personal Information:**
- Audit logs contain: usernames, IPs, user agents
- Do NOT log: passwords, sensitive data content
- Comply with privacy regulations (GDPR, CCPA, etc.)

## Security Contact

For security issues or questions:
- **Immediate threats:** Contact IT security team
- **General questions:** ArkiTech Systems
- **Incident reporting:** Follow incident response procedure

## Security Updates

### Change Log

**2025-10-19:**
- ✅ Implemented comprehensive audit logging
- ✅ Added login attempt tracking
- ✅ Added unauthorized access detection
- ✅ Created audit log viewer utility
- ✅ Added IP address tracking
- ✅ Documented security procedures

### Planned Enhancements

- [ ] Rate limiting on authentication endpoints
- [ ] Account lockout after failed attempts
- [ ] Real-time security alerts via email
- [ ] Two-factor authentication
- [ ] Role-based access control
- [ ] Automated security reports
- [ ] Session management improvements

## Additional Resources

- [AUDIT_LOGGING.md](AUDIT_LOGGING.md) - Complete audit logging guide
- [USER_MANAGEMENT.md](USER_MANAGEMENT.md) - User account management
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment and configuration
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Common commands

## Support

For security assistance:
- Review documentation first
- Check audit logs for evidence
- Contact ArkiTech Systems for guidance
- Document all security incidents
