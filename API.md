# MJ First Promoter - API Documentation

Complete API reference for the MJ First Promoter platform.

## Base URL

```
http://localhost:5000/api
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

Get the token from the login or register endpoints.

## Response Format

### Success Response
```json
{
  "data": { ... },
  "message": "Success message (optional)"
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": { ... } // Optional validation errors
}
```

---

## Authentication Endpoints

### Register User

Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "inviteCode": "ABC123XYZ" // Optional
}
```

**Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "PROMOTER",
    "userType": "PROMOTER",
    "createdAt": "2026-03-09T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "message": "Registration successful"
}
```

### Login

Authenticate and receive JWT token.

**Endpoint:** `POST /api/auth/login`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "PROMOTER",
    "userType": "PROMOTER"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Get Current User

Get authenticated user's profile.

**Endpoint:** `GET /api/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "PROMOTER",
    "userType": "PROMOTER",
    "isActive": true,
    "createdAt": "2026-03-09T..."
  },
  "typeDetails": {
    "userId": "clx...",
    "userType": "promoter",
    "isAccountManager": false,
    "isTeamLeader": false,
    "isPromoter": true,
    "isAdmin": false,
    "invitedByAdmin": false,
    "hasDownline": false,
    "totalReferrals": 0,
    "totalCustomers": 0
  }
}
```

---

## Campaign Endpoints

### Get All Campaigns

Get campaigns based on user role (filtered automatically).

**Endpoint:** `GET /api/campaigns`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "campaigns": [
    {
      "id": "clx...",
      "name": "Launch Campaign 2026",
      "description": "Main product launch...",
      "websiteUrl": "https://example.com",
      "commissionRate": 15.0,
      "secondaryRate": 5.0,
      "isActive": true,
      "startDate": "2026-03-09T...",
      "endDate": null,
      "createdAt": "2026-03-09T...",
      "manager": {
        "id": "clx...",
        "email": "yoda@example.com",
        "firstName": "Sophie",
        "lastName": "Manager"
      },
      "_count": {
        "referrals": 42,
        "commissions": 15
      }
    }
  ]
}
```

### Create Campaign

Create a new campaign (superuser only).

**Endpoint:** `POST /api/campaigns`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "name": "Summer Campaign 2026",
  "description": "Seasonal promotion",
  "websiteUrl": "https://example.com/summer",
  "commissionRate": 20.0,
  "secondaryRate": 10.0,
  "managerId": "clx..." // Optional
}
```

**Response:**
```json
{
  "campaign": {
    "id": "clx...",
    "name": "Summer Campaign 2026",
    "websiteUrl": "https://example.com/summer",
    "commissionRate": 20.0,
    "secondaryRate": 10.0,
    "isActive": true,
    "createdAt": "2026-03-09T..."
  }
}
```

### Get Campaign by ID

Get detailed campaign information.

**Endpoint:** `GET /api/campaigns/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "campaign": {
    "id": "clx...",
    "name": "Launch Campaign 2026",
    "description": "...",
    "websiteUrl": "https://example.com",
    "commissionRate": 15.0,
    "secondaryRate": 5.0,
    "isActive": true,
    "referrals": [...],
    "_count": {
      "referrals": 42,
      "commissions": 15
    }
  }
}
```

### Get Campaign Statistics

Get performance metrics for a campaign.

**Endpoint:** `GET /api/campaigns/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "stats": {
    "totalReferrals": 42,
    "activeReferrals": 38,
    "totalCommissions": 12500.00,
    "paidCommissions": 8000.00,
    "unpaidCommissions": 4500.00,
    "trackingLinks": 15
  }
}
```

### Update Campaign

Update campaign details (superuser only).

**Endpoint:** `PUT /api/campaigns/:id`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "name": "Updated Campaign Name",
  "isActive": false,
  "commissionRate": 18.0
}
```

### Assign Campaign to Manager

Assign or reassign campaign to account manager (superuser only).

