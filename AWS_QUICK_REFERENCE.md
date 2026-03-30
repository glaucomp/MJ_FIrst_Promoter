# 🔧 AWS Ubuntu Quick Reference

Quick commands and tips for managing your MJ First Promoter deployment.

---

## 🚀 Deployment Commands

### Upload Application to Server
```bash
# From your local machine
scp -i your-key.pem -r MJ_FIrst_Promoter ubuntu@your-ec2-ip:/home/ubuntu/
```

### Run Automated Deployment
```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-ec2-ip

# Make script executable
chmod +x /home/ubuntu/MJ_FIrst_Promoter/deploy-aws-ubuntu.sh

# Run deployment
cd /home/ubuntu/MJ_FIrst_Promoter
./deploy-aws-ubuntu.sh
```

---

## 🔄 Application Management

### PM2 Commands
```bash
pm2 status                    # Check app status
pm2 restart mj-promoter       # Restart app
pm2 stop mj-promoter          # Stop app
pm2 start mj-promoter         # Start app
pm2 logs mj-promoter          # View logs (real-time)
pm2 logs mj-promoter --lines 100  # View last 100 lines
pm2 logs mj-promoter --err    # View only errors
pm2 monit                     # Monitor CPU/Memory usage
pm2 flush                     # Clear logs
```

### Update Application (After Code Changes)
```bash
cd /home/ubuntu/MJ_FIrst_Promoter
git pull origin main          # Pull latest code
npm install                   # Install new dependencies
npx prisma migrate deploy     # Run database migrations
npm run build                 # Rebuild application
pm2 restart mj-promoter       # Restart app
pm2 logs mj-promoter          # Check logs
```

---

## 🗄️ Database Management

### Connect to PostgreSQL
```bash
psql -U mjadmin -d mj_promoter -h localhost
```

### Common PostgreSQL Commands
```sql
-- View all tables
\dt

-- View table structure
\d promoters

-- View all promoters
SELECT id, email, ref_id, created_at FROM promoters;

-- Count records
SELECT COUNT(*) FROM commissions;

-- Exit
\q
```

### Backup Database
```bash
# Manual backup
pg_dump -U mjadmin mj_promoter | gzip > ~/backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c ~/backup_20260311.sql.gz | psql -U mjadmin -d mj_promoter
```

### Run Automatic Backup
```bash
/home/ubuntu/backup-db.sh
```

---

## 🌐 Nginx Management

### Nginx Commands
```bash
sudo systemctl status nginx       # Check status
sudo systemctl restart nginx      # Restart
sudo systemctl reload nginx       # Reload config (no downtime)
sudo nginx -t                     # Test configuration
```

### View Nginx Logs
```bash
# Access logs
sudo tail -f /var/log/nginx/mj-promoter-access.log

# Error logs
sudo tail -f /var/log/nginx/mj-promoter-error.log

# Last 100 errors
sudo tail -n 100 /var/log/nginx/mj-promoter-error.log
```

### Edit Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/mj-promoter
sudo nginx -t                     # Test config
sudo systemctl reload nginx       # Apply changes
```

---

## 🔒 SSL Certificate Management

### Renew SSL Certificate
```bash
sudo certbot renew                # Renew if needed
sudo certbot renew --dry-run      # Test renewal process
```

### View Certificate Info
```bash
sudo certbot certificates
```

### Force Renewal
```bash
sudo certbot renew --force-renewal
```

---

## 🔑 API Key Management

### Generate New API Keys
```bash
cd /home/ubuntu/MJ_FIrst_Promoter
npx ts-node src/scripts/create-api-key.ts
```

### View Existing API Keys (in database)
```bash
psql -U mjadmin -d mj_promoter -c "SELECT * FROM api_keys;"
```

---

## 📊 Monitoring & Debugging

### Check System Resources
```bash
htop                    # Interactive process viewer (install: sudo apt install htop)
df -h                   # Disk usage
free -h                 # Memory usage
uptime                  # System uptime and load
top                     # Process monitor
```

### Check Which Process is Using a Port
```bash
sudo lsof -i :5555      # Check port 5555
sudo lsof -i :80        # Check port 80
```

### Kill Process by Port
```bash
sudo lsof -ti:5555 | xargs kill -9
```

### Check Application Health
```bash
# Test API locally
curl http://localhost:5555/api/health

# Test from external domain
curl https://your-domain.com/api/health

# Test specific endpoint
curl -X GET https://your-domain.com/api/v2/company/promoters \
  -H "Authorization: Bearer your_token" \
  -H "Account-ID: your_account_id"
```

---

## 🔥 Firewall Management

### UFW Commands
```bash
sudo ufw status                   # Check firewall status
sudo ufw enable                   # Enable firewall
sudo ufw disable                  # Disable firewall
sudo ufw allow 80/tcp             # Allow port 80
sudo ufw allow 443/tcp            # Allow port 443
sudo ufw allow 22/tcp             # Allow SSH
sudo ufw delete allow 8080/tcp    # Remove rule
```

---

## 🐛 Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs mj-promoter --err

# Check if port is in use
sudo lsof -i :5555

# Kill and restart
pm2 delete mj-promoter
pm2 start dist/server.js --name mj-promoter
```

