@echo off
echo ====================================
echo ERO Automation Service - Setup
echo ====================================
echo.

echo [1/5] Installing PM2...
call npm install -g pm2
if %errorlevel% neq 0 goto error

echo.
echo [2/5] Installing dependencies...
call npm install
if %errorlevel% neq 0 goto error

echo.
echo [3/5] Installing Playwright browsers...
call npx playwright install chromium
if %errorlevel% neq 0 goto error

echo.
echo [4/5] Starting service with PM2...
call pm2 start ecosystem.config.js
if %errorlevel% neq 0 goto error

echo.
echo [5/5] Saving PM2 configuration...
call pm2 save
if %errorlevel% neq 0 goto error

echo.
echo ====================================
echo Setup completed successfully!
echo ====================================
echo.
echo Service is now running. Use these commands:
echo   pm2 status          - Check service status
echo   pm2 logs ERO-Automation - View logs
echo   pm2 restart ERO-Automation - Restart service
echo.
pause
goto end

:error
echo.
echo ====================================
echo ERROR: Setup failed!
echo ====================================
echo.
pause

:end
