param(
    [switch]$SkipBrowser,
    [switch]$NoInstall,
    [switch]$SkipFirewall,
    [switch]$SkipGitPull
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try {
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

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
$adminKeyFile = Join-Path $setupDir "mizan23-admin-key.txt"
$originRepoUrl = "https://github.com/emirhangungormez/mizan23.git"
$bootstrapVersion = "2026.04"

New-Item -ItemType Directory -Force -Path $runDir, $setupDir | Out-Null

function Write-Header {
    Write-Host ""
    Write-Host "#############################################################" -ForegroundColor DarkCyan
    Write-Host "#                                                           #" -ForegroundColor DarkCyan
    Write-Host "#   mizan23                                                 #" -ForegroundColor Cyan
    Write-Host "#   Local Market Intelligence Bootstrap                     #" -ForegroundColor Cyan
    Write-Host "#                                                           #" -ForegroundColor DarkCyan
    Write-Host "#############################################################" -ForegroundColor DarkCyan
    Write-Host ("[INFO] Surum: {0}" -f $bootstrapVersion) -ForegroundColor Gray
    Write-Host ("[INFO] Klasor: {0}" -f $repoRoot) -ForegroundColor Gray
    Write-Host ""
}

function Write-Step([string]$message) {
    Write-Host ("[STEP] {0}" -f $message) -ForegroundColor Cyan
}

function Write-Ok([string]$message) {
    Write-Host ("[ OK ] {0}" -f $message) -ForegroundColor Green
}

function Write-Warn([string]$message) {
    Write-Host ("[WARN] {0}" -f $message) -ForegroundColor Yellow
}

function Write-Info([string]$message) {
    Write-Host ("[INFO] {0}" -f $message) -ForegroundColor Gray
}

function Write-Fail([string]$message) {
    Write-Host ("[FAIL] {0}" -f $message) -ForegroundColor Red
}

function Get-LogTail([string]$path, [int]$lineCount = 25) {
    if (-not (Test-Path $path)) {
        return $null
    }

    try {
        $tail = Get-Content -LiteralPath $path -Tail $lineCount -ErrorAction Stop
        if ($tail) {
            return ($tail -join [Environment]::NewLine).Trim()
        }
    } catch {
    }

    return $null
}

function Show-RecoveryHints([string]$message) {
    Write-Host ""
    Write-Host "Oneri / Sonraki adimlar:" -ForegroundColor Yellow

    if ($message -match "git komutu bulunamadi") {
        Write-Host "  1. Git for Windows kurun." -ForegroundColor Yellow
        Write-Host "  2. Sonra mizan23.bat dosyasini tekrar calistirin." -ForegroundColor Yellow
        return
    }

    if ($message -match "Python") {
        Write-Host "  1. Python kurulumunun tamamlandigindan emin olun." -ForegroundColor Yellow
        Write-Host "  2. Gerekirse mizan23.bat dosyasini Yonetici olarak tekrar calistirin." -ForegroundColor Yellow
        Write-Host "  3. Hala olmuyorsa bilgisayari bir kez yeniden baslatip tekrar deneyin." -ForegroundColor Yellow
        return
    }

    if ($message -match "npm|Node") {
        Write-Host "  1. Node.js LTS kurulumunu kontrol edin." -ForegroundColor Yellow
        Write-Host "  2. Gerekirse mizan23.bat dosyasini Yonetici olarak tekrar calistirin." -ForegroundColor Yellow
        return
    }

    Write-Host "  1. mizan23.bat dosyasini Yonetici olarak tekrar calistirin." -ForegroundColor Yellow
    Write-Host "  2. README kurulum notlarini kontrol edin." -ForegroundColor Yellow
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
    throw "$name kurulumu baslatildi. Kurulum tamamlaninca mizan23.bat dosyasini tekrar calistirin."
}

function Find-PythonExecutable {
    $candidates = New-Object System.Collections.Generic.List[string]

    foreach ($commandName in @("py", "python")) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($command -and $command.Source) {
            $candidates.Add($command.Source)
        }
    }

    foreach ($base in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not $base) { continue }

        foreach ($path in @(
            (Join-Path $base "Programs\Python\Python311\python.exe"),
            (Join-Path $base "Programs\Python\Python312\python.exe"),
            (Join-Path $base "Programs\Python\Python313\python.exe"),
            (Join-Path $base "Python311\python.exe"),
            (Join-Path $base "Python312\python.exe"),
            (Join-Path $base "Python313\python.exe")
        )) {
            if ($path) {
                $candidates.Add($path)
            }
        }
    }

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not $candidate) { continue }
        if (-not (Test-Path $candidate)) { continue }

        try {
            $version = & $candidate -c "import sys; print(sys.version)" 2>$null
            if ($LASTEXITCODE -eq 0 -and $version) {
                return $candidate
            }
        } catch {
        }
    }

    return $null
}

