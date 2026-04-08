param(
    [switch]$SkipBrowser,
    [switch]$NoInstall,
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$engineDir = Join-Path $repoRoot "engine-python"
$runDir = Join-Path $repoRoot ".run"
$setupDir = Join-Path $repoRoot ".setup"
$nodeModulesDir = Join-Path $repoRoot "node_modules"
$venvDir = Join-Path $engineDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$frontendOut = Join-Path $runDir "frontend.out.log"
$frontendErr = Join-Path $runDir "frontend.err.log"
$engineOut = Join-Path $runDir "engine.out.log"
$engineErr = Join-Path $runDir "engine.err.log"
$requirementsFile = Join-Path $engineDir "requirements.txt"
$nodeLockFile = Join-Path $repoRoot "package-lock.json"
$nodeStamp = Join-Path $setupDir "node-deps.sha256"
$pythonStamp = Join-Path $setupDir "python-deps.sha256"

New-Item -ItemType Directory -Force -Path $runDir, $setupDir | Out-Null

function Write-Header {
    Write-Host ""
    Write-Host "=============================================================" -ForegroundColor Cyan
    Write-Host " mizan23 - Bootstrap" -ForegroundColor Cyan
    Write-Host "=============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$message) {
    Write-Host "[STEP] $message" -ForegroundColor Cyan
}

function Write-Ok([string]$message) {
    Write-Host "[OK] $message" -ForegroundColor Green
}

function Write-Warn([string]$message) {
    Write-Host "[WARN] $message" -ForegroundColor Yellow
}

function Write-Info([string]$message) {
    Write-Host "[INFO] $message" -ForegroundColor Gray
}

function Test-IsAdministrator {
    try {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Get-PrimaryLanIp {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.PrefixOrigin -ne "WellKnown" -and
                $_.InterfaceAlias -notmatch "Loopback|vEthernet|WSL|Hyper-V|VirtualBox|VMware|Tailscale|ZeroTier"
            } |
            Sort-Object -Property SkipAsSource, InterfaceMetric, PrefixLength |
            Select-Object -First 1 -ExpandProperty IPAddress

        if ($ip) {
            return $ip
        }
    } catch {
    }

    return $null
}

function Ensure-FirewallRule([string]$name, [int]$port) {
    $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Ok "Guvenlik duvari kurali hazir: $name"
        return
    }

    New-NetFirewallRule `
        -DisplayName $name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $port `
        -Profile Private | Out-Null

    Write-Ok "Guvenlik duvari kurali eklendi: $name ($port)"
}

function Require-Command([string]$name, [string]$wingetId) {
    if (Get-Command $name -ErrorAction SilentlyContinue) {
        return $true
    }

    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        throw "$name bulunamadi. winget de yok. Lutfen $name kurup tekrar deneyin."
    }

    Write-Warn "$name bulunamadi. winget ile kurulum deneniyor..."
    winget install $wingetId --silent --accept-package-agreements --accept-source-agreements | Out-Null
    throw "$name kurulumu baslatildi. Kurulum tamamlaninca RUN_ALL.bat dosyasini tekrar calistirin."
}

function Ensure-PythonRuntime {
    if ((Get-Command "python" -ErrorAction SilentlyContinue) -or (Get-Command "py" -ErrorAction SilentlyContinue)) {
        return
    }

    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        throw "Python bulunamadi ve winget de yok. Lutfen Python 3.11 kurup tekrar deneyin."
    }

    Write-Warn "Python bulunamadi. winget ile kurulum deneniyor..."
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements | Out-Null
    throw "Python kurulumu baslatildi. Kurulum tamamlaninca RUN_ALL.bat dosyasini tekrar calistirin."
}

