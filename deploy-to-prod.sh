#!/bin/bash
# Deploy script for production server

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "🗄️  Running database migrations..."
npx prisma migrate deploy

# Rebuild application
echo "🏗️  Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart mj-promoter

# Show logs
echo "📋 Showing recent logs..."
pm2 logs mj-promoter --lines 20 --nostream

echo "✅ Deployment complete!"
echo "🔍 Monitor logs with: pm2 logs mj-promoter"
