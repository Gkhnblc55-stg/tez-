# Nöbetçi drone planlayıcı - kurulum ve çalıştırma.
# Gereken tek program Node.js (18 veya üstü). Yoksa winget ile kurar, testleri çalıştırır, uygulamayı açar.
# Tekrar çalıştırılabilir: yapılmış adımları atlar.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Adim($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Hata($m) { Write-Host "`nHATA: $m" -ForegroundColor Red; Read-Host 'Kapatmak için Enter'; exit 1 }
function Yenile-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
function Node-Surumu {
    try { $v = (& node -v) 2>$null; if ($LASTEXITCODE -eq 0 -and $v -match '^v(\d+)') { return [int]$Matches[1] } } catch {}
    return 0
}

# --- Proje dosyaları ---
if (-not (Test-Path (Join-Path $Root 'uygulama\index.html'))) { Hata 'uygulama\index.html bulunamadı. Klasörü eksiksiz indirdiğinizden emin olun.' }

# --- 1) Node.js ---
Adim 'Node.js kontrol ediliyor'
$surum = Node-Surumu
if ($surum -lt 18) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Hata 'Node.js bulunamadı ve winget yok. https://nodejs.org adresinden LTS sürümünü kurup bu dosyayı tekrar çalıştırın.'
    }
    Write-Host 'Node.js LTS kuruluyor (winget). Windows yönetici izni isteyebilir...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    Yenile-Path
    if (Test-Path 'C:\Program Files\nodejs\node.exe') { $env:Path = 'C:\Program Files\nodejs;' + $env:Path }
    $surum = Node-Surumu
    if ($surum -lt 18) { Hata 'Node.js kurulamadı. https://nodejs.org adresinden LTS sürümünü elle kurup tekrar çalıştırın.' }
}
Write-Host ("Node.js " + (& node -v))

# --- 2) Testler ---
Adim 'Hesap motoru testleri çalıştırılıyor'
& node (Join-Path $Root 'testler\motor.test.js')
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Bazı testler başarısız oldu. Uygulama yine de açılacak; sonuçları kontrol edin.' -ForegroundColor Yellow
}

# --- 3) Çalıştır ---
Adim 'Nöbetçi başlatılıyor (tarayıcı otomatik açılır, durdurmak için Ctrl+C)'
& node (Join-Path $Root 'sunucu.js') --ac
