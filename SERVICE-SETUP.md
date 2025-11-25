# ERO Automation Service - Setup Guide

## Cài đặt PM2

```powershell
# Cài PM2 globally
npm install -g pm2

# Cài PM2 Windows Service
npm install -g pm2-windows-service
```

## Khởi động Service

```powershell
# 1. Cài đặt dependencies
npm install

# 2. Cài Playwright browsers
npx playwright install chromium

# 3. Khởi động với PM2
pm2 start ecosystem.config.js

# 4. Xem status
pm2 status

# 5. Xem logs realtime
pm2 logs ERO-Automation

# 6. Cài đặt PM2 startup (chạy khi boot Windows)
pm2 startup
pm2 save
```

## Quản lý Service

```powershell
# Khởi động
pm2 start ERO-Automation

# Dừng
pm2 stop ERO-Automation

# Khởi động lại
pm2 restart ERO-Automation

# Xóa khỏi PM2
pm2 delete ERO-Automation

# Xem logs
pm2 logs ERO-Automation --lines 100

# Xem monitoring
pm2 monit
```

## Troubleshooting

```powershell
# Xem chi tiết lỗi
pm2 logs ERO-Automation --err

# Reset PM2
pm2 kill
pm2 start ecosystem.config.js

# Xem thông tin chi tiết
pm2 show ERO-Automation
```

## Cập nhật Code

```powershell
# Pull code mới
git pull

# Cài dependencies mới (nếu có)
npm install

# Restart service
pm2 restart ERO-Automation
```
