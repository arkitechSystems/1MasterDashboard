# Audit Logging System

This document describes the comprehensive audit logging system implemented for CchdDash to track user activities, login events, and access to sensitive data.

## Overview

The audit logging system automatically records:
- ✅ **Login attempts** (successful and failed)
- ✅ **User management actions** (user creation, password resets)
- ✅ **Data access** (viewing financial data, reports, dashboards)
- ✅ **Data exports** (Excel, PDF exports with record counts)
- ✅ **Security events** (unauthorized access, invalid tokens)
- ✅ **System events** (errors, configuration changes)

All logs include:
- Timestamp (UTC)
- User ID and username
- Event type and category
- IP address
- User agent (browser/device info)
- Status (SUCCESS, FAILURE, WARNING, ERROR)
- Detailed description
- Additional metadata (JSON)

## Database Schema

Audit logs are stored in the `audit_logs` table with the following structure:

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  description TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
```

Indexes are created on `user_id`, `created_at`, and `event_category` for fast queries.

## Event Categories

The system tracks six main categories of events:

1. **AUTHENTICATION** - Login, logout, token verification
2. **USER_MANAGEMENT** - User creation, updates, password resets
3. **DATA_ACCESS** - Viewing financial data, reports, dashboards
4. **SECURITY** - Unauthorized access, suspicious activity
5. **SYSTEM** - Errors, system events
6. **CONFIGURATION** - Configuration changes

## Event Types

### Authentication Events
- `LOGIN_SUCCESS` - Successful login
- `LOGIN_FAILURE` - Failed login attempt
- `LOGOUT` - User logout
- `TOKEN_VERIFY` - Token verification
- `TOKEN_REFRESH` - Token refresh

### User Management Events
- `USER_CREATED` - New user created
- `USER_UPDATED` - User information updated
- `USER_DELETED` - User deleted
- `PASSWORD_RESET` - Password reset
- `PASSWORD_CHANGE` - Password changed

### Data Access Events
- `FINANCIAL_DATA_VIEW` - Financial data accessed
- `DASHBOARD_VIEW` - Dashboard viewed
- `REPORT_GENERATED` - Report generated
- `DATA_EXPORT` - Data exported

### Security Events
- `UNAUTHORIZED_ACCESS` - Unauthorized access attempt
- `INVALID_TOKEN` - Invalid token used
- `SUSPICIOUS_ACTIVITY` - Suspicious activity detected

### System Events
- `SYSTEM_ERROR` - System error occurred
- `CONFIG_CHANGE` - Configuration changed

## Viewing Audit Logs

### Basic Usage

View recent logs (last 7 days, 50 records):
```bash
cd server
npm run view-logs
```

### Filtering Options

**Filter by username:**
```bash
npm run view-logs -- --username Concho1
```

**Filter by event category:**
```bash
npm run view-logs -- --category AUTHENTICATION
```

**Filter by event type:**
```bash
npm run view-logs -- --type LOGIN_FAILURE
```

**Filter by status:**
```bash
npm run view-logs -- --status FAILURE
```

**Show logs from last N days:**
```bash
npm run view-logs -- --days 30
```

**Limit number of results:**
```bash
npm run view-logs -- --limit 100
```

**Show all logs (no date filter):**
```bash
npm run view-logs -- --all
```

### Combined Filters

You can combine multiple filters:

```bash
# Show all failed logins in the last 24 hours
npm run view-logs -- --category AUTHENTICATION --status FAILURE --days 1

# Show all data exports by a specific user
npm run view-logs -- --username Concho1 --type DATA_EXPORT

# Show all security events
npm run view-logs -- --category SECURITY --limit 20
```

### Help

View all available options:
```bash
npm run view-logs -- --help
```

## Example Output

```
════════════════════════════════════════════════════════════════════════════════
                         AUDIT LOG VIEWER
════════════════════════════════════════════════════════════════════════════════
Filtering by category: AUTHENTICATION
Date range: 10/12/2025 to 10/19/2025
Limit: 50 records
════════════════════════════════════════════════════════════════════════════════

Found 3 audit log(s):


✓ [10/19/2025, 10:45:23 AM]
  User: Concho1 (ID: 1)
  Category: AUTHENTICATION
  Event: LOGIN_SUCCESS
  Status: SUCCESS
  Description: User logged in successfully
  IP Address: 127.0.0.1
  User Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0...

────────────────────────────────────────────────────────────────────────────────

✗ [10/19/2025, 10:42:15 AM]
  User: johndoe
  Category: AUTHENTICATION
  Event: LOGIN_FAILURE
  Status: FAILURE
  Description: Failed login attempt: Invalid password
  IP Address: 192.168.1.45
  User Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/118.0...
  Metadata: {"reason":"Invalid password"}
────────────────────────────────────────────────────────────────────────────────

Total: 3 record(s)
```

## Querying Logs Directly with SQLite

For advanced queries, you can use SQLite directly:

```bash
cd server
sqlite3 database.sqlite
```

### Useful SQL Queries

**View all failed login attempts:**
```sql
SELECT created_at, username, ip_address, description
FROM audit_logs
WHERE event_type = 'LOGIN_FAILURE'
ORDER BY created_at DESC
LIMIT 10;
```

**Count logins by user:**
```sql
SELECT username, COUNT(*) as login_count
FROM audit_logs
WHERE event_type = 'LOGIN_SUCCESS'
GROUP BY username
ORDER BY login_count DESC;
```

**Find suspicious activity (multiple failed logins):**
```sql
SELECT username, ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE event_type = 'LOGIN_FAILURE'
  AND created_at >= datetime('now', '-1 hour')