### Database Connection Issues
```bash
# Test connection
psql -U mjadmin -d mj_promoter -h localhost

# Check PostgreSQL status
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### 502 Bad Gateway (Nginx)
```bash
# Check if app is running
pm2 status

# Check app logs
pm2 logs mj-promoter

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart both services
pm2 restart mj-promoter
sudo systemctl restart nginx
```

### High CPU/Memory Usage
```bash
# Check processes
pm2 monit
htop

# Restart app to clear memory leaks
pm2 restart mj-promoter

# Check disk space (if full, clear logs)
df -h
pm2 flush
```

### Clear Old Logs
```bash
# Clear PM2 logs
pm2 flush

# Clear Nginx logs (be careful!)
sudo truncate -s 0 /var/log/nginx/mj-promoter-access.log
sudo truncate -s 0 /var/log/nginx/mj-promoter-error.log
```

---

## 🔄 Git Workflow

### Pull Latest Changes
```bash
cd /home/ubuntu/MJ_FIrst_Promoter
git pull origin main
npm install
npm run build
pm2 restart mj-promoter
```

### Check Git Status
```bash
git status
git log --oneline -10    # Last 10 commits
git branch               # Current branch
```

### Discard Local Changes
```bash
git reset --hard origin/main
```

---

## 📦 Environment Variables

### Edit .env File
```bash
nano /home/ubuntu/MJ_FIrst_Promoter/.env
```

### After Changing .env
```bash
pm2 restart mj-promoter   # Restart app to apply changes
```

---

## 🧪 Testing

### Test API Endpoints
```bash
# Create promoter
curl -X POST https://your-domain.com/api/v1/promoters/create \
  -H "X-API-KEY: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "first_name": "Test",
    "last_name": "User"
  }'

# Track sale
curl -X POST https://your-domain.com/api/v2/track/sale \
  -H "Authorization: Bearer your_token" \
  -H "Account-ID: your_account_id" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "amount": 10000,
    "event_id": "test_tx_001",
    "ref_id": "promoter_ref_id"
  }'

# Search promoter
curl "https://your-domain.com/api/v2/company/promoters?search=ref_id" \
  -H "Authorization: Bearer your_token" \
  -H "Account-ID: your_account_id"
```

---

## 📱 Integration Testing

### Test Python Client (mjfp.py)
```bash
cd /home/ubuntu/MJ_FIrst_Promoter/integration
python3 test_integration.py
```

---

## 🔐 Security

### Update System Packages
```bash
sudo apt update && sudo apt upgrade -y
```

### Check for Failed Login Attempts
```bash
sudo tail -f /var/log/auth.log
```

### Install fail2ban (Prevent Brute Force)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo fail2ban-client status sshd   # Check SSH jail
```

---

## 📊 Performance Optimization

### Enable Nginx Caching
Add to your Nginx config:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m inactive=60m;

location /api {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    # ... rest of config
}
```

### Enable Gzip Compression
Add to Nginx config:
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

---

## 🚨 Emergency Commands

### Restart Everything
```bash
pm2 restart mj-promoter
sudo systemctl restart nginx
sudo systemctl restart postgresql
```

### Stop Everything
```bash
pm2 stop mj-promoter
sudo systemctl stop nginx
```

### View All Logs at Once
```bash
# Terminal 1: PM2 logs
pm2 logs mj-promoter

# Terminal 2: Nginx errors
sudo tail -f /var/log/nginx/mj-promoter-error.log

# Or combine (basic)
pm2 logs mj-promoter & sudo tail -f /var/log/nginx/error.log
```

---

## 📞 Useful One-Liners

### Server Info
```bash
echo "Hostname: $(hostname)"
echo "IP: $(curl -s ifconfig.me)"
echo "Disk: $(df -h / | tail -1 | awk '{print $5}')"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Uptime: $(uptime -p)"
```

### Check All Services
```bash
echo "PostgreSQL: $(sudo systemctl is-active postgresql)"
echo "Nginx: $(sudo systemctl is-active nginx)"
echo "PM2: $(pm2 list | grep mj-promoter | grep -c online) processes online"
```

### Quick Database Stats
```bash
psql -U mjadmin -d mj_promoter -c "
SELECT 
  (SELECT COUNT(*) FROM promoters) as promoters,
  (SELECT COUNT(*) FROM referrals) as referrals,
  (SELECT COUNT(*) FROM commissions) as commissions,
  (SELECT COUNT(*) FROM customers) as customers;
"
```

---

## 📚 Additional Resources

- **PM2 Docs:** https://pm2.keymetrics.io/docs/usage/quick-start/
- **Nginx Docs:** https://nginx.org/en/docs/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Certbot:** https://certbot.eff.org/

---

**💡 Pro Tip:** Bookmark this file! Keep it open in a browser tab for quick reference.

**🔖 Save these commands in your shell history for easy access!**
