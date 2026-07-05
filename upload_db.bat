@echo off
echo Uploading local database to Hostinger server...
scp -i FINAL_PRIVATE_KEY.pem -P 65002 "C:\Users\aldawlia\AppData\Local\lawfirm-data\dev.db" u549743922@92.113.18.43:domains/lawyers.smartcodix.com/public_html/dev.db

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to upload the database.
    pause
    exit /b %ERRORLEVEL%
)

echo Database uploaded successfully!
echo Restarting Node.js App on Hostinger...
ssh -i FINAL_PRIVATE_KEY.pem -p 65002 u549743922@92.113.18.43 "mkdir -p domains/lawyers.smartcodix.com/public_html/tmp && touch domains/lawyers.smartcodix.com/public_html/tmp/restart.txt"

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to restart the app.
    pause
    exit /b %ERRORLEVEL%
)

echo Done! The database has been uploaded and the app restarted.
echo Please wait a few seconds and refresh the website.
pause