**Endpoint:** `POST /api/campaigns/:id/assign`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "managerId": "clx..."
}
```

---

## Referral Endpoints

### Create Referral Invite

Generate a referral invite link.

**Endpoint:** `POST /api/referrals/create`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "campaignId": "clx...",
  "email": "influencer@example.com" // Optional
}
```

**Response:**
```json
{
  "referral": {
    "id": "clx...",
    "inviteCode": "ABC123XYZ",
    "campaignId": "clx...",
    "level": 1,
    "status": "PENDING",
    "campaign": {
      "name": "Launch Campaign 2026",
      "commissionRate": 15.0
    }
  },
  "inviteUrl": "http://localhost:3000/register?invite=ABC123XYZ",
  "inviteCode": "ABC123XYZ",
  "message": "Referral invite created successfully"
}
```

### Get Referral by Invite Code

Get referral details by invite code (public endpoint).

**Endpoint:** `GET /api/referrals/invite/:inviteCode`

**Response:**
```json
{
  "referral": {
    "id": "clx...",
    "inviteCode": "ABC123XYZ",
    "level": 1,
    "campaign": {
      "id": "clx...",
      "name": "Launch Campaign 2026",
      "websiteUrl": "https://example.com",
      "commissionRate": 15.0
    },
    "referrer": {
      "firstName": "Sophie",
      "lastName": "Manager",
      "email": "manager@example.com"
    }
  }
}
```

### Get My Referrals

Get all referrals created by current user.

**Endpoint:** `GET /api/referrals/my-referrals`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "referrals": [
    {
      "id": "clx...",
      "inviteCode": "ABC123XYZ",
      "level": 1,
      "status": "ACTIVE",
      "campaign": {
        "name": "Launch Campaign 2026",
        "commissionRate": 15.0
      },
      "referredUser": {
        "email": "yoda@example.com",
        "firstName": "Yoda",
        "lastName": "Master"
      },
      "childReferrals": [...],
      "commissions": [...]
    }
  ],
  "totalEarnings": 1250.00,
  "totalReferrals": 15,
  "activeReferrals": 12
}
```

### Generate Tracking Link

Create a tracking link for a campaign.

**Endpoint:** `POST /api/referrals/tracking-link`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "campaignId": "clx..."
}
```

**Response:**
```json
{
  "trackingLink": {
    "id": "clx...",
    "shortCode": "X7K9P2M1",
    "fullUrl": "http://localhost:5000/track/X7K9P2M1",
    "clicks": 0,
    "campaign": {
      "name": "Launch Campaign 2026",
      "websiteUrl": "https://example.com"
    }
  },
  "message": "Tracking link created successfully"
}
```

### Get My Tracking Links

Get all tracking links for current user.

**Endpoint:** `GET /api/referrals/tracking-links/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "trackingLinks": [
    {
      "id": "clx...",
      "shortCode": "X7K9P2M1",
      "fullUrl": "http://localhost:5000/track/X7K9P2M1",
      "clicks": 42,
      "createdAt": "2026-03-09T...",
      "campaign": {
        "name": "Launch Campaign 2026",
        "websiteUrl": "https://example.com"
      },
      "_count": {
        "clickTracking": 42
      }
    }
  ]
}
```

---

## User Endpoints

### Create Account Manager

Create a new account manager (superuser only).

**Endpoint:** `POST /api/users/account-manager`

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "email": "newmanager@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

**Response:**
```json
{
  "user": {
    "id": "clx...",
    "email": "newmanager@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "ADMIN",
    "userType": "ADMIN",
    "createdAt": "2026-03-09T..."
  },
  "message": "Account manager created successfully"
}
```

### Get All Users

Get all users (superuser only).

**Endpoint:** `GET /api/users`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `role` - Filter by role (ADMIN, PROMOTER)
- `search` - Search by email, first name, or last name

