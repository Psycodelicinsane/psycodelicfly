@echo off
cd /d "C:\Users\Psycodelic\workspace\fly-brain-web"
start /min python -m http.server 8090
start "" "http://localhost:8090"
echo.
echo   PsycodelicFly corriendo en http://localhost:8090
echo   Cierra esta ventana para detener la mosca y el servidor.
echo.
pause
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8090 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
