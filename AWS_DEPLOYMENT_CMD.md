cd /home/ubuntu/MJ_FIrst_Promoter
git pull origin feature/dev

# Install dependencies

npm install

# Build frontend

npm run build

# Reset database with new commission rates

docker exec mj-first-promoter-postgres-1 psql -U user -d postgres -c "DROP DATABASE IF EXISTS mj_promoter;"
docker exec mj-first-promoter-postgres-1 psql -U user -d postgres -c "CREATE DATABASE mj_promoter;"
npx prisma db push
npx prisma generate
npx tsx src/seed.ts

# Restart server

pm2 restart all