function Resolve-PythonBootstrapCommand {
    if (Get-Command "py" -ErrorAction SilentlyContinue) {
        foreach ($candidate in @("-3.11", "-3", "")) {
            try {
                if ($candidate) {
                    $version = & py $candidate -c "import sys; print(sys.version)" 2>$null
                } else {
                    $version = & py -c "import sys; print(sys.version)" 2>$null
                }
                if ($LASTEXITCODE -eq 0 -and $version) {
                    return @{
                        FilePath = "py"
                        Prefix = @($candidate) | Where-Object { $_ }
                    }
                }
            } catch {
            }
        }
    }

    if (Get-Command "python" -ErrorAction SilentlyContinue) {
        return @{
            FilePath = "python"
            Prefix = @()
        }
    }

    throw "Python calistirilabilir durumda degil."
}

function Get-FileHashSafe([string]$path) {
    if (-not (Test-Path $path)) {
        return $null
    }
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
}

function Read-Stamp([string]$path) {
    if (-not (Test-Path $path)) {
        return $null
    }
    return (Get-Content -LiteralPath $path -Raw).Trim()
}

function Write-Stamp([string]$path, [string]$value) {
    Set-Content -LiteralPath $path -Value $value -Encoding ASCII
}

function Stop-PortProcess([int]$port) {
    $connections = @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($processId in $connections) {
        if ($processId -and $processId -ne $PID) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Info "Port $port uzerindeki eski surec durduruldu (PID $processId)."
            } catch {
                Write-Warn "Port $port icin PID $processId durdurulamadi."
            }
        }
    }
}

function Wait-HttpReady([string]$url, [string]$label, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Ok "$label hazir: $url"
                return
            }
        } catch {
        }
        Start-Sleep -Seconds 2
    }
    throw "$label hazir olmadi: $url"
}

function Start-BackgroundProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$StdOutPath,
        [string]$StdErrPath
    )

    foreach ($path in @($StdOutPath, $StdErrPath)) {
        if (-not (Test-Path $path)) { continue }
        try {
            Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        } catch {
            try {
                Clear-Content -LiteralPath $path -Force -ErrorAction Stop
            } catch {
                $archivedPath = "$path.locked.$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
                try {
                    Move-Item -LiteralPath $path -Destination $archivedPath -Force -ErrorAction Stop
                } catch {
                    Write-Warn "Log dosyasi kullaniliyor; yeni surec mevcut dosya uzerine yazmayi deneyecek: $path"
                }
            }
        }
    }

    return Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $StdOutPath `
        -RedirectStandardError $StdErrPath `
        -PassThru
}

Write-Header

Write-Step "Temel araclar kontrol ediliyor"
Require-Command -name "npm" -wingetId "OpenJS.NodeJS.LTS" | Out-Null
Ensure-PythonRuntime
$pythonBootstrap = Resolve-PythonBootstrapCommand
Write-Ok "Node.js ve Python hazir."

if (-not $SkipFirewall) {
    Write-Step "Yerel ag erisimi icin guvenlik duvari kontrol ediliyor"
    if (Test-IsAdministrator) {
        try {
            Ensure-FirewallRule -name "mizan23 Frontend 3000" -port 3000
            Ensure-FirewallRule -name "mizan23 Engine 3003" -port 3003
        } catch {
            Write-Warn "Guvenlik duvari kurallari eklenemedi: $($_.Exception.Message)"
        }
    } else {
        Write-Warn "Yonetici yetkisi olmadigi icin guvenlik duvari kurallari otomatik eklenemedi."
        Write-Warn "Ayni agdan erisim olmazsa RUN_ALL.bat dosyasini Yonetici olarak calistirin."
    }
}

Write-Step "Eski portlar temizleniyor"
Stop-PortProcess -port 3000
Stop-PortProcess -port 3003
Write-Ok "Port 3000 ve 3003 temiz."

