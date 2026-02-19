$ErrorActionPreference = 'Stop'

function Get-LocalRuntimeStatePath {
  param([string]$RepoRoot)
  return Join-Path $RepoRoot '.local-runtime-state.json'
}

function Read-LocalRuntimeState {
  param([string]$StatePath)

  if (-not (Test-Path $StatePath)) {
    return $null
  }

  try {
    return Get-Content -Path $StatePath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Remove-LocalRuntimeState {
  param([string]$StatePath)

  if (Test-Path $StatePath) {
    Remove-Item -Path $StatePath -Force -ErrorAction SilentlyContinue
  }
}

function Write-Step {
  param([string]$Message)
  Write-Host "[stop-local] $Message" -ForegroundColor Cyan
}

function Stop-ProcessWithRetry {
  param(
    [int]$ProcessId,
    [string]$Description,
    [switch]$Force
  )

  for ($attempt = 1; $attempt -le 2; $attempt++) {
    try {
      if ($Force) {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
      } else {
        Stop-Process -Id $ProcessId -ErrorAction Stop
      }
      return $true
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }

  Write-Host "[stop-local] Could not stop $Description (PID: $ProcessId)." -ForegroundColor Yellow
  return $false
}

function Test-DockerAvailable {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    return $false
  }

  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    docker info 1>$null 2>$null
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }

  return ($LASTEXITCODE -eq 0)
}

function Invoke-DockerCompose {
  param([string[]]$ComposeArgs)

  docker compose version *> $null
  if ($LASTEXITCODE -eq 0) {
    & docker @('compose') @ComposeArgs
    return
  }

  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    & docker-compose @ComposeArgs
    return
  }

  throw "Neither 'docker compose' nor 'docker-compose' is available."
}

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot
$repoRootEscaped = [Regex]::Escape($repoRoot)
$runtimeStatePath = Get-LocalRuntimeStatePath -RepoRoot $repoRoot

$targetTitles = @('Lumina API', 'Lumina Worker', 'Lumina Frontend')
$closedCount = 0
$killedCount = 0
$handledPowerShellIds = New-Object System.Collections.Generic.HashSet[int]

# 0) Stop exactly tracked terminals from prior start-local run.
$state = Read-LocalRuntimeState -StatePath $runtimeStatePath
if ($state -and $state.terminals) {
  foreach ($terminal in $state.terminals) {
    $trackedPid = 0
    try {
      $trackedPid = [int]$terminal.pid
    } catch {
      $trackedPid = 0
    }

    if ($trackedPid -le 0) {
      continue
    }

    if (Stop-ProcessWithRetry -ProcessId $trackedPid -Description "tracked terminal '$($terminal.title)'" -Force) {
      Write-Step "Closed tracked terminal: $($terminal.title)"
      $closedCount++
      [void]$handledPowerShellIds.Add([int]$trackedPid)
    }
  }

  Remove-LocalRuntimeState -StatePath $runtimeStatePath
}

# 1) Close external PowerShell windows opened by start-local (title-based)
$psWindowProcesses = Get-Process -Name powershell,pwsh -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -and ($targetTitles -contains $_.MainWindowTitle) }

foreach ($process in $psWindowProcesses) {
  if (Stop-ProcessWithRetry -ProcessId $process.Id -Description "terminal '$($process.MainWindowTitle)'") {
    Write-Step "Closed terminal: $($process.MainWindowTitle)"
    $closedCount++
    [void]$handledPowerShellIds.Add([int]$process.Id)
  }
}

# 2) Fallback: detect launch command in PowerShell process command line
$terminalProcesses = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'powershell.exe|pwsh.exe' }

foreach ($process in $terminalProcesses) {
  $commandLine = $process.CommandLine
  if (-not $commandLine) {
    continue
  }

  foreach ($title in $targetTitles) {
    if ($commandLine -match [Regex]::Escape("WindowTitle = '$title'")) {
      if ($handledPowerShellIds.Contains([int]$process.ProcessId)) {
        break
      }
      if (Stop-ProcessWithRetry -ProcessId $process.ProcessId -Description "terminal '$title'") {
        Write-Step "Closed terminal: $title"
        $closedCount++
        [void]$handledPowerShellIds.Add([int]$process.ProcessId)
      }
      break
    }
  }
}

# 3) Kill lingering app processes (covers integrated terminals that remain open but should stop running)
$processMatchPattern = 'server\.ts|dist\\server\.js|dist/worker\.js|worker\.ts|\bvite\b|npm --prefix server start|npm run worker|npm run dev'
$knownOrphanPattern = 'node\s+dist[\\/]worker\.js|cmd\.exe\s+/d\s+/s\s+/c\s+node\s+dist[\\/]worker\.js|tsx\s+server\.ts|node\s+dist[\\/]server\.js|\bvite\b'
$candidateNames = @('node.exe', 'npm.cmd', 'cmd.exe', 'powershell.exe', 'pwsh.exe')
$candidates = Get-CimInstance Win32_Process | Where-Object {
  ($candidateNames -contains $_.Name) -and
  $_.CommandLine -and
  (
    (
      ($_.CommandLine -match $processMatchPattern) -and
      ($_.CommandLine -match $repoRootEscaped)
    ) -or
    ($_.CommandLine -match $knownOrphanPattern)
  )
}

foreach ($process in $candidates) {
  if (Stop-ProcessWithRetry -ProcessId $process.ProcessId -Description "$($process.Name) repo process" -Force) {
    Write-Step "Stopped process PID $($process.ProcessId): $($process.Name)"
    $killedCount++
  }
}

# 4) Safety net: kill any listener owners on known app ports
$appPorts = @(3001, 5173)
foreach ($port in $appPorts) {
  $listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $listeners) {
    continue
  }

  $ownerIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($ownerId in $ownerIds) {
    if (-not $ownerId -or $ownerId -le 0) {
      continue
    }
    if (Stop-ProcessWithRetry -ProcessId $ownerId -Description "port $port owner" -Force) {
      Write-Step "Stopped process PID $ownerId owning port $port"
      $killedCount++
    }
  }
}

Write-Step "Stopping Docker services (db + redis)..."
if (Test-DockerAvailable) {
  try {
    Invoke-DockerCompose -ComposeArgs @('stop', 'db', 'redis') | Out-Null
  } catch {
    Write-Host "[stop-local] Warning: Could not stop Docker services: $($_.Exception.Message)" -ForegroundColor Yellow
  }
} else {
  Write-Host "[stop-local] Docker daemon not available; skipping container stop." -ForegroundColor Yellow
}

Write-Step "Shutdown complete. Closed terminals: $closedCount, stopped processes: $killedCount"
