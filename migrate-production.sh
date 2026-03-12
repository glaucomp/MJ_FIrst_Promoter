#!/bin/bash
# Production Migration Script - Add Username Column
# Run this on your production server

set -e

echo "🚀 Starting Production Migration: Add Username Column"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running on production server
if [ ! -d "/home/ubuntu/MJ_FIrst_Promoter" ]; then
    echo -e "${RED}❌ Error: Not in production environment${NC}"
    echo "This script should be run on your production server at /home/ubuntu/MJ_FIrst_Promoter"
    exit 1
fi

cd /home/ubuntu/MJ_FIrst_Promoter

# Backup database first
echo -e "\n${YELLOW}📦 Creating database backup...${NC}"
sudo -u postgres pg_dump mj_promoter > "/tmp/mj_promoter_backup_$(date +%Y%m%d_%H%M%S).sql"
echo -e "${GREEN}✅ Backup created${NC}"

# Pull latest code
echo -e "\n${YELLOW}📥 Pulling latest code...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code updated${NC}"

# Install dependencies
echo -e "\n${YELLOW}📦 Installing dependencies...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Run Prisma migration
echo -e "\n${YELLOW}🔄 Running database migration...${NC}"
npx prisma db push --accept-data-loss
echo -e "${GREEN}✅ Database migration complete${NC}"

# Verify migration
echo -e "\n${YELLOW}🔍 Verifying migration...${NC}"
if sudo -u postgres psql -d mj_promoter -c "\d users" | grep -q "username"; then
    echo -e "${GREEN}✅ Username column verified in database${NC}"
else
    echo -e "${RED}❌ Warning: Username column not found${NC}"
    exit 1
fi

# Restart application
echo -e "\n${YELLOW}🔄 Restarting application...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart all
    echo -e "${GREEN}✅ PM2 services restarted${NC}"
elif systemctl is-active --quiet mj-promoter; then
    sudo systemctl restart mj-promoter
    echo -e "${GREEN}✅ systemd service restarted${NC}"
else
    echo -e "${YELLOW}⚠️  Please manually restart your application${NC}"
fi

echo -e "\n${GREEN}=================================================="
echo -e "✅ Migration Complete!"
echo -e "==================================================${NC}"
echo -e "\nThe username field is now available in production."
echo -e "Your API can now accept the 'username' parameter.\n"