if (-not $NoInstall) {
    Write-Step "Bagimliliklar senkronize ediliyor"

    $nodeHash = Get-FileHashSafe $nodeLockFile
    $storedNodeHash = Read-Stamp $nodeStamp
    if (-not (Test-Path $nodeModulesDir) -or -not $nodeHash -or $nodeHash -ne $storedNodeHash) {
        Write-Info "Frontend bagimliliklari yukleniyor..."
        if (Test-Path $nodeLockFile) {
            & npm ci
        } else {
            & npm install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm bagimlilik kurulumu basarisiz."
        }
        if ($nodeHash) {
            Write-Stamp $nodeStamp $nodeHash
        }
        Write-Ok "Frontend bagimliliklari hazir."
    } else {
        Write-Ok "Frontend bagimliliklari guncel."
    }

    if (-not (Test-Path $venvPython)) {
        Write-Info "Python sanal ortami olusturuluyor..."
        & $pythonBootstrap.FilePath @($pythonBootstrap.Prefix + @("-m", "venv", $venvDir))
        if ($LASTEXITCODE -ne 0) {
            throw "Python sanal ortam olusturulamadi."
        }
    }

    $pythonHash = Get-FileHashSafe $requirementsFile
    $storedPythonHash = Read-Stamp $pythonStamp
    if (-not $pythonHash -or $pythonHash -ne $storedPythonHash) {
        Write-Info "Python bagimliliklari yukleniyor..."
        & $venvPython -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) {
            throw "pip guncelleme basarisiz."
        }
        & $venvPython -m pip install -r $requirementsFile
        if ($LASTEXITCODE -ne 0) {
            throw "Python bagimlilik kurulumu basarisiz."
        }
        if ($pythonHash) {
            Write-Stamp $pythonStamp $pythonHash
        }
        Write-Ok "Python bagimliliklari hazir."
    } else {
        Write-Ok "Python bagimliliklari guncel."
    }
} else {
    Write-Warn "Kurulum adimlari atlandi."
}

Write-Step "Servisler baslatiliyor"
$engineProcess = Start-BackgroundProcess `
    -FilePath $venvPython `
    -Arguments @("-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3003") `
    -WorkingDirectory $engineDir `
    -StdOutPath $engineOut `
    -StdErrPath $engineErr

$frontendProcess = Start-BackgroundProcess `
    -FilePath "cmd.exe" `
    -Arguments @("/d", "/c", "npm run dev:frontend") `
    -WorkingDirectory $repoRoot `
    -StdOutPath $frontendOut `
    -StdErrPath $frontendErr

Write-Info "Engine PID: $($engineProcess.Id)"
Write-Info "Frontend PID: $($frontendProcess.Id)"

Write-Step "Saglik kontrolleri bekleniyor"
Wait-HttpReady -url "http://127.0.0.1:3003/api/health" -label "Python engine" -timeoutSeconds 120
Wait-HttpReady -url "http://localhost:3000" -label "Next.js arayuzu" -timeoutSeconds 180

Write-Step "Temel sistem dogrulamasi"
try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\verify-system.ps1") -Quick
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Temel dogrulama temiz."
    } else {
        Write-Warn "Temel dogrulama uyarili tamamlandi."
    }
} catch {
    Write-Warn "Temel dogrulama calisti ama tam temiz donmedi: $($_.Exception.Message)"
}

if (-not $SkipBrowser) {
    Start-Process "http://localhost:3000" | Out-Null
}

$lanIp = Get-PrimaryLanIp

Write-Host ""
Write-Ok "Sistem hazir."
Write-Info "Arayuz: http://localhost:3000"
Write-Info "Engine: http://127.0.0.1:3003"
if ($lanIp) {
    Write-Info "Ayni agdaki cihazlar icin arayuz: http://${lanIp}:3000"
    Write-Info "Ayni agdaki cihazlar icin engine: http://${lanIp}:3003"
} else {
    Write-Warn "LAN IP adresi otomatik bulunamadi. Bu durumda yerel ag erisimi icin firewall ayarlarini kontrol edin."
}
Write-Info "Frontend log: $frontendOut"
Write-Info "Engine log: $engineOut"
Write-Host ""
