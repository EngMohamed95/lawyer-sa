@echo off
echo ==========================================
echo    Fixing Lawyer App Database
echo ==========================================

echo Stopping any running node processes to unlock file...
taskkill /f /im node.exe >nul 2>&1

echo.
echo Deleting corrupted database files...
if exist prisma\dev.db del /f /q prisma\dev.db
if exist dev.db del /f /q dev.db
if exist prisma\dev.db-journal del /f /q prisma\dev.db-journal

echo.
echo Rebuilding database schema...
call npx prisma db push --accept-data-loss

echo.
echo Seeding fake data...
call npx prisma db seed

echo.
echo ==========================================
echo DONE! You can now start the app with: npm run dev
echo ==========================================
pause
