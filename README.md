# MJ First Promoter - Multi-Level Referral Tracking Platform

A comprehensive referral tracking and campaign management system built for account managers and influencers. Features multi-level referral tracking, commission management, and real-time analytics.

## 🌟 Features

### For Admins
- **Campaign Management**: Create and manage promotional campaigns with custom commission rates
- **User Management**: Create and manage account managers
- **Analytics Dashboard**: View platform-wide statistics and performance metrics
- **Commission Tracking**: Monitor all commissions across all campaigns

### For Account Managers
- **Campaign Assignment**: Manage assigned campaigns
- **Influencer Invites**: Generate unique invite links for influencers
- **Performance Tracking**: Monitor referrals and commissions for your campaigns
- **Dashboard Analytics**: View campaign-specific metrics

### For Influencers
- **Referral Links**: Generate personalized referral links
- **Multi-Level Earnings**: Earn commissions on direct referrals and their sub-referrals
- **Tracking Links**: Create trackable links with click analytics
- **Commission Dashboard**: View earnings, pending payments, and commission history
- **Friend Invites**: Invite friends who become sub-influencers (multi-level marketing)

## 🏗️ Architecture

### Technology Stack

**Backend:**
- Node.js + Express.js
- TypeScript
- PostgreSQL database
- Prisma ORM
- JWT authentication
- bcryptjs for password hashing

**Frontend:**
- React 18
- TypeScript
- React Router for navigation
- Axios for API calls
- Vite for build tooling

### Database Schema

The system uses 7 main models:
1. **User** - All users (superuser, account managers, influencers)
2. **Campaign** - Promotional campaigns with commission rates
3. **Referral** - Tracks referral relationships and hierarchy
4. **TrackingLink** - Unique URLs for tracking clicks
5. **ClickTracking** - Individual click tracking data
6. **Commission** - Earned commissions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL
- npm or yarn

### Installation

1. **Clone and navigate to the project:**
```bash
cd MJ_FIrst_Promoter
```

2. **Install dependencies:**
```bash
npm install
cd frontend && npm install && cd ..
```

3. **Set up database:**
```bash
createdb influencer_platform
```

4. **Configure environment:**
```bash
cp .env.example .env
```
Edit `.env` with your database credentials.

5. **Run migrations and seed:**
```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

6. **Start the application:**
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Demo Accounts

After seeding, you can log in with:

- **Admin**: `admin@example.com` / `admin123`
- **Promoter (Yoda)**: `yoda@example.com` / `promoter123`
- **Promoter (Luke)**: `luke@example.com` / `promoter123`

## 📊 How It Works

### Campaign Flow

1. **Admin** creates a campaign:
   - Sets website URL
   - Defines commission rates (primary and secondary)
   - Assigns to an account manager

2. **Account Manager** invites influencers:
   - Generates unique invite links
   - Sends to potential influencers
   - Tracks who signs up

3. **Influencer** accepts invite:
   - Registers via invite link
   - Becomes part of the campaign
   - Can now invite their own friends

4. **Multi-Level Referrals**:
   - Influencer invites Friend A (Level 1)
   - Friend A invites Friend B (Level 2)
   - Original influencer earns commissions on both levels

### Commission Structure

Example: Campaign with 15% primary, 5% secondary rate

- **Direct Referral (Level 1)**: Influencer earns 15% commission
- **Sub-Referral (Level 2)**: Original influencer earns 5% commission
- **Account Manager**: Earns on all referrals in their campaigns

## 🔗 Key Workflows

### Creating a Campaign (Admin)

1. Log in as superuser
2. Click "Create Campaign"
3. Fill in:
   - Campaign name
   - Website URL
   - Commission rate (e.g., 15%)
   - Secondary rate for sub-referrals (e.g., 5%)
   - Assign to account manager
4. Campaign is now active

### Inviting an Influencer (Account Manager)

1. Log in as account manager
2. Click "Invite Influencer"
3. Select campaign
4. Generate invite link
5. Share link with influencer
6. Influencer registers via link

### Referring Friends (Influencer)

1. Log in as influencer
2. Click "Invite Friends"
3. Select campaign
4. Generate referral link
5. Share with friends
6. Earn commissions when friends sign up and make referrals

### Generating Tracking Links

1. Navigate to dashboard
2. Select campaign
3. Generate tracking link
4. Use link in marketing materials
5. View click analytics in dashboard

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Campaigns
- `GET /api/campaigns` - Get all campaigns (role-filtered)
- `POST /api/campaigns` - Create campaign (superuser only)
- `GET /api/campaigns/:id` - Get campaign details
- `PUT /api/campaigns/:id` - Update campaign (superuser only)
- `GET /api/campaigns/:id/stats` - Get campaign statistics

### Referrals
- `POST /api/referrals/create` - Create referral invite
- `GET /api/referrals/invite/:code` - Get referral by invite code
- `GET /api/referrals/my-referrals` - Get user's referrals
- `POST /api/referrals/tracking-link` - Generate tracking link
- `GET /api/referrals/tracking-links/me` - Get user's tracking links

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/earnings` - Get user's earnings
- `GET /api/dashboard/activity` - Get recent activity

