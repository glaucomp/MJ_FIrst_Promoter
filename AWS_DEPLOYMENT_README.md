# 🚀 AWS Ubuntu Deployment - Quick Start

This guide will get your MJ First Promoter running on AWS Ubuntu in under 15 minutes.

---

## 📋 Prerequisites

Before you begin, ensure you have:

1. **AWS EC2 Instance**
   - Ubuntu 22.04 LTS
   - Instance type: t2.medium or larger (recommended)
   - At least 20GB storage
   - Elastic IP assigned

2. **Domain Name**
   - Domain pointing to your EC2 Elastic IP
   - DNS propagated (check with `dig your-domain.com`)

3. **Security Group Rules**
   - Port 22 (SSH)
   - Port 80 (HTTP)
   - Port 443 (HTTPS)

4. **Local Setup**
   - SSH key (.pem file) for EC2 access
   - Git repository cloned locally

---

## 🎯 Deployment Options

### Option 1: Automated Script (Recommended) ⚡

**Fastest way to deploy!**

1. **Upload your application to the server:**
   ```bash
   scp -i your-key.pem -r MJ_FIrst_Promoter ubuntu@your-ec2-ip:/home/ubuntu/
   ```

2. **SSH into your server:**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

3. **Run the deployment script:**
   ```bash
   cd /home/ubuntu/MJ_FIrst_Promoter
   chmod +x deploy-aws-ubuntu.sh
   ./deploy-aws-ubuntu.sh
   ```

4. **Follow the prompts:**
   - Enter your domain name
   - Set database password
   - Enter admin email for SSL

5. **Done!** Your app will be live at `https://your-domain.com`

---

### Option 2: Manual Deployment 🔧

**For more control over the process.**

Follow the detailed step-by-step guide: **[AWS_UBUNTU_DEPLOYMENT.md](./AWS_UBUNTU_DEPLOYMENT.md)**

---

## ✅ Post-Deployment Setup

### 1. Generate API Credentials

```bash
cd /home/ubuntu/MJ_FIrst_Promoter
npx ts-node src/scripts/create-api-key.ts
```

**Save the output!** You'll need:
- `API_KEY` for v1 endpoints
- `BEARER_TOKEN` for v2 endpoints
- `ACCOUNT_ID` for v2 endpoints

### 2. Create Admin User (Optional)

```bash
npm run seed
```

Default admin credentials:
- Email: `admin@example.com`
- Password: `admin123`

**⚠️ Change these immediately after first login!**

### 3. Verify Deployment

```bash
# Check services status
pm2 status
sudo systemctl status nginx
sudo systemctl status postgresql

# Test API
curl https://your-domain.com/api/health

# View logs
pm2 logs mj-promoter
```

---

## 🔗 Integration with TeaseMe.live

### Update Your Python Integration

1. **Copy the environment variables to your TeaseMe config:**

   ```python
   # In your TeaseMe settings.py or config file
   from mjfp import MJFPConfig
   
   MJFPConfig.MJFP_API_URL = "https://your-domain.com/api"
   MJFPConfig.MJFP_API_KEY = "fp_key_xxx..."
   MJFPConfig.MJFP_TOKEN = "fp_token_xxx..."
   MJFPConfig.MJFP_ACCOUNT_ID = "acc_xxx..."
   ```

2. **Test the integration:**

   ```bash
   cd integration
   python3 test_integration.py
   ```

3. **Deploy to production:**
   - Your existing code should work without changes!
   - Just update the configuration variables

---

## 📊 Access Your Dashboard

**Admin Dashboard:** `https://your-domain.com`

**Default login:**
- Email: `admin@example.com`
- Password: `admin123`

**Features available:**
- Create campaigns
- View promoters
- Track commissions
- Manage referrals
- Generate reports

---

## 🔄 Updating Your Application

When you make code changes:

```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-ec2-ip

# Navigate to project
cd /home/ubuntu/MJ_FIrst_Promoter

# Pull latest changes
git pull origin main

# Install dependencies (if package.json changed)
npm install

# Run migrations (if schema changed)
npx prisma migrate deploy

# Rebuild
npm run build

# Restart
pm2 restart mj-promoter

# Verify
pm2 logs mj-promoter
```

---

## 🐛 Troubleshooting

### Application Not Starting

```bash
# Check logs
pm2 logs mj-promoter --err

# Restart services
pm2 restart mj-promoter
sudo systemctl restart nginx
```

### Database Connection Error

```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Test connection
psql -U mjadmin -d mj_promoter -h localhost

# Check credentials in .env file
cat /home/ubuntu/MJ_FIrst_Promoter/.env
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check app logs
pm2 logs mj-promoter

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart both
pm2 restart mj-promoter
sudo systemctl restart nginx
```

