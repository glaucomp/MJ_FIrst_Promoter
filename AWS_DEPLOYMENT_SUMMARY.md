# 🎯 AWS Ubuntu Deployment - Complete Package

Everything you need to deploy MJ First Promoter to AWS Ubuntu is ready!

---

## 📦 What's Included

I've prepared a complete deployment package for running your application on AWS Ubuntu:

### 📋 Documentation Files

1. **[AWS_DEPLOYMENT_README.md](./AWS_DEPLOYMENT_README.md)**
   - Quick start guide (15 min deployment)
   - Two deployment options: Automated vs Manual
   - Post-deployment setup instructions
   - Integration guide for TeaseMe.live

2. **[AWS_UBUNTU_DEPLOYMENT.md](./AWS_UBUNTU_DEPLOYMENT.md)**
   - Comprehensive step-by-step deployment guide
   - All 11 deployment steps detailed
   - Security best practices
   - Backup configuration
   - Troubleshooting guide

3. **[AWS_QUICK_REFERENCE.md](./AWS_QUICK_REFERENCE.md)**
   - Quick command reference
   - PM2 management commands
   - Database operations
   - Nginx management
   - Monitoring and debugging
   - Emergency commands

4. **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)**
   - Interactive checklist to track progress
   - Pre-deployment requirements
   - Service verification steps
   - Security checklist
   - Go-live checklist

### 🚀 Deployment Scripts

1. **[deploy-aws-ubuntu.sh](./deploy-aws-ubuntu.sh)** ✅ (executable)
   - Fully automated deployment script
   - Installs all dependencies
   - Configures database, Nginx, SSL
   - Sets up PM2 and backups
   - Interactive prompts for configuration

### ⚙️ Configuration Files

1. **[.env.production](./.env.production)**
   - Production environment template
   - All required variables documented
   - Security settings included

2. **[mj-promoter.service](./mj-promoter.service)**
   - Systemd service file (alternative to PM2)
   - Production-ready configuration
   - Auto-restart on failure

---

## 🚀 Quick Start (15 Minutes)

### Step 1: Prepare Your AWS Instance

Make sure you have:
- ✅ Ubuntu 22.04 LTS EC2 instance (t2.medium+)
- ✅ Elastic IP assigned
- ✅ Domain pointing to the IP
- ✅ Security group: ports 22, 80, 443 open
- ✅ SSH key (.pem file) ready

### Step 2: Upload Application

```bash
# From your local machine
scp -i your-key.pem -r MJ_FIrst_Promoter ubuntu@your-ec2-ip:/home/ubuntu/
```

### Step 3: Run Automated Deployment

```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-ec2-ip

# Run deployment script
cd /home/ubuntu/MJ_FIrst_Promoter
./deploy-aws-ubuntu.sh
```

The script will ask for:
1. Your domain name
2. Database password
3. Admin email (for SSL)

### Step 4: Generate API Credentials

```bash
cd /home/ubuntu/MJ_FIrst_Promoter
npx ts-node src/scripts/create-api-key.ts
```

**Save the output!** You need these for integrations.

### Step 5: Verify Deployment

```bash
# Check services
pm2 status
sudo systemctl status nginx postgresql

# Test API
curl https://your-domain.com/api/health
```

### Step 6: Access Dashboard

Go to: `https://your-domain.com`

Login with:
- Email: `admin@example.com`
- Password: `admin123`

**Change password immediately!**

---

## 📚 Documentation Overview

### For Initial Deployment

Start here:
1. Read **AWS_DEPLOYMENT_README.md** (5 min read)
2. Follow **DEPLOYMENT_CHECKLIST.md** as you deploy
3. Run `deploy-aws-ubuntu.sh` script
4. Reference **AWS_UBUNTU_DEPLOYMENT.md** if you need details

### For Daily Operations

Bookmark:
- **AWS_QUICK_REFERENCE.md** - All commands you'll need
- Keep it open in a browser tab for quick access

### For Troubleshooting

Check:
1. **AWS_QUICK_REFERENCE.md** → Troubleshooting section
2. **AWS_UBUNTU_DEPLOYMENT.md** → Troubleshooting section
3. Run: `pm2 logs mj-promoter`

---

## 🔧 What Gets Installed

The automated script installs and configures:

### System Components
- ✅ Node.js 20.x
- ✅ PostgreSQL 14
- ✅ Nginx (web server)
- ✅ Certbot (SSL certificates)
- ✅ PM2 (process manager)
- ✅ UFW (firewall)

### Application Setup
- ✅ Database created and migrated
- ✅ Dependencies installed
- ✅ Application built
- ✅ Environment configured
- ✅ SSL certificate obtained
- ✅ Auto-restart on crash
- ✅ Startup on boot
- ✅ Daily backups scheduled

---

## 🔐 Security Features

Your deployment includes:

- ✅ **HTTPS/SSL** - Let's Encrypt certificate
- ✅ **Firewall** - UFW configured (ports 22, 80, 443)
- ✅ **Database** - Local access only
- ✅ **Secrets** - JWT and passwords secured
- ✅ **Headers** - Security headers in Nginx
- ✅ **Backups** - Daily automated backups

Optional enhancements (in docs):
- fail2ban (brute force prevention)
- SSH key-only authentication
- Root login disabled

---

## 📊 What You Get

After deployment:

### Live Application
- **Dashboard**: `https://your-domain.com`
- **API**: `https://your-domain.com/api`
- **SSL**: Valid HTTPS certificate

### Monitoring & Management
- **PM2 Dashboard**: `pm2 monit`
- **Application Logs**: `pm2 logs mj-promoter`
- **Nginx Logs**: `/var/log/nginx/`
- **Database**: PostgreSQL on localhost