function Ensure-GitCommand {
    $git = Get-Command "git" -ErrorAction SilentlyContinue
    if ($git) {
        return $git.Source
    }

    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        throw "git komutu bulunamadi. winget de yok. Lutfen Git for Windows kurup tekrar deneyin."
    }

    Write-Warn "git bulunamadi. winget ile Git kurulumu deneniyor..."
    winget install Git.Git --silent --accept-package-agreements --accept-source-agreements | Out-Null

    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $git = Get-Command "git" -ErrorAction SilentlyContinue
        if ($git) {
            Write-Ok "Git bulundu ve kullanima hazirlandi."
            return $git.Source
        }
    }

    throw "Git kurulumu baslatildi ancak henuz kullanilabilir gorunmuyor. Kurulum tamamlaninca mizan23.bat dosyasini tekrar calistirin."
}

function Bootstrap-RepositoryMetadata {
    param(
        [string]$GitPath
    )

    Write-Step "Git repo metadatasi bulunamadi, klasor repo haline getiriliyor"

    $tempCloneDir = Join-Path $setupDir "repo-bootstrap"
    if (Test-Path $tempCloneDir) {
        Remove-Item -LiteralPath $tempCloneDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    & $GitPath clone --depth 1 $originRepoUrl $tempCloneDir
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $tempCloneDir ".git"))) {
        throw "Repo bootstrap islemi basarisiz oldu. Lutfen mizan23.bat dosyasini tekrar deneyin."
    }

    $robocopyLog = Join-Path $runDir "repo-bootstrap.log"
    $null = Start-Process -FilePath "robocopy.exe" -ArgumentList @(
        $tempCloneDir,
        $repoRoot,
        "/E",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/NP",
        "/R:1",
        "/W:1",
        "/XD", ".git", "node_modules", ".next", ".run", ".setup", "engine-python\\.venv"
    ) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $robocopyLog

    Copy-Item -LiteralPath (Join-Path $tempCloneDir ".git") -Destination (Join-Path $repoRoot ".git") -Recurse -Force
    Remove-Item -LiteralPath $tempCloneDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Ok "Klasor git repo yapisina kavustu ve guncel kod yuklendi."
}

function Update-RepositoryFromOrigin {
    if ($SkipGitPull) {
        Write-Warn "Git guncellemesi atlandi."
        return
    }

    $gitPath = Ensure-GitCommand

    if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
        Bootstrap-RepositoryMetadata -GitPath $gitPath
    }

    Write-Step "Repo guncelligi kontrol ediliyor"

    try {
        & $gitPath -C $repoRoot fetch --prune origin
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "origin fetch basarisiz oldu. Mevcut kod ile devam ediliyor."
            return
        }

        $dirtyState = (& $gitPath -C $repoRoot status --porcelain | Out-String).Trim()
        if ($dirtyState) {
            Write-Warn "Yerel degisiklik var. Repo otomatik cekilmedi."
            Write-Warn "Degisiklikleri commit edin ya da stash alin; sonra mizan23.bat tekrar cekebilir."
            return
        }

        $branch = (& $gitPath -C $repoRoot branch --show-current | Out-String).Trim()
        if (-not $branch) {
            Write-Warn "Aktif branch bulunamadi. Repo otomatik cekilmedi."
            return
        }

        $upstream = (& $gitPath -C $repoRoot rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null | Out-String).Trim()
        if (-not $upstream) {
            Write-Warn "Upstream branch tanimli degil. Repo otomatik cekilmedi."
            return
        }

        $localCommit = (& $gitPath -C $repoRoot rev-parse HEAD | Out-String).Trim()
        $remoteCommit = (& $gitPath -C $repoRoot rev-parse $upstream | Out-String).Trim()

        if ($localCommit -eq $remoteCommit) {
            Write-Ok "Repo zaten guncel."
            return
        }

        & $gitPath -C $repoRoot pull --ff-only
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Repo origin uzerinden guncellendi."
        } else {
            Write-Warn "Repo otomatik cekilemedi. Mevcut kod ile devam ediliyor."
        }
    } catch {
        Write-Warn "Repo guncellemesi sirasinda hata olustu: $($_.Exception.Message)"
    }
}