### SSL Certificate Issues

```bash
# Renew certificate
sudo certbot renew

# Check certificate status
sudo certbot certificates

# Reconfigure SSL
sudo certbot --nginx -d your-domain.com
```

### Need More Help?

Check the detailed troubleshooting section in **[AWS_UBUNTU_DEPLOYMENT.md](./AWS_UBUNTU_DEPLOYMENT.md)**

---

## 📚 Documentation Files

- **[AWS_UBUNTU_DEPLOYMENT.md](./AWS_UBUNTU_DEPLOYMENT.md)** - Complete deployment guide
- **[AWS_QUICK_REFERENCE.md](./AWS_QUICK_REFERENCE.md)** - Common commands and operations
- **[API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)** - API documentation
- **[integration/README.md](./integration/README.md)** - Python client documentation

---

## 🔐 Security Checklist

After deployment, ensure:

- ✅ SSL certificate is active (HTTPS)
- ✅ Firewall (UFW) is enabled
- ✅ Database password is strong
- ✅ JWT_SECRET is randomized
- ✅ Admin password changed from default
- ✅ API keys are secured
- ✅ Regular backups are scheduled
- ✅ Server updates are automated

---

## 📈 Monitoring Your Deployment

### Check Application Health

```bash
pm2 monit              # Real-time monitoring
pm2 status             # Process status
htop                   # System resources
```

### View Logs

```bash
pm2 logs mj-promoter                      # Application logs
sudo tail -f /var/log/nginx/error.log     # Nginx errors
sudo journalctl -u mj-promoter -f         # Systemd logs (if using systemd)
```

### Database Stats

```bash
psql -U mjadmin -d mj_promoter -c "
SELECT 
  (SELECT COUNT(*) FROM promoters) as promoters,
  (SELECT COUNT(*) FROM referrals) as referrals,
  (SELECT COUNT(*) FROM commissions) as commissions;
"
```

---

## 🎯 Performance Tips

1. **Enable Redis for caching** (optional):
   ```bash
   sudo apt install redis-server
   sudo systemctl enable redis-server
   ```

2. **Optimize database**:
   ```bash
   psql -U mjadmin -d mj_promoter -c "VACUUM ANALYZE;"
   ```

3. **Monitor resources**:
   ```bash
   pm2 monit
   ```

4. **Scale vertically**: Upgrade to larger EC2 instance if needed

5. **Scale horizontally**: Use AWS Load Balancer for multiple instances

---

## 🔄 Backup Strategy

### Automatic Daily Backups

Configured during deployment to run at 2 AM daily.

```bash
# View backup files
ls -lh ~/backups/

# Manual backup
/home/ubuntu/backup-db.sh

# Restore from backup
gunzip -c ~/backups/mj_promoter_20260311_020000.sql.gz | psql -U mjadmin -d mj_promoter
```

### Backup to S3 (Recommended)

```bash
# Install AWS CLI
sudo apt install awscli

# Configure
aws configure

# Create backup script
cat > ~/backup-to-s3.sh << 'EOF'
#!/bin/bash
/home/ubuntu/backup-db.sh
aws s3 sync ~/backups/ s3://your-bucket/mj-promoter-backups/
EOF

chmod +x ~/backup-to-s3.sh

# Add to crontab
(crontab -l; echo "0 3 * * * /home/ubuntu/backup-to-s3.sh") | crontab -
```

---

## 🎉 Success Checklist

Before going live, verify:

- [ ] Application is accessible at `https://your-domain.com`
- [ ] API endpoints are working
- [ ] SSL certificate is valid
- [ ] Database is created and migrated
- [ ] Admin user can login
- [ ] Promoter creation works
- [ ] Sale tracking works
- [ ] Commissions are calculated correctly
- [ ] Backups are scheduled
- [ ] Monitoring is in place
- [ ] Documentation is accessible

---

## 🆘 Support

### Quick Help

- **View all logs:** `pm2 logs mj-promoter`
- **Restart everything:** `pm2 restart mj-promoter && sudo systemctl restart nginx`
- **Check system:** `sudo systemctl status nginx postgresql`

### Documentation

- Review **[AWS_QUICK_REFERENCE.md](./AWS_QUICK_REFERENCE.md)** for common tasks
- Check **[API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)** for API usage
- Read **[integration/README.md](./integration/README.md)** for Python client

---

## 🚀 You're Live!

Your MJ First Promoter is now running on AWS Ubuntu!

**Next steps:**
1. Create campaigns in the dashboard
2. Integrate with TeaseMe.live
3. Start tracking referrals
4. Monitor commissions

**Happy tracking!** 💰
