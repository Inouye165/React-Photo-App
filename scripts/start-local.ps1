$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "[start-local] $Message" -ForegroundColor Cyan
}

function Wait-ForHealthyContainer {
  param(
    [string]$ContainerName,
    [int]$MaxAttempts = 30,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $status = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerName 2>$null
    if ($LASTEXITCODE -eq 0 -and ($status -eq 'healthy' -or $status -eq 'running')) {
      Write-Step "$ContainerName is $status"
      return
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw "Timed out waiting for container '$ContainerName' to become healthy/running."
}

function Ensure-DockerAvailable {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI not found. Install Docker Desktop and ensure 'docker' is on PATH."
  }

  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    docker info 1>$null 2>$null
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon is not running. Start Docker Desktop, wait until it is fully started, then re-run 'npm run start:local'."
  }
}

function Invoke-DockerCompose {
  param([string[]]$Args)

  docker compose version *> $null
  if ($LASTEXITCODE -eq 0) {
    & docker compose @Args
    return
  }

  if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    & docker-compose @Args
    return
  }

  throw "Neither 'docker compose' nor 'docker-compose' is available. Install/enable Docker Compose and try again."
}

function Start-AppTerminal {
  param(
    [string]$Title,
    [string]$Command,
    [string]$RepoRoot
  )

  $escapedRoot = $RepoRoot.Replace("'", "''")
  $escapedCommand = $Command.Replace("'", "''")
  $psCommand = "Set-Location '$escapedRoot'; `$host.UI.RawUI.WindowTitle = '$Title'; $escapedCommand"

  Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $psCommand) | Out-Null
}

function Close-ExistingAppTerminals {
  param(
    [string[]]$Titles,
    [string]$RepoRoot
  )

  $repoRootEscaped = [Regex]::Escape($RepoRoot)
  $handledIds = New-Object System.Collections.Generic.HashSet[int]

  $existing = Get-Process -Name powershell -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -and ($Titles -contains $_.MainWindowTitle) }

  foreach ($process in $existing) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      Write-Step "Closed existing terminal: $($process.MainWindowTitle)"
      [void]$handledIds.Add([int]$process.Id)
    } catch {
      Write-Host "[start-local] Could not close existing terminal '$($process.MainWindowTitle)' (PID: $($process.Id))." -ForegroundColor Yellow
    }
  }

  $candidateProcesses = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'"
  foreach ($process in $candidateProcesses) {
    if ($handledIds.Contains([int]$process.ProcessId)) {
      continue
    }
    if (-not $process.CommandLine -or $process.CommandLine -notmatch $repoRootEscaped) {
      continue
    }

    foreach ($title in $Titles) {
      if ($process.CommandLine -match [Regex]::Escape("WindowTitle = '$title'")) {
        try {
          Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
          Write-Step "Closed existing terminal: $title"
          [void]$handledIds.Add([int]$process.ProcessId)
        } catch {
          Write-Host "[start-local] Could not close existing terminal '$title' (PID: $($process.ProcessId))." -ForegroundColor Yellow
        }
        break
      }
    }
  }

  $processMatchPattern = 'server\.ts|dist\\server\.js|dist/worker\.js|worker\.ts|\bvite\b|npm --prefix server start|npm run worker|npm run dev'
  $candidateNames = @('node.exe', 'npm.cmd', 'cmd.exe', 'powershell.exe')
  $repoProcesses = Get-CimInstance Win32_Process | Where-Object {
    ($candidateNames -contains $_.Name) -and
    $_.CommandLine -and
    ($_.CommandLine -match $processMatchPattern) -and
    ($_.CommandLine -match $repoRootEscaped)
  }

  foreach ($process in $repoProcesses) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-Step "Stopped existing process PID $($process.ProcessId): $($process.Name)"
    } catch {
      Write-Host "[start-local] Could not stop existing process PID $($process.ProcessId): $($process.Name)" -ForegroundColor Yellow
    }
  }
}

try {
  $repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
  Set-Location $repoRoot

  $appTerminalTitles = @('Lumina API', 'Lumina Worker', 'Lumina Frontend')
  Write-Step "Cleaning up existing app terminals before startup..."
  Close-ExistingAppTerminals -Titles $appTerminalTitles -RepoRoot $repoRoot

  Write-Step "Checking Docker availability..."
  Ensure-DockerAvailable

  Write-Step "Starting required Docker services (db + redis)..."
  Invoke-DockerCompose -Args @('up', '-d', 'db', 'redis')
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to start Docker services. Check Docker Desktop status and container logs, then re-run start:local."
  }

  Write-Step "Waiting for containers to become ready..."
  Wait-ForHealthyContainer -ContainerName 'photo-app-postgres'
  Wait-ForHealthyContainer -ContainerName 'photo-app-redis'

  $serverEnvPath = Join-Path $repoRoot 'server/.env'
  if (Test-Path $serverEnvPath) {
    $redisLine = Select-String -Path $serverEnvPath -Pattern '^REDIS_URL=' -SimpleMatch:$false | Select-Object -First 1
    if ($redisLine -and $redisLine.Line -notmatch 'redis://localhost:6379') {
      Write-Host "[start-local] Warning: server/.env REDIS_URL is '$($redisLine.Line.Substring(10))'." -ForegroundColor Yellow
      Write-Host "[start-local] Docker Redis is mapped to redis://localhost:6379. Update server/.env if worker fails." -ForegroundColor Yellow
    }
  }

  Write-Step "Opening backend terminal..."
  Start-AppTerminal -Title 'Lumina API' -Command 'npm --prefix server start' -RepoRoot $repoRoot

  Write-Step "Opening worker terminal..."
  Start-AppTerminal -Title 'Lumina Worker' -Command 'npm run worker' -RepoRoot $repoRoot

  Write-Step "Opening frontend terminal..."
  Start-AppTerminal -Title 'Lumina Frontend' -Command 'npm run dev' -RepoRoot $repoRoot

  Write-Step "Startup initiated."
  Write-Host "[start-local] API health: http://127.0.0.1:3001/health" -ForegroundColor Green
  Write-Host "[start-local] Frontend:  http://localhost:5173/" -ForegroundColor Green
} catch {
  Write-Host "[start-local] ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