function Ensure-PythonRuntime {
    $existingPython = Find-PythonExecutable
    if ($existingPython) {
        $pythonDir = Split-Path -Path $existingPython -Parent
        if ($pythonDir -and ($env:PATH -notlike "*$pythonDir*")) {
            $env:PATH = "$pythonDir;$env:PATH"
        }
        return $existingPython
    }

    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        throw "Python bulunamadi ve winget de yok. Lutfen Python 3.11 kurup tekrar deneyin."
    }

    Write-Warn "Python bulunamadi. winget ile kurulum deneniyor..."
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements | Out-Null

    Start-Sleep -Seconds 5
    $installedPython = Find-PythonExecutable
    if ($installedPython) {
        $pythonDir = Split-Path -Path $installedPython -Parent
        if ($pythonDir -and ($env:PATH -notlike "*$pythonDir*")) {
            $env:PATH = "$pythonDir;$env:PATH"
        }
        Write-Ok "Python bulundu ve kullanima hazirlandi."
        return $installedPython
    }

    throw "Python kurulumu baslatildi ancak henuz kullanilabilir gorunmuyor. Kurulum tamamlaninca mizan23.bat dosyasini tekrar calistirin."
}

function Resolve-PythonBootstrapCommand([string]$resolvedPythonPath) {
    if ($resolvedPythonPath) {
        return @{
            FilePath = $resolvedPythonPath
            Prefix = @()
        }
    }

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

function Get-OrCreateAdminKey {
    if (Test-Path $adminKeyFile) {
        $existing = (Get-Content -LiteralPath $adminKeyFile -Raw).Trim()
        if ($existing) {
            return $existing
        }
    }

    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $generated = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
    Set-Content -LiteralPath $adminKeyFile -Value $generated -Encoding ASCII
    return $generated
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

function Wait-HttpReady(
    [string]$url,
    [string]$label,
    [int]$timeoutSeconds,
    $Process = $null,
    [string]$StdErrPath = "",
    [string]$StdOutPath = ""
) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    $startedAt = Get-Date
    $lastProgressSecond = -10
    Write-Info "$label bekleniyor: $url"

    while ((Get-Date) -lt $deadline) {
        $elapsedSeconds = [int]((Get-Date) - $startedAt).TotalSeconds
        if (($elapsedSeconds - $lastProgressSecond) -ge 10) {
            $lastProgressSecond = $elapsedSeconds
            Write-Info "$label hazir degil, bekleniyor... (${elapsedSeconds}s)"
        }

        if ($Process) {
            try {
                if ($Process.HasExited) {
                    $errorTail = Get-LogTail -path $StdErrPath
                    $outputTail = Get-LogTail -path $StdOutPath
                    $detail = $errorTail
                    if (-not $detail) {
                        $detail = $outputTail
                    }
                    if ($detail) {
                        throw "$label baslatilamadi. Son log:`n$detail"
                    }
                    throw "$label baslatilamadi. Ilgili surec erken kapandi."
                }
            } catch {
                throw
            }
        }

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

    $errorTail = Get-LogTail -path $StdErrPath
    $outputTail = Get-LogTail -path $StdOutPath
    $detail = $errorTail
    if (-not $detail) {
        $detail = $outputTail
    }

    if ($detail) {
        throw "$label zaman asimina ugradi. Son log:`n$detail"
    }

    throw "$label zaman asimina ugradi: $url"
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

trap [System.Exception] {
    $message = $_.Exception.Message
    Write-Host ""
    Write-Host "=============================================================" -ForegroundColor Red
    Write-Fail "mizan23 baslatma akisi durdu."
    Write-Fail $message
    Write-Host "=============================================================" -ForegroundColor Red
    Show-RecoveryHints $message
    Write-Host ""
    exit 1
}

Write-Header

Write-Step "Temel araclar kontrol ediliyor"
Require-Command -name "npm" -wingetId "OpenJS.NodeJS.LTS" | Out-Null
$resolvedPythonPath = Ensure-PythonRuntime
$pythonBootstrap = Resolve-PythonBootstrapCommand -resolvedPythonPath $resolvedPythonPath
Write-Ok "Node.js ve Python hazir."

$adminKey = Get-OrCreateAdminKey
$env:MIZAN23_ADMIN_KEY = $adminKey
Write-Ok "Yerel yonetim anahtari hazir."

Update-RepositoryFromOrigin

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
        Write-Warn "Ayni agdan erisim olmazsa mizan23.bat dosyasini Yonetici olarak calistirin."
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
Wait-HttpReady -url "http://127.0.0.1:3003/api/health" -label "Python engine" -timeoutSeconds 120 -Process $engineProcess -StdErrPath $engineErr -StdOutPath $engineOut
Wait-HttpReady -url "http://localhost:3000" -label "Next.js arayuzu" -timeoutSeconds 180 -Process $frontendProcess -StdErrPath $frontendErr -StdOutPath $frontendOut

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
