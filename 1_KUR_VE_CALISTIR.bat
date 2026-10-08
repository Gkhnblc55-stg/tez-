@echo off
rem Nobetci: gerekirse Node.js kurar, testleri calistirir ve uygulamayi acar
setlocal
set "KOK=%~dp0"

rem Zip acilmadan, zip icinden calistirildiysa dosyalar gecici klasorde tek basina kalir
echo %KOK% | find /i ".zip\" >nul && goto zipten
echo %KOK% | find /i "\Rar$" >nul && goto zipten

if not exist "%KOK%kurulum.ps1" goto eksik
if not exist "%KOK%uygulama\index.html" goto eksik
if not exist "%KOK%sunucu.js" goto eksik

powershell -NoProfile -ExecutionPolicy Bypass -File "%KOK%kurulum.ps1"
pause
exit /b

:zipten
echo.
echo HATA: Bu dosya zip arsivinin icinden calistirildi.
echo Zip dosyasina sag tiklayip "Tumunu ayikla" deyin, sonra ayiklanan
echo klasorun icindeki 1_KUR_VE_CALISTIR.bat dosyasini calistirin.
echo.
pause
exit /b 1

:eksik
echo.
echo HATA: Proje dosyalari bu dosyanin yaninda bulunamadi.
echo Aranan klasor: %KOK%
echo.
echo 1_KUR_VE_CALISTIR.bat tek basina calismaz; klasorun tamami gerekir:
echo   kurulum.ps1, sunucu.js, uygulama\, testler\ ...
echo.
echo GitHub'dan indirirken: depo sayfasinda yesil "Code" dugmesi ^> "Download ZIP".
echo Zip'e sag tiklayip "Tumunu ayikla" deyin ve ayiklanan klasorun icindeki
echo 1_KUR_VE_CALISTIR.bat dosyasini calistirin.
echo.
pause
exit /b 1
