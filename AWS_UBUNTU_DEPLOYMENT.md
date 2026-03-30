# 🚀 AWS Ubuntu Deployment Guide

## MJ First Promoter - Production Deployment

This guide covers deploying your MJ First Promoter application to AWS Ubuntu (EC2).

---

## 📋 Prerequisites

### AWS Setup

- Ubuntu 22.04 LTS EC2 instance (t2.medium or larger recommended)
- Security group with ports: 80 (HTTP), 443 (HTTPS), 22 (SSH), 5432 (PostgreSQL - optional)
- Elastic IP assigned (recommended for production)
- Domain name pointing to your EC2 instance (for SSL)

---

## 🔧 Step 1: Initial Server Setup

### SSH into your EC2 instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### Update system packages

```bash
sudo apt update && sudo apt upgrade -y
```

### Install essential tools

```bash
sudo apt install -y curl git build-essential
```

---

## 🟢 Step 2: Install Node.js (v18 or later)

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x or higher
```

---

## 🐘 Step 3: Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE mj_promoter;"
sudo -u postgres psql -c "CREATE USER mjadmin WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE mj_promoter TO mjadmin;"
sudo -u postgres psql -c "ALTER DATABASE mj_promoter OWNER TO mjadmin;"
```

---

## 📦 Step 4: Clone and Setup Application

### Clone your repository

```bash
cd /home/ubuntu
git clone https://github.com/glaucomp/MJ_FIrst_Promoter.git
# Or upload via SCP if not using git
cd MJ_FIrst_Promoter
```

### Install dependencies

```bash
npm install
```

### Build the application

```bash
npm run build
```

### Setup Prisma

```bash
npx prisma generate
npx prisma migrate deploy
```

---

## 🔐 Step 5: Configure Environment Variables

Create production `.env` file:

```bash
nano .env
```

Add the following (replace with your actual values):

```bash
# Server Configuration
PORT=5555
NODE_ENV=production
APP_URL=https://your-domain.com
FRONTEND_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://mjadmin:your_secure_password@localhost:5432/mj_promoter

# Security
JWT_SECRET=$(openssl rand -base64 32)

# Optional: CORS (if frontend is on different domain)
# CORS_ORIGIN=https://your-frontend-domain.com
```

---

## 🔑 Step 6: Generate API Credentials

```bash
npx ts-node src/scripts/create-api-key.ts
```

**SAVE THE OUTPUT!** You'll need these credentials for your integrations:

- `API_KEY` (fp_key_xxx)
- `BEARER_TOKEN` (fp_token_xxx)
- `ACCOUNT_ID` (acc_xxx)

---

## 🔄 Step 7: Install PM2 Process Manager

PM2 keeps your Node.js app running and restarts it on crashes.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start your application
pm2 start dist/server.js --name mj-promoter

# Configure PM2 to start on system boot
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save

# Check status
pm2 status
pm2 logs mj-promoter --lines 50
```

### PM2 Management Commands

```bash
pm2 restart mj-promoter   # Restart app
pm2 stop mj-promoter      # Stop app
pm2 logs mj-promoter      # View logs
pm2 monit                 # Monitor resources
```

---

## 🌐 Step 8: Install and Configure Nginx

### Install Nginx

```bash
sudo apt install -y nginx
```

### Create Nginx configuration

```bash
sudo nano /etc/nginx/sites-available/mj-promoter
```

Add this configuration (replace `your-domain.com`):

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # API Backend
    location /api {
        proxy_pass http://localhost:5555;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend (if serving static files)
    location / {
        root /home/ubuntu/MJ_FIrst_Promoter/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logs
    access_log /var/log/nginx/mj-promoter-access.log;
    error_log /var/log/nginx/mj-promoter-error.log;
}
```

### Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/mj-promoter /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

---

## 🔒 Step 9: Setup SSL with Let's Encrypt (HTTPS)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Certbot will automatically configure Nginx for HTTPS
# Certificates auto-renew. Test renewal:
sudo certbot renew --dry-run
```

---

## 🔥 Step 10: Configure Firewall

```bash
# Enable UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check status
sudo ufw status
```

---

## 🚀 Step 11: Verify Deployment

### Check if services are running

```bash
# PostgreSQL
sudo systemctl status postgresql

# PM2
pm2 status