### Automated Tasks
- **Backups**: Daily at 2 AM → `~/backups/`
- **SSL Renewal**: Automatic (Let's Encrypt)
- **Auto-restart**: If app crashes (PM2)

---

## 🔗 Integration with TeaseMe.live

Your API is **100% FirstPromoter compatible**!

### Configuration

Update your TeaseMe.live Python code:

```python
from mjfp import MJFPConfig

# Use your production URL and credentials
MJFPConfig.MJFP_API_URL = "https://your-domain.com/api"
MJFPConfig.MJFP_API_KEY = "fp_key_xxx..."
MJFPConfig.MJFP_TOKEN = "fp_token_xxx..."
MJFPConfig.MJFP_ACCOUNT_ID = "acc_xxx..."
```

### API Endpoints Available

- `POST /api/v1/promoters/create` - Create promoters
- `POST /api/v2/track/sale` - Track sales with commissions
- `POST /api/v2/track/signup` - Track signups
- `POST /api/v2/track/refund` - Process refunds
- `GET /api/v2/company/promoters/:id` - Get promoter details
- `GET /api/v2/company/promoters?search=ref_id` - Search promoters

**Full API docs**: [API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)

---

## 🔄 Deployment Workflow

### Initial Deployment
```
Prepare AWS → Upload Code → Run Script → Generate Keys → Test → Go Live
     ↓            ↓            ↓             ↓            ↓         ↓
   5 min        2 min        8 min         1 min       2 min    Ready!
```

### Code Updates
```bash
git pull origin main
npm install
npm run build
pm2 restart mj-promoter
```

### Database Updates
```bash
npx prisma migrate deploy
pm2 restart mj-promoter
```

---

## 📞 Common Operations

### Restart Application
```bash
pm2 restart mj-promoter
```

### View Logs
```bash
pm2 logs mj-promoter
```

### Check Status
```bash
pm2 status
sudo systemctl status nginx postgresql
```

### Manual Backup
```bash
/home/ubuntu/backup-db.sh
```

### Update Application
```bash
cd /home/ubuntu/MJ_FIrst_Promoter
git pull
npm install
npm run build
pm2 restart mj-promoter
```

---

## 🆘 Getting Help

### Check Logs First
```bash
# Application logs
pm2 logs mj-promoter --lines 100

# Nginx errors
sudo tail -50 /var/log/nginx/error.log

# PostgreSQL
sudo tail -50 /var/log/postgresql/postgresql-14-main.log
```

### Restart Everything
```bash
pm2 restart mj-promoter
sudo systemctl restart nginx
sudo systemctl restart postgresql
```

### Documentation References
1. **AWS_QUICK_REFERENCE.md** - Troubleshooting section
2. **AWS_UBUNTU_DEPLOYMENT.md** - Detailed troubleshooting
3. **API_INTEGRATION_GUIDE.md** - API issues

---

## ✅ Deployment Checklist

Use **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** to track:

- [ ] Pre-deployment (AWS setup)
- [ ] Initial setup (run script)
- [ ] Service verification
- [ ] Configuration (API keys)
- [ ] Testing (endpoints)
- [ ] Dashboard verification
- [ ] Integration (TeaseMe)
- [ ] Security (SSL, firewall)
- [ ] Backup & monitoring
- [ ] Go-live checklist

---

## 🎯 Success Metrics

After deployment, you should see:

✅ Application accessible at `https://your-domain.com`  
✅ SSL certificate valid (green padlock)  
✅ API responding to requests  
✅ Dashboard loads and functions  
✅ Can create promoters via API  
✅ Can track sales and commissions  
✅ Integration tests pass  
✅ Backups running automatically  
✅ Services auto-restart on failure  

---

## 🎉 You're Ready!

Everything you need is prepared:

1. ✅ **Automated deployment script** - Just run it!
2. ✅ **Complete documentation** - Step-by-step guides
3. ✅ **Quick reference** - All commands you need
4. ✅ **Configuration templates** - Production-ready settings
5. ✅ **Deployment checklist** - Track your progress
6. ✅ **Integration guide** - Connect with TeaseMe

---

## 📋 File Summary

```
AWS Deployment Files:
├── AWS_DEPLOYMENT_README.md      # Start here! Quick start guide
├── AWS_UBUNTU_DEPLOYMENT.md      # Complete deployment guide
├── AWS_QUICK_REFERENCE.md        # Commands & operations
├── DEPLOYMENT_CHECKLIST.md       # Track your progress
├── deploy-aws-ubuntu.sh          # Automated deployment script ⚡
├── .env.production               # Production env template
└── mj-promoter.service           # Systemd service (alternative)

Integration Files:
├── API_INTEGRATION_GUIDE.md      # API documentation
├── integration/
│   ├── mjfp.py                   # Python client (FirstPromoter compatible)
│   ├── test_integration.py       # Integration tests
│   └── README.md                 # Integration docs
```

---

## 🚀 Next Steps

1. **Review**: Read AWS_DEPLOYMENT_README.md (5 minutes)
2. **Prepare**: Set up your AWS EC2 instance
3. **Deploy**: Upload code and run deploy-aws-ubuntu.sh
4. **Configure**: Generate API keys and test
5. **Integrate**: Update TeaseMe.live configuration
6. **Monitor**: Keep AWS_QUICK_REFERENCE.md handy

---

**Questions?** Everything is documented in the files above!

**Ready to deploy?** Start with **[AWS_DEPLOYMENT_README.md](./AWS_DEPLOYMENT_README.md)**

---

**Good luck with your deployment! 🎊**

Your MJ First Promoter will be live on AWS Ubuntu in under 15 minutes!