GROUP BY username, ip_address
HAVING attempts >= 3;
```

**View all data exports:**
```sql
SELECT created_at, username, description, metadata
FROM audit_logs
WHERE event_type = 'DATA_EXPORT'
ORDER BY created_at DESC;
```

**Activity by hour:**
```sql
SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as events
FROM audit_logs
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;
```

## Automatic Logging

### What's Automatically Logged

The system automatically logs the following without any additional code:

1. **Every login attempt** (success or failure with reason)
2. **Token verification failures** (unauthorized access)
3. **User creation** (via API or command line)
4. **Password resets** (via command line tool)

### Adding Logging to New Endpoints

To add audit logging to new endpoints, use the provided middleware:

```typescript
import { auditDataAccess, auditExport } from './auditMiddleware';

// Log financial data access
app.get('/api/financial/reports',
  auditDataAccess('Financial Reports'),
  (req, res) => {
    // Your endpoint code
  }
);

// Log data export
app.post('/api/export/excel',
  auditExport('Excel Export'),
  (req, res) => {
    // Your endpoint code
  }
);
```

Or use the logging functions directly:

```typescript
import { logDataAccess, logDataExport } from './auditLogger';

// In your endpoint
const user = req.user; // Assuming you have authentication middleware
await logDataAccess(user.id, user.username, 'Balance Sheet', req);
```

## Security Best Practices

### Regular Review

1. **Daily**: Check for failed login attempts
   ```bash
   npm run view-logs -- --type LOGIN_FAILURE --days 1
   ```

2. **Weekly**: Review all security events
   ```bash
   npm run view-logs -- --category SECURITY --days 7
   ```

3. **Monthly**: Review data exports
   ```bash
   npm run view-logs -- --type DATA_EXPORT --days 30
   ```

### Alerts to Watch For

⚠️ **Immediate attention required:**
- Multiple failed logins from same IP
- Unauthorized access attempts
- Data exports from unusual IP addresses
- Activity outside business hours

⚠️ **Investigate further:**
- Successful login after multiple failures
- Large data exports
- Access to sensitive data from new locations

### Log Retention

Current setup:
- Logs are stored indefinitely in SQLite
- For production, implement log rotation/archival
- Recommended: Keep at least 90 days of logs
- Archive older logs for compliance

### Archiving Logs

Export logs to CSV for archival:
```bash
cd server
sqlite3 database.sqlite <<EOF
.headers on
.mode csv
.output audit_logs_archive_2025.csv
SELECT * FROM audit_logs WHERE created_at < date('now', '-90 days');
.quit
EOF
```

Then delete old logs:
```sql
DELETE FROM audit_logs WHERE created_at < date('now', '-90 days');
```

## Compliance & Privacy

### Data Stored

The audit logs capture:
- ✅ User actions (what they did)
- ✅ Timestamps (when they did it)
- ✅ IP addresses (where they did it from)
- ✅ User agent (what device/browser)
- ❌ NOT logged: Actual data content, passwords, or PII

### HIPAA/Compliance Considerations

If dealing with protected health information:
1. Ensure logs are stored securely
2. Implement access controls (only admins can view)
3. Enable encryption at rest
4. Implement log integrity checking
5. Document log review procedures

## Troubleshooting

### Logs not appearing

**Check database initialization:**
```bash
cd server
sqlite3 database.sqlite "SELECT COUNT(*) FROM audit_logs;"
```

**Check server logs:**
Look for audit log messages in server console:
```
[AUDIT 2025-10-19T10:45:23.123Z] AUTHENTICATION:LOGIN_SUCCESS - Concho1 - SUCCESS - User logged in successfully
```

### View logs shows nothing

**Check date range:**
Use `--all` to see all logs:
```bash
npm run view-logs -- --all --limit 10
```

**Check database file exists:**
```bash
ls server/database.sqlite
```

## Integration Examples

### Frontend Integration

Track dashboard views from React:
```typescript
// Add to your dashboard component
useEffect(() => {
  // This will be logged by the backend when the API is called
  fetch('/api/dashboard/data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}, []);
```

### Custom Events

Log custom events from your code:
```typescript
import { logAudit, AuditEventType, AuditCategory, AuditStatus } from './auditLogger';

await logAudit({
  userId: user.id,
  username: user.username,
  eventType: AuditEventType.REPORT_GENERATED,
  eventCategory: AuditCategory.DATA_ACCESS,
  description: 'Generated monthly financial report',
  ipAddress: getClientIP(req),
  userAgent: req.headers['user-agent'],
  status: AuditStatus.SUCCESS,
  metadata: {
    reportType: 'monthly',
    month: '2025-10'
  }
});
```

## Performance Considerations

- Indexes are created on frequently queried columns
- Async logging doesn't block requests
- Failed audit writes are logged but don't break the app
- Consider moving to dedicated logging service for high volume

## Future Enhancements

Potential improvements:
- [ ] Real-time alerts for suspicious activity
- [ ] Dashboard for visual log analysis
- [ ] Export logs to external SIEM systems
- [ ] Automated anomaly detection
- [ ] Email notifications for critical events
- [ ] Log encryption for sensitive environments

## Support

For questions about audit logging:
- Review this documentation
- Check server console for audit messages
- Contact ArkiTech Systems for assistance
