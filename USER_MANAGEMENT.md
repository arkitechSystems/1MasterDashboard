# User Management Guide

This guide explains how to manage users for the CchdDash application, including adding new users and resetting forgotten passwords.

## Prerequisites

- Node.js installed
- Backend server dependencies installed (`cd server && npm install`)

## Adding New Users

To create a new user account, use the `create-user` script from the server directory.

### Command Format

```bash
cd server
npm run create-user <username> <password> [email]
```

### Examples

**Create a user with username and password:**
```bash
cd server
npm run create-user johndoe SecurePass123
```

**Create a user with email:**
```bash
cd server
npm run create-user janedoe SecurePass456 jane@example.com
```

### Success Output

```
✓ User created successfully!
  Username: johndoe
  Email: N/A
  Created: 2025-10-19 12:34:56
```

### Error Handling

If the username already exists, you'll see:
```
✗ Error creating user: UNIQUE constraint failed
  Username already exists!
```

## Resetting Forgotten Passwords

When a user forgets their password, you can reset it using the `reset-password` script.

### Command Format

```bash
cd server
npm run reset-password <username> <new-password>
```

### Examples

**Reset password for existing user:**
```bash
cd server
npm run reset-password johndoe NewSecurePass789
```

### Success Output

```
✓ Password reset successfully!
  Username: johndoe
  New password has been set
```

### Error Handling

If the user doesn't exist, you'll see:
```
✗ User "johndoe" not found!
```

## Default Account

The application comes with a default admin account:

- **Username:** `Concho1`
- **Password:** `password`

**Important:** Change this password in production!

## Listing All Users

To view all users in the database, you can use SQLite directly:

```bash
cd server
sqlite3 database.sqlite "SELECT id, username, email, created_at FROM users;"
```

Or for a formatted output:
```bash
cd server
sqlite3 database.sqlite ".mode column" ".headers on" "SELECT id, username, email, created_at FROM users;"
```

## Security Best Practices

1. **Strong Passwords**
   - Use at least 12 characters
   - Mix uppercase, lowercase, numbers, and special characters
   - Avoid common words or patterns

2. **Password Storage**
   - All passwords are automatically hashed using bcrypt with 10 salt rounds
   - Never store plain-text passwords

3. **Production Environment**
   - Change the default admin password immediately
   - Use a strong JWT_SECRET in your `.env` file
   - Enable HTTPS (Render provides free SSL)

## Troubleshooting

### "Command not found" error
Make sure you're in the `server` directory:
```bash
cd server
npm run create-user username password
```

### Database locked error
If the backend server is running, stop it first before running user management commands:
- Windows: Press Ctrl+C in the terminal running the server
- Or use: `taskkill /F /IM node.exe` (kills all Node processes)

### Cannot find module errors
Install dependencies first:
```bash
cd server
npm install
```

## Database Location

The SQLite database is stored at:
```
server/database.sqlite
```

**Backup the database regularly** to prevent data loss, especially before making bulk changes.

## Advanced: Direct Database Access

If you need to perform advanced user management, you can use SQLite directly:

```bash
cd server
sqlite3 database.sqlite
```

Then run SQL commands:
```sql
-- View all users
SELECT * FROM users;

-- Delete a user
DELETE FROM users WHERE username = 'olduser';

-- Update email
UPDATE users SET email = 'newemail@example.com' WHERE username = 'johndoe';
```

Type `.exit` to leave the SQLite shell.

## Support

For issues or questions about user management, contact ArkiTech Systems.