**Response:**
```json
{
  "users": [
    {
      "id": "clx...",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "PROMOTER",
      "userType": "TEAM_MANAGER",
      "isActive": true,
      "createdAt": "2026-03-09T...",
      "stats": {
        "totalReferrals": 15,
        "activeReferrals": 12,
        "totalEarnings": 2500.00,
        "pendingEarnings": 500.00
      }
    }
  ]
}
```

### Get Account Managers

Get all account managers (superuser only).

**Endpoint:** `GET /api/users/role/account-managers`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "managers": [
    {
      "id": "clx...",
      "email": "manager@example.com",
      "firstName": "Sophie",
      "lastName": "Manager",
      "createdAt": "2026-03-09T...",
      "_count": {
        "managedCampaigns": 3
      }
    }
  ]
}
```

---

## Dashboard Endpoints

### Get Dashboard Statistics

Get role-specific dashboard stats.

**Endpoint:** `GET /api/dashboard/stats`

**Headers:** `Authorization: Bearer <token>`

**Response (Influencer):**
```json
{
  "stats": {
    "totalReferrals": 15,
    "activeReferrals": 12,
    "totalEarnings": 1250.00,
    "paidEarnings": 800.00,
    "pendingEarnings": 450.00,
    "trackingLinks": 5
  }
}
```

**Response (Account Manager):**
```json
{
  "stats": {
    "managedCampaigns": 3,
    "totalReferrals": 150,
    "activeReferrals": 120,
    "totalInfluencers": 45,
    "totalCommissions": 15000.00
  }
}
```

**Response (Admin):**
```json
{
  "stats": {
    "totalCampaigns": 10,
    "activeCampaigns": 8,
    "totalManagers": 5,
    "totalInfluencers": 150,
    "totalReferrals": 500,
    "activeReferrals": 420,
    "totalCommissions": 50000.00
  }
}
```

### Get Earnings

Get user's commission earnings.

**Endpoint:** `GET /api/dashboard/earnings`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "commissions": [
    {
      "id": "clx...",
      "amount": 150.00,
      "percentage": 15.0,
      "status": "paid",
      "createdAt": "2026-03-09T...",
      "paidAt": "2026-03-10T...",
      "campaign": {
        "name": "Launch Campaign 2026"
      },
      "referral": {
        "level": 1,
        "referredUser": {
          "firstName": "John",
          "lastName": "Doe"
        }
      }
    }
  ],
  "summary": {
    "total": 1250.00,
    "paid": 800.00,
    "unpaid": 300.00,
    "pending": 150.00
  }
}
```

### Get Recent Activity

Get recent platform activity.

**Endpoint:** `GET /api/dashboard/activity`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` - Number of activities to return (default: 10)

**Response:**
```json
{
  "activity": [
    {
      "type": "referral_accepted",
      "timestamp": "2026-03-09T...",
      "data": {
        "campaign": { "name": "Launch Campaign 2026" },
        "referrer": { "firstName": "Sophie" },
        "referredUser": { "firstName": "John" }
      }
    }
  ]
}
```

### Get Top Performers

Get top performing users (superuser and account managers).

**Endpoint:** `GET /api/dashboard/top-performers`

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` - Number of performers to return (default: 10)

**Response:**
```json
{
  "topPerformers": [
    {
      "user": {
        "id": "clx...",
        "email": "yoda@example.com",
        "firstName": "Yoda",
        "lastName": "Master"
      },
      "totalReferrals": 45,
      "totalEarnings": 3500.00
    }
  ]
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider adding rate limiting middleware.

## Pagination

Currently not implemented. All list endpoints return all results. For production with large datasets, implement pagination.

## Webhooks

Not currently implemented. Future feature for notifying external systems of events (new referral, commission paid, etc.).

---

## Testing with cURL

### Login Example
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

### Get Campaigns Example
```bash
curl -X GET http://localhost:5000/api/campaigns \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Create Referral Invite Example
```bash
curl -X POST http://localhost:5000/api/referrals/create \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"YOUR_CAMPAIGN_ID"}'
```

---

For more information, see the main [README.md](./README.md)
