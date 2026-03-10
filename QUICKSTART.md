# 🚀 Quick Start Guide - MJ First Promoter

Get your referral tracking platform running in 5 minutes!

## 📋 Prerequisites

Make sure you have installed:
- **Node.js 18+** ([Download](https://nodejs.org/))
- **PostgreSQL** ([Download](https://www.postgresql.org/download/))
- **npm** (comes with Node.js)

## ⚡ Installation (5 Steps)

### Step 1: Install Backend Dependencies
```bash
npm install
```

### Step 2: Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### Step 3: Create Database
```bash
createdb influencer_platform
```

Or if you prefer using psql:
```bash
psql postgres
CREATE DATABASE influencer_platform;
\q
```

### Step 4: Setup Database Schema
```bash
npm run prisma:generate
npm run prisma:migrate
```

When asked for migration name, type: `init`

### Step 5: Seed Demo Data
```bash
npm run seed
```

## 🎬 Start the Application

```bash
npm run dev
```

This starts both backend (port 5000) and frontend (port 3000).

**Open your browser:** http://localhost:3000

## 👥 Demo Accounts

After seeding, use these accounts to explore:

### Admin (Full Access)
- **Email:** admin@example.com
- **Password:** admin123
- **Can:** Create campaigns, invite promoters, view all data

### Promoter (Yoda)
- **Email:** yoda@example.com  
- **Password:** promoter123
- **Can:** Invite other promoters, earn commissions, track earnings

### Promoter (Luke)
- **Email:** luke@example.com
- **Password:** promoter123
- **Can:** Invite other promoters, earn commissions, track earnings

## 🎯 Try It Out

### As Admin:
1. Login with admin@example.com / admin123
2. Click "+ New Campaign"
3. Fill in campaign details:
   - Campaign name
   - Website URL (your main site)
   - Default Referral URL (optional landing page)
   - Commission rates (recurring, first sale, second tier)
   - Cookie lifetime and auto-approve settings

### As Promoter:
1. Login with yoda@example.com / promoter123
2. Click "+ Invite Friends"
3. Select a campaign
4. Generate your referral link (points to campaign's website URL)
5. Share the link to earn commissions!

## 🔗 How the Multi-Level System Works

### Example Flow:

```
1. Admin creates "TeaseMe Referral Program" (10% recurring, 5% second tier)
   ↓
2. Admin invites Yoda (Promoter) with invite link
   ↓
3. Yoda registers and becomes Level 1 Promoter
   ↓
4. Yoda invites Luke (his friend) with referral link
   ↓
5. Luke registers and becomes Level 2 Promoter
   ↓
6. Luke registers and becomes Level 2 Promoter
   ↓
7. When Luke makes a sale:
   - Luke earns 15% (his direct commission)
   - Yoda earns 5% (secondary commission from his referral)
   - Sophie tracks all activity in her dashboard
```

### Commission Structure:
- **Level 1 (Direct Referrals):** 15% commission
- **Level 2 (Sub-Referrals):** 5% commission  
- **Unlimited Levels:** Keep earning as your network grows!

## 📊 What You Can Track

### Admin Dashboard:
- Total campaigns and active campaigns
- Number of account managers and influencers
- All referrals across the platform
- Total commissions paid

### Promoter Dashboard:
- Campaigns you manage
- Total influencers in your campaigns
- Referral activity
- Commission totals

### Promoter Dashboard:
- Your direct referrals
- Sub-referrals (friends of friends)
- Total earnings (paid, unpaid, pending)
- Tracking links with click analytics

## 🌐 Creating Your First Campaign

1. **Login as Superuser** (admin@example.com / admin123)

2. **Click "Create Campaign"**

3. **Fill in the details:**
   - **Name:** "Spring Sale 2026"
   - **Website URL:** https://yourwebsite.com
   - **Commission Rate:** 20% (for direct referrals)
   - **Secondary Rate:** 8% (for sub-referrals)
   - **Assign to Manager:** Select an account manager

4. **Click "Create Campaign"**

5. **Share with your account manager** who can start inviting influencers!

## 🎁 Inviting Your First Promoter

1. **Login as Promoter** (manager@example.com / manager123)

2. **Click "Invite Promoter"**

3. **Select a campaign** from dropdown

4. **Click "Generate Invite Link"**

5. **Copy the URL** (looks like: http://localhost:3000/register?invite=ABC123XYZ)

6. **Share with influencer** via email, message, or social media

7. **When they register,** they automatically join your campaign!

## 💰 Earning Your First Commission

1. **Login as Promoter** (yoda@example.com / influencer123)

2. **Click "Invite Friends"**

3. **Select campaign** and generate your referral link

4. **Share your link** with friends

5. **When friends sign up:**
   - You earn commission on their sales
   - They can invite their own friends
   - You earn secondary commissions on their referrals too!

## 🔍 Viewing Your Earnings

**Promoter Dashboard shows:**
- **Total Earnings:** All commissions earned
- **Paid Earnings:** Money already paid to you
- **Pending Earnings:** Waiting for payout
- **Commission History:** Detailed breakdown by campaign

## 📈 Tracking Links

Create special tracking links to:
- Monitor click-through rates
- See which marketing channels work best
- Track conversions from specific campaigns

**To create:**
1. Go to dashboard
2. Generate tracking link for a campaign
3. Use in social media, emails, or ads
4. View click statistics in real-time

## 🛠️ Troubleshooting

### Database Connection Failed
```bash
# Make sure PostgreSQL is running
pg_isready

# Check if database exists
psql -l | grep influencer_platform
```

### Port Already in Use
Edit `.env` file and change PORT to a different number:
```
PORT=5001
```

### Module Not Found
```bash
rm -rf node_modules
npm install
cd frontend
rm -rf node_modules
npm install
cd ..
```

### Can't Login
Make sure you ran the seed command:
```bash
npm run seed
```

## 📱 Next Steps

Now that you have it running:

1. **Customize for your business:**
   - Update website URLs
   - Adjust commission rates
   - Add your branding

2. **Integrate with your product:**
   - Add webhook for sales tracking
   - Connect payment gateway for auto-payouts
   - Set up email notifications

3. **Scale your network:**
   - Invite real account managers
   - Onboard influencers
   - Launch your first campaign!

## 📚 Learn More

- **Full Documentation:** [README.md](./README.md)
- **API Reference:** [API.md](./API.md)
- **Setup Guide:** [SETUP.md](./SETUP.md)

## 🎉 You're Ready!

Your multi-level referral tracking platform is now running. Start creating campaigns, inviting influencers, and tracking commissions!

**Questions?** Check the documentation or open an issue.

---

Happy promoting! 🚀
