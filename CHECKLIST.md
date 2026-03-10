# ✅ Pre-Launch Checklist

Use this checklist to ensure your MJ First Promoter platform is ready to run.

## 📦 Installation Checklist

### System Requirements
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] PostgreSQL installed and running (`pg_isready`)
- [ ] Git installed (optional, for version control)

### Database Setup
- [ ] Database `influencer_platform` created
- [ ] Database credentials updated in `.env`
- [ ] Prisma client generated (`npm run prisma:generate`)
- [ ] Migrations run successfully (`npm run prisma:migrate`)
- [ ] Demo data seeded (`npm run seed`)

### Dependencies
- [ ] Backend dependencies installed (`npm install` in root)
- [ ] Frontend dependencies installed (`npm install` in frontend/)
- [ ] No installation errors in terminal

### Environment Configuration
- [ ] `.env` file exists in root directory
- [ ] `PORT` is set (default: 5000)
- [ ] `DATABASE_URL` points to your PostgreSQL database
- [ ] `JWT_SECRET` is set (change from default for production!)
- [ ] `NODE_ENV` is set to `development`
- [ ] `FRONTEND_URL` is set (http://localhost:3000)
- [ ] `APP_URL` is set (http://localhost:5000)

## 🚀 Launch Checklist

### Backend Server
- [ ] Backend starts without errors (`npm run dev:backend`)
- [ ] Server running on correct port (check terminal output)
- [ ] Health check works: http://localhost:5000/health
- [ ] No database connection errors

### Frontend Application
- [ ] Frontend starts without errors (`npm run dev:frontend`)
- [ ] Vite dev server running on port 3000
- [ ] No compilation errors in terminal
- [ ] Browser opens to http://localhost:3000

### Both Together
- [ ] Both servers running (`npm run dev`)
- [ ] No port conflicts
- [ ] API proxy working (frontend → backend)

## 🧪 Functionality Testing

### Authentication
- [ ] Can access login page (http://localhost:3000/login)
- [ ] Can login with admin (admin@example.com / admin123)
- [ ] JWT token is stored in localStorage
- [ ] Can logout successfully
- [ ] Logout redirects to login page
- [ ] Invalid credentials show error message

### Admin Dashboard
- [ ] Dashboard loads with statistics
- [ ] Can create new campaign
- [ ] Can create new account manager
- [ ] Can view all campaigns in table
- [ ] Campaign status badges show correctly

### Account Manager Dashboard
- [ ] Can login as promoter (yoda@example.com / promoter123)
- [ ] Dashboard shows managed campaigns
- [ ] Can generate influencer invite link
- [ ] Invite URL copies to clipboard
- [ ] Campaign selection dropdown works

### Influencer Dashboard
- [ ] Can login as promoter Luke (luke@example.com / promoter123)
- [ ] Dashboard shows referral statistics
- [ ] Can generate friend referral link
- [ ] Can view commission history
- [ ] Tracking links table displays correctly

### Registration Flow
- [ ] Can access registration page
- [ ] Can register new user without invite code
- [ ] Can register with invite code (use pending invite from seed)
- [ ] Registration creates user in database
- [ ] After registration, redirects to dashboard
- [ ] New user appears in database (check Prisma Studio)

### Referral System
- [ ] Account manager can create invite
- [ ] Invite code is unique
- [ ] Invite URL includes query parameter
- [ ] Opening invite URL shows campaign info
- [ ] Registering with invite links user to campaign
- [ ] Influencer can create sub-referrals

### Data Verification
- [ ] Open Prisma Studio (`npm run prisma:studio`)
- [ ] Verify users exist (5 demo users)
- [ ] Verify campaigns exist (2 demo campaigns)
- [ ] Verify referrals exist (seeded referrals)
- [ ] Verify commissions exist (demo commissions)

## 🔒 Security Checklist

### Development
- [ ] `.env` file is in `.gitignore`
- [ ] `node_modules` is in `.gitignore`
- [ ] JWT_SECRET is not hardcoded in source files
- [ ] Passwords are hashed (never stored plain text)

### Production (When Deploying)
- [ ] Change JWT_SECRET to strong random string
- [ ] Update DATABASE_URL to production database
- [ ] Set NODE_ENV to `production`
- [ ] Enable HTTPS
- [ ] Configure CORS for production domains
- [ ] Remove or restrict demo accounts
- [ ] Set up SSL certificate
- [ ] Configure firewall rules
- [ ] Set up automated backups
- [ ] Enable error monitoring (Sentry, etc.)

## 📊 Database Verification

### Using Prisma Studio
```bash
npm run prisma:studio
```

Check these tables have data:
- [ ] Users (5 users: 1 superuser, 2 managers, 2 influencers)
- [ ] Campaigns (2 campaigns created)
- [ ] Referrals (3+ referrals created)
- [ ] Commissions (3+ commissions created)
- [ ] TrackingLinks (2+ tracking links)
- [ ] ClickTracking (3+ click records)

### Using psql
```bash
psql influencer_platform

# Check user count
SELECT COUNT(*) FROM users;  -- Should be 5

# Check campaigns
SELECT COUNT(*) FROM campaigns;  -- Should be 2

# Check referrals
SELECT COUNT(*) FROM referrals;  -- Should be 3+

\q
```

## 🌐 API Testing

### Health Check
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Login Test
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
# Should return user object and JWT token
```

### Protected Endpoint Test
```bash
# First get token from login, then:
curl http://localhost:5000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
# Should return dashboard statistics
```

## 🎨 UI/UX Verification

### Visual Checks
- [ ] Login page displays correctly
- [ ] Dashboard layout is responsive
- [ ] Navigation header shows user info
- [ ] Cards display with gradient backgrounds
- [ ] Tables are readable and formatted
- [ ] Buttons have hover effects
- [ ] Forms have proper validation
- [ ] Error messages display clearly
- [ ] Success messages show after actions

### Mobile Responsiveness
- [ ] Open DevTools (F12)
- [ ] Toggle device toolbar (Ctrl+Shift+M)
- [ ] Test on mobile sizes (375px, 768px, 1024px)
- [ ] Cards stack vertically on mobile
- [ ] Tables are scrollable on mobile
- [ ] Buttons are tappable (not too small)

## 📝 Documentation Check

- [ ] README.md is complete and accurate
- [ ] QUICKSTART.md provides 5-minute setup
- [ ] SETUP.md has detailed instructions
- [ ] API.md documents all endpoints
- [ ] SYSTEM_OVERVIEW.md explains architecture
- [ ] This CHECKLIST.md is up to date

## 🔧 Troubleshooting Common Issues

### Issue: Database Connection Error
**Solution:**
```bash
# Check PostgreSQL is running
pg_isready

# Restart PostgreSQL
# macOS:
brew services restart postgresql

# Linux:
sudo systemctl restart postgresql

# Windows:
# Use Services panel to restart PostgreSQL service
```

### Issue: Port 5000 Already in Use
**Solution:**
Edit `.env` file:
```
PORT=5001
```

### Issue: Prisma Client Not Found
**Solution:**
```bash
npm run prisma:generate
```

### Issue: Migration Failed
**Solution:**
```bash
# Reset and start fresh
npm run prisma:migrate reset
npm run seed
```

### Issue: Frontend Build Errors
**Solution:**
```bash
cd frontend
rm -rf node_modules .vite
npm install
npm run dev
```

### Issue: Can't Login
**Solution:**
```bash
# Re-seed database
npm run seed

# Verify users exist
npm run prisma:studio
```

## ✨ Optional Enhancements

### Email Setup (Future)
- [ ] Choose email service (SendGrid, Mailgun, etc.)
- [ ] Configure SMTP credentials
- [ ] Create email templates
- [ ] Test invite emails

### Payment Integration (Future)
- [ ] Choose payment gateway (Stripe, PayPal)
- [ ] Set up API keys
- [ ] Configure webhook endpoints
- [ ] Test payout flow

### Analytics (Future)
- [ ] Set up Google Analytics
- [ ] Configure tracking events
- [ ] Create custom dashboards
- [ ] Set up conversion funnels

### Monitoring (Production)
- [ ] Set up error tracking (Sentry)
- [ ] Configure uptime monitoring
- [ ] Set up performance monitoring
- [ ] Create alert rules

## 🎯 Ready to Launch?

If all checkboxes are checked, you're ready to:

✅ Start promoting campaigns
✅ Invite account managers  
✅ Onboard influencers
✅ Track referrals and commissions
✅ Scale your referral network

## 🆘 Need Help?

1. Check documentation files in this directory
2. Review error messages in terminal
3. Open Prisma Studio to inspect database
4. Check browser console for frontend errors
5. Review API responses in Network tab

---

**Congratulations!** Your referral tracking platform is ready to use! 🎉
