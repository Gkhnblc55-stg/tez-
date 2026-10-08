@echo off
rem Kurulumdan sonra Nobetci'yi hizlica baslatir
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js bulunamadi. Once 1_KUR_VE_CALISTIR.bat dosyasini calistirin. & pause & exit /b 1)
echo Nobetci baslatiliyor. Tarayici otomatik acilacak (durdurmak icin Ctrl+C).
node sunucu.js --ac
pause
