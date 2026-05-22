# User Roles Documentation

## Overview
The CchdDash application supports four distinct user roles, each with specific permissions and access levels.

## Role Types

### 1. Dashboard (`dashboard`)
**Purpose:** Access to the main financial dashboard and reporting features.

**Permissions:**
- View financial dashboard
- View revenue and expense metrics
- Generate financial reports
- Export data
- View monthly trends
- Access GL transactions

**Restrictions:**
- No access to accounting view
- Cannot perform administrative functions
- No user management capabilities

---

### 2. Accountant (`accountant`)
**Purpose:** Access to accounting-specific views and detailed financial analysis.

**Permissions:**
- View accounting interface
- Access detailed GL transactions
- View and manage accounting records
- Generate accounting-specific reports
- Perform reconciliations

**Restrictions:**
- No access to dashboard view (unless combined with 'both' or 'admin' role)
- Cannot perform administrative functions
- No user management capabilities

---

### 3. Both (`both`)
**Purpose:** Combined access to both dashboard and accounting views.

**Permissions:**
- **All Dashboard permissions**
- **All Accountant permissions**
- Switch between Dashboard and Accounting views
- Full access to financial data across both interfaces

**Restrictions:**
- Cannot perform administrative functions
- No user management capabilities

---

### 4. Admin (`admin`)
**Purpose:** Full administrative access with all permissions across the application.

**Permissions:**
- **All Dashboard permissions**
- **All Accountant permissions**
- **User Management:**
  - Create new users
  - Update user roles
  - Reset user passwords
  - Enable/disable user accounts
  - View audit logs
- **System Configuration:**
  - Access to all system settings
  - View system health and metrics
  - Manage MFA settings for users
- **Security:**
  - View all audit logs
  - Monitor user activity
  - Manage security policies

**Note:** Admin role is intended for system administrators and should be assigned carefully.

---

## Role Hierarchy

```
admin (Full Access)
  ↓
both (Dashboard + Accountant)
  ↓
dashboard | accountant (Specific View Access)
```

## How to Use Roles in Code

### Check if user has a specific role:
```typescript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { hasRole, isAdmin } = useAuth();

  // Check for dashboard access
  if (hasRole('dashboard')) {
    // Show dashboard features
  }

  // Check for accountant access
  if (hasRole('accountant')) {
    // Show accountant features
  }

  // Check for admin access
  if (isAdmin()) {
    // Show admin-only features
  }
}
```

### Role-based component rendering:
```typescript
function AdminPanel() {
  const { isAdmin } = useAuth();

  if (!isAdmin()) {
    return <div>Access Denied</div>;
  }

  return (
    <div>
      {/* Admin features */}
    </div>
  );
}
```

## Creating Users with Roles

### Via API:
```bash
POST /api/auth/register
{
  "username": "john.doe",
  "password": "secure_password",
  "email": "john@example.com",
  "role": "dashboard"  // or "accountant", "both", "admin"
}
```

### Updating User Roles:
```bash
PUT /api/auth/update-role
Authorization: Bearer <token>
{
  "userId": 1,
  "role": "admin"
}
```

## Security Considerations

1. **Admin Role Assignment:**
   - Only assign admin role to trusted personnel
   - Require MFA for all admin accounts
   - Regularly audit admin user activities

2. **Role Changes:**
   - All role changes are logged in the audit system
   - Role changes require authentication
   - Notify users when their roles are modified

3. **Default Role:**
   - New users default to 'both' role
   - Can be changed during user creation
   - Existing users retain their current roles

## Audit Logging

All role-related activities are logged:
- User creation with role
- Role changes (who changed what, when)
- Failed role change attempts
- Admin actions

View audit logs:
```bash
npm run view-logs -- --category USER_MANAGEMENT
```
