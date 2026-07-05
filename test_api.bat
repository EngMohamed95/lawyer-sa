@echo off
echo Testing GET /api/debug ...
curl -s -v https://lawyers.smartcodix.com/api/debug

echo.
echo.
echo Testing POST /api/clients ...
curl -s -v -X POST -H "Content-Type: application/json" -d "{\"fullName\":\"Test\",\"clientType\":\"INDIVIDUAL\",\"phone\":\"01012345678\"}" https://lawyers.smartcodix.com/api/clients

echo.
echo.
pause