# Nginx
sudo systemctl status nginx
```

### Test the API

```bash
# Test health endpoint (create one if needed)
curl http://localhost:5555/api/health

# Test from external IP
curl https://your-domain.com/api/health
```

---

## 📊 Step 12: Database Seeding (Optional)

Seed initial data (admin user, test campaign):

```bash
cd /home/ubuntu/MJ_FIrst_Promoter
npm run seed
```

---

## 🔄 Deployment Updates

When you push code changes:

```bash
# SSH into server
ssh -i your-key.pem ubuntu@your-ec2-ip

# Navigate to project
cd /home/ubuntu/MJ_FIrst_Promoter

# Pull latest code
git pull origin main

# Install new dependencies (if any)
npm install

# Run database migrations (if any)
npx prisma migrate deploy

# Rebuild application
npm run build

# Restart PM2
pm2 restart mj-promoter

# Check logs
pm2 logs mj-promoter --lines 50
```

---

## 📈 Monitoring & Logs

### View application logs

```bash
pm2 logs mj-promoter
pm2 logs mj-promoter --lines 100 --err  # Error logs only
```

### View Nginx logs

```bash
sudo tail -f /var/log/nginx/mj-promoter-access.log
sudo tail -f /var/log/nginx/mj-promoter-error.log
```

### Database logs

```bash
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### System monitoring

```bash
pm2 monit          # PM2 monitoring
htop               # System resources (install: sudo apt install htop)
df -h              # Disk usage
free -h            # Memory usage
```

---

## 🔐 Security Best Practices

### 1. Secure PostgreSQL

```bash
# Edit PostgreSQL config to only allow local connections
sudo nano /etc/postgresql/14/main/postgresql.conf
# Set: listen_addresses = 'localhost'

sudo systemctl restart postgresql
```

### 2. Setup fail2ban (prevent brute force)

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Disable root login

```bash
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd
```

### 4. Regular updates

```bash
# Create a cron job for automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 5. Backup database

```bash
# Create backup script
sudo nano /home/ubuntu/backup-db.sh
```

Add this script:

```bash
#!/bin/bash
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U mjadmin mj_promoter | gzip > $BACKUP_DIR/mj_promoter_$DATE.sql.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "mj_promoter_*.sql.gz" -mtime +7 -delete
```

Make it executable and schedule:

```bash
chmod +x /home/ubuntu/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/ubuntu/backup-db.sh
```

---

## 🐛 Troubleshooting

### Application not starting

```bash
# Check PM2 logs
pm2 logs mj-promoter --err

# Check if port is in use
sudo lsof -i :5555

# Restart PM2
pm2 restart mj-promoter
```

### Database connection issues

```bash
# Test PostgreSQL connection
psql -U mjadmin -d mj_promoter -h localhost

# Check if PostgreSQL is running
sudo systemctl status postgresql
```

### Nginx errors

```bash
# Test Nginx config
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### Port already in use

```bash
# Find process using port 5555
sudo lsof -i :5555

# Kill the process (use PID from above)
sudo kill -9 PID
```

---

## 📱 Frontend Deployment (if separate)

If you're hosting the frontend separately (e.g., Vercel, Netlify):

1. **Update environment variables:**

   ```bash
   # In your frontend .env
   VITE_API_URL=https://your-domain.com/api
   ```

2. **Update CORS in backend `.env`:**

   ```bash
   CORS_ORIGIN=https://your-frontend-domain.com
   ```

3. **Rebuild and deploy frontend**

---

## 🎉 You're Live!

Your MJ First Promoter should now be accessible at:

- **API:** `https://your-domain.com/api`
- **Dashboard:** `https://your-domain.com`

### Test the deployment:

```bash
# Create a promoter
curl -X POST https://your-domain.com/api/v1/promoters/create \
  -H "X-API-KEY: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","first_name":"Test","last_name":"User"}'

# Search promoters
curl "https://your-domain.com/api/v2/company/promoters?search=ref_id" \
  -H "Authorization: Bearer your_token" \
  -H "Account-ID: your_account_id"
```

---

## 📚 Useful Links

- **PM2 Documentation:** https://pm2.keymetrics.io/
- **Nginx Documentation:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

---

## 🆘 Need Help?

Check the logs first:

```bash
pm2 logs mj-promoter
sudo tail -f /var/log/nginx/error.log
```

---

**🎊 Happy Deploying!**
