@echo off
rem Kurulumdan sonra Nobetci'yi hizlica baslatir
setlocal
cd /d "%~dp0"
if not exist "sunucu.js" goto eksik
if not exist "uygulama\index.html" goto eksik
where node >nul 2>nul || (echo Node.js bulunamadi. Once 1_KUR_VE_CALISTIR.bat dosyasini calistirin. & pause & exit /b 1)
echo Nobetci baslatiliyor. Tarayici otomatik acilacak (durdurmak icin Ctrl+C).
node sunucu.js --ac
pause
exit /b

:eksik
echo.
echo HATA: Proje dosyalari bu dosyanin yaninda bulunamadi (%~dp0).
echo Klasorun tamamini indirip zip'i ayiklayin, sonra 1_KUR_VE_CALISTIR.bat dosyasini calistirin.
echo.
pause
exit /b 1
