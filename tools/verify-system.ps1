param(
    [switch]$Quick
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-JsonEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int]$TimeoutSec = 60
    )

    try {
        $data = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
        [pscustomobject]@{
            Name = $Name
            Url = $Url
            Ok = $true
            Data = $data
            Error = $null
        }
    } catch {
        [pscustomobject]@{
            Name = $Name
            Url = $Url
            Ok = $false
            Data = $null
            Error = $_.Exception.Message
        }
    }
}

function Write-Check([string]$Label, [bool]$Passed, [string]$Detail) {
    $prefix = if ($Passed) { "[OK]" } else { "[FAIL]" }
    $color = if ($Passed) { "Green" } else { "Red" }
    Write-Host "$prefix $Label - $Detail" -ForegroundColor $color
}

$results = @()
$criticalFailure = $false

$engineHealth = Test-JsonEndpoint -Name "Engine Health" -Url "http://127.0.0.1:3003/api/health" -TimeoutSec 20
$results += $engineHealth
Write-Check -Label $engineHealth.Name -Passed $engineHealth.Ok -Detail ($(if ($engineHealth.Ok) { "Engine erisilebilir" } else { $engineHealth.Error }))
if (-not $engineHealth.Ok) {
    exit 1
}

try {
    $frontendResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000" -TimeoutSec 20
    Write-Check -Label "Frontend" -Passed $true -Detail "HTTP $($frontendResponse.StatusCode)"
} catch {
    Write-Check -Label "Frontend" -Passed $false -Detail $_.Exception.Message
    exit 1
}

$endpointChecks = @(
    @{
        Name = "BIST"
        Url = "http://localhost:3000/api/python/market/bist/stocks?limit=25"
        Validator = {
            param($data)
            $count = @($data.results).Count
            @{ Passed = ($count -gt 0); Detail = "$count satir" }
        }
    },
    @{
        Name = "US"
        Url = "http://localhost:3000/api/python/market/analysis/us-stocks"
        Validator = {
            param($data)
            $count = @($data.all).Count
            $coverage = 0
            if ($null -ne $data.fair_value_coverage) {
                $coverage = [int]$data.fair_value_coverage
            }
            @{ Passed = ($count -gt 0); Detail = "$count satir, adil deger kapsami $coverage" }
        }
    },
    @{
        Name = "Crypto"
        Url = "http://localhost:3000/api/python/market/analysis/crypto"
        Validator = {
            param($data)
            $count = @($data.all).Count
            $btc = $data.global_reference.daily_return_pct
            @{ Passed = ($count -gt 0); Detail = "$count satir, BTC benchmark $btc" }
        }
    }
)

if (-not $Quick) {
    $endpointChecks += @(
        @{
            Name = "Funds"
            Url = "http://localhost:3000/api/python/market/analysis/funds"
            Validator = {
                param($data)
                $count = @($data.all).Count
                @{ Passed = ($count -gt 0); Detail = "$count satir" }
            }
        },
        @{
            Name = "Commodities"
            Url = "http://localhost:3000/api/python/market/analysis/commodities"
            Validator = {
                param($data)
                $count = @($data.all).Count
                @{ Passed = ($count -gt 0); Detail = "$count satir" }
            }
        }
    )
}

foreach ($check in $endpointChecks) {
    $response = Test-JsonEndpoint -Name $check.Name -Url $check.Url -TimeoutSec 120
    if (-not $response.Ok) {
        Write-Check -Label $response.Name -Passed $false -Detail $response.Error
        $criticalFailure = $true
        continue
    }

    $validation = & $check.Validator $response.Data
    Write-Check -Label $response.Name -Passed ([bool]$validation.Passed) -Detail ([string]$validation.Detail)
    if (-not $validation.Passed) {
        $criticalFailure = $true
    }
}

if ($criticalFailure) {
    exit 1
}

exit 0