See [API.md](./API.md) for complete API documentation.

## 🎨 User Interface

### Dashboard Overview

Each role has a customized dashboard:

**Admin Dashboard:**
- Platform-wide statistics
- Campaign management interface
- Account manager creation
- All campaigns overview

**Account Manager Dashboard:**
- Campaign-specific metrics
- Influencer invite generator
- Referral tracking
- Commission overview

**Influencer Dashboard:**
- Personal earnings
- Referral statistics
- Friend invite system
- Tracking link management
- Commission history

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcryptjs
- Role-based access control
- Secure API endpoints
- Input validation
- SQL injection prevention (Prisma)

## 📈 Analytics & Tracking

### Metrics Tracked:
- Total referrals (by campaign, by user)
- Active vs pending referrals
- Click-through rates on tracking links
- Commission totals (paid, unpaid, pending)
- User performance rankings
- Campaign performance

### Click Tracking:
- IP addresses
- User agents
- Referrer URLs
- Timestamp data
- Geographic information (extensible)

## 🛠️ Development

### Project Structure
```
MJ_FIrst_Promoter/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── controllers/           # API controllers
│   ├── routes/                # API routes
│   ├── middleware/            # Auth middleware
│   ├── server.ts              # Express server
│   └── seed.ts                # Database seeder
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── contexts/          # React contexts
│   │   ├── services/          # API services
│   │   └── App.tsx            # Main app component
│   └── package.json
└── package.json
```

### Available Scripts

**Backend:**
- `npm run dev:backend` - Start backend dev server
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:generate` - Generate Prisma client
- `npm run seed` - Seed database

**Frontend:**
- `npm run dev:frontend` - Start frontend dev server
- `cd frontend && npm run build` - Build for production

**Both:**
- `npm run dev` - Start both servers concurrently

## 🌐 Deployment

### Environment Variables

Required for production:
```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-secure-random-secret-key
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
APP_URL=https://your-api-domain.com
```

### Production Checklist
- [ ] Update JWT_SECRET to strong random string
- [ ] Configure production database
- [ ] Set FRONTEND_URL and APP_URL
- [ ] Enable HTTPS
- [ ] Configure CORS for production domains
- [ ] Set up error logging (Sentry, etc.)
- [ ] Configure email service for invites
- [ ] Set up automated backups
- [ ] Configure rate limiting
- [ ] Enable monitoring and alerts

## 🤝 Use Cases

### E-commerce Platform
- Promote products via influencer network
- Track sales through referral links
- Pay commissions on successful conversions

### SaaS Product
- User acquisition through referrals
- Multi-tier affiliate program
- Track signups and subscriptions

### Service Business
- Partner network management
- Lead generation tracking
- Commission-based partnerships

### Content Platform
- Creator network growth
- Audience expansion
- Referral rewards program

## 📝 Customization

### Adding Custom Commission Logic

Edit `/src/controllers/referral.controller.ts` to customize commission calculations.

### Email Notifications

Integrate email service (SendGrid, Mailgun) in referral creation to send invite emails automatically.

### Payment Integration

Add payment gateway (Stripe, PayPal) to automate commission payouts.

### Advanced Analytics

Integrate with analytics platforms (Google Analytics, Mixpanel) for deeper insights.

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Verify database exists
psql -l | grep influencer_platform

# Reset database
npm run prisma:migrate reset
```

### Port Already in Use
```bash
# Change port in .env
PORT=5001
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

## 📄 License

MIT License - feel free to use for commercial projects.

## 🎯 Roadmap

- [ ] Email notifications for invites
- [ ] SMS notifications
- [ ] Payment gateway integration
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] API rate limiting
- [ ] Webhook integrations
- [ ] Custom commission rules engine
- [ ] A/B testing for campaigns
- [ ] Social media sharing integration

## 📞 Support

For issues and questions:
1. Check the [SETUP.md](./SETUP.md) guide
2. Review [API.md](./API.md) documentation
3. Open an issue on GitHub

---

Built with ❤️ for empowering referral marketing campaigns
