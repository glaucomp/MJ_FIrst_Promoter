#!/bin/bash

echo "🚀 Opening MJ Promoter Dashboard..."
echo ""
echo "📋 URLs:"
echo "   Dashboard: http://localhost:3000"
echo "   API:       http://localhost:5555/api"
echo ""
echo "🔑 Login:"
echo "   Email: admin@example.com"
echo "   Pass:  admin123"
echo ""

# Try to open in default browser
if command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v start &> /dev/null; then
    start http://localhost:3000
else
    echo "⚠️  Could not auto-open browser"
    echo "   Please open: http://localhost:3000"
fi
