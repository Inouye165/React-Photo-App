param(
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipMigrations,
  [int]$MonitorSeconds = 45
)

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

function Write-LocalRuntimeState {
  param(
    [string]$StatePath,
    [object]$State
  )

  $json = $State | ConvertTo-Json -Depth 6
  Set-Content -Path $StatePath -Value $json -Encoding UTF8
}

function Remove-LocalRuntimeState {
  param([string]$StatePath)

  if (Test-Path $StatePath) {
    Remove-Item -Path $StatePath -Force -ErrorAction SilentlyContinue
  }
}

function Stop-TrackedRuntimeTerminals {
  param([string]$StatePath)

  $state = Read-LocalRuntimeState -StatePath $StatePath
  if (-not $state -or -not $state.terminals) {
    return
  }

  foreach ($terminal in $state.terminals) {
    $pidValue = 0
    try {
      $pidValue = [int]$terminal.pid
    } catch {
      $pidValue = 0
    }

    if ($pidValue -le 0) {
      continue
    }

    try {
      $proc = Get-Process -Id $pidValue -ErrorAction Stop
      Stop-Process -Id $proc.Id -Force -ErrorAction Stop
      Write-Step "Stopped tracked terminal PID $pidValue ($($terminal.title))"
    } catch {
      # Ignore stale/missing process IDs.
    }
  }

  Remove-LocalRuntimeState -StatePath $StatePath
}

function Write-Step {
  param([string]$Message)
  Write-Host "[start-local] $Message" -ForegroundColor Cyan
}

function Initialize-StartLocalLogging {
  param([string]$RepoRoot)

  $logDir = Join-Path $RepoRoot 'logs'
  if (-not (Test-Path $logDir)) {
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
  }

  $script:StartLocalRunId = [guid]::NewGuid().ToString('N')
  $script:StartLocalHostName = [System.Net.Dns]::GetHostName()
  $script:StartLocalLogPath = Join-Path $logDir 'start-local-runs.jsonl'
}

function Write-StartLocalLog {
  param(
    [string]$Status,
    [string]$Stage,
    [string]$Message,
    [string]$Issue = '',
    [string]$Fix = ''
  )

  if (-not $script:StartLocalLogPath) {
    return
  }

  $entry = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    host = $script:StartLocalHostName
    runId = $script:StartLocalRunId
    status = $Status
    stage = $Stage
    message = $Message
    issue = $Issue
    fix = $Fix
  }

  Add-Content -Path $script:StartLocalLogPath -Value ($entry | ConvertTo-Json -Compress) -Encoding UTF8
}

function Get-FailureFixHint {
  param([string]$ErrorMessage)

  if ($ErrorMessage -match 'Docker|docker') {
    return 'Open Docker Desktop, wait until engine is healthy, then re-run npm run start:local.'
  }

  if ($ErrorMessage -match 'npm|dependencies|install') {
    return 'Run npm install at repo root and npm --prefix server install, then retry startup.'
  }

  if ($ErrorMessage -match 'migration|knex|database|DB') {
    return 'Verify SUPABASE_DB_URL(_MIGRATIONS) and DB connectivity, then run npm --prefix server run verify:migrations and retry.'
  }

  if ($ErrorMessage -match 'health|reachable|Timed out') {
    return 'Check API/Frontend terminal output and container logs, fix the root error, then run npm run start:local again.'
  }

  return 'Review the terminal output for the failing step and resolve the underlying error before retrying.'
}

function Test-NodeModulesNeedsInstall {
  param([string]$ProjectPath)

  $nodeModulesPath = Join-Path $ProjectPath 'node_modules'
  if (-not (Test-Path $nodeModulesPath)) {
    return $true
  }

  $lockPath = Join-Path $ProjectPath 'package-lock.json'
  if (-not (Test-Path $lockPath)) {
    return $false
  }

  $nodeModulesMtime = (Get-Item $nodeModulesPath).LastWriteTimeUtc
  $lockMtime = (Get-Item $lockPath).LastWriteTimeUtc
  return ($lockMtime -gt $nodeModulesMtime)
}

function Get-NpmExecutable {
  if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    return 'npm.cmd'
  }

  if (Get-Command npm -ErrorAction SilentlyContinue) {
    return 'npm'
  }

  throw 'npm not found on PATH. Install Node.js 20+ and npm 10+.'
}

function Invoke-NpmCommand {
  param(
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [int]$MaxAttempts = 2
  )

  $npmExe = Get-NpmExecutable
  $invocationLabel = "$npmExe $($Arguments -join ' ')"

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if ($WorkingDirectory) {
      Push-Location $WorkingDirectory
    }

    $commandOutput = @()
    $previousErrorAction = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $commandOutput = & $npmExe @Arguments 2>&1
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorAction
      if ($WorkingDirectory) {
        Pop-Location
      }
    }

    if ($exitCode -eq 0) {
      return
    }

    $outputText = ($commandOutput | ForEach-Object { $_.ToString() }) -join "`n"
    $looksLikeCommandParseIssue = $outputText -match 'Unknown command:\s*"?pm"?'

    if ($attempt -lt $MaxAttempts -and $looksLikeCommandParseIssue) {
      Write-Host "[start-local] npm command parse anomaly detected ('$invocationLabel'). Retrying..." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
      continue
    }

    throw "Command failed ($invocationLabel). Exit code: $exitCode"
  }
}

function Ensure-NpmDependencies {
  param(
    [string]$RepoRoot,
    [switch]$SkipInstall
  )

  if ($SkipInstall) {
    Write-Step 'Skipping dependency install checks (SkipInstall requested).'
    return
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm not found on PATH. Install Node.js 20+ and npm 10+.'
  }

  $rootNeedsInstall = Test-NodeModulesNeedsInstall -ProjectPath $RepoRoot
  $serverPath = Join-Path $RepoRoot 'server'
  $serverNeedsInstall = Test-NodeModulesNeedsInstall -ProjectPath $serverPath

  if ($rootNeedsInstall) {
    Write-Step 'Installing/updating root dependencies...'
    Invoke-NpmCommand -Arguments @('install') -WorkingDirectory $RepoRoot
  } else {
    Write-Step 'Root dependencies already present.'
  }

  if ($serverNeedsInstall) {
    Write-Step 'Installing/updating server dependencies...'
    Invoke-NpmCommand -Arguments @('--prefix', 'server', 'install') -WorkingDirectory $RepoRoot
  } else {
    Write-Step 'Server dependencies already present.'
  }
}

function Ensure-ServerBuildArtifacts {
  param(
    [switch]$SkipBuild
  )

  if ($SkipBuild) {
    Write-Step 'Skipping server build step (SkipBuild requested).'
    return
  }

  Write-Step 'Building server artifacts for API/worker startup...'
  Invoke-NpmCommand -Arguments @('--prefix', 'server', 'run', 'build') -WorkingDirectory (Resolve-Path "$PSScriptRoot\..").Path
}

function Ensure-DatabaseMigrations {
  param(
    [switch]$SkipMigrations
  )

  if ($SkipMigrations) {
    Write-Step 'Skipping migration checks (SkipMigrations requested).'
    return
  }

  Write-Step 'Verifying migration state...'
  Invoke-NpmCommand -Arguments @('--prefix', 'server', 'run', 'verify:migrations') -WorkingDirectory (Resolve-Path "$PSScriptRoot\..").Path

  Write-Step 'Applying pending migrations (if any)...'
  & node server/scripts/run-migrations.js
  if ($LASTEXITCODE -ne 0) {
    throw 'Running migrations failed.'
  }
}

function Test-ProcessAlive {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return $false
  }

  try {
    Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-LogHasErrorPattern {
  param([string]$LogPath)

  if (-not (Test-Path $LogPath)) {
    return $false
  }

  $tail = Get-Content -Path $LogPath -Tail 200 -ErrorAction SilentlyContinue
  if (-not $tail) {
    return $false
  }

  $hardFailurePattern = '(^\[start-local\]\s*ERROR:|\bUnhandledPromiseRejection\b|\bEADDRINUSE\b|\bECONNREFUSED\b|\bECONNRESET\b|\bFAILED:|\bMigration verification failed\b|\bRunning migrations failed\b|\bTypeError:\b|\bReferenceError:\b|\bSyntaxError:\b)'
  $benignPattern = '(disabling tracing to prevent network errors|Optional env missing; some features may be disabled|GOOGLE_MAPS_API_KEY is missing|POI lookups disabled)'

  foreach ($line in $tail) {
    if ($line -match $benignPattern) {
      continue
    }
    if ($line -match $hardFailurePattern) {
      return $true
    }
  }

  return $false
}

function Monitor-StartupProcesses {
  param(
    [int]$ApiPid,
    [int]$WorkerPid,
    [int]$FrontendPid,
    [string]$ApiLogPath,
    [string]$WorkerLogPath,
    [string]$FrontendLogPath,
    [int]$DurationSeconds = 45
  )

  Write-Step "Monitoring API/Worker/Frontend processes for $DurationSeconds seconds..."
  $deadline = (Get-Date).AddSeconds($DurationSeconds)

  while ((Get-Date) -lt $deadline) {
    if (-not (Test-ProcessAlive -ProcessId $ApiPid)) {
      throw 'API process exited during startup monitoring window.'
    }
    if (-not (Test-ProcessAlive -ProcessId $WorkerPid)) {
      throw 'Worker process exited during startup monitoring window.'
    }
    if (-not (Test-ProcessAlive -ProcessId $FrontendPid)) {
      throw 'Frontend process exited during startup monitoring window.'
    }

    if (Test-LogHasErrorPattern -LogPath $ApiLogPath) {
      throw "API log indicates an error. Review: $ApiLogPath"
    }
    if (Test-LogHasErrorPattern -LogPath $WorkerLogPath) {
      throw "Worker log indicates an error. Review: $WorkerLogPath"
    }
    if (Test-LogHasErrorPattern -LogPath $FrontendLogPath) {
      throw "Frontend log indicates an error. Review: $FrontendLogPath"
    }

    Start-Sleep -Seconds 3
  }

  Write-Step 'Startup monitoring window passed with no detected stuck/error signals.'
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

function Wait-ForHttpEndpoint {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$MaxAttempts = 60,
    [int]$DelaySeconds = 2
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Step "$Url is reachable (HTTP $($response.StatusCode))"
        return
      }
    } catch {
      # keep waiting
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw "Timed out waiting for endpoint '$Url' to become reachable."
}

function Get-EnvValueFromFile {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $line = Select-String -Path $Path -Pattern "^$Name=(.*)$" -SimpleMatch:$false | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return $line.Matches[0].Groups[1].Value.Trim()
}

function Ensure-LocalSupabase {
  param([string]$RepoRoot)

  $rootEnv = Join-Path $RepoRoot '.env'
  $serverEnv = Join-Path $RepoRoot 'server/.env'

  $viteSupabaseUrl = Get-EnvValueFromFile -Path $rootEnv -Name 'VITE_SUPABASE_URL'
  $serverSupabaseUrl = Get-EnvValueFromFile -Path $serverEnv -Name 'SUPABASE_URL'

  $targetUrl = $null
  if ($viteSupabaseUrl) {
    $targetUrl = $viteSupabaseUrl
  } elseif ($serverSupabaseUrl) {
    $targetUrl = $serverSupabaseUrl
  }

  if (-not $targetUrl) {
    return
  }

  if ($targetUrl -notmatch '^https?://(127\.0\.0\.1|localhost):54321/?$') {
    return
  }

  $healthUrl = 'http://127.0.0.1:54321/auth/v1/health'
  try {
    $probe = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3
    if ($probe.StatusCode -ge 200 -and $probe.StatusCode -lt 500) {
      Write-Step "Local Supabase is reachable at $healthUrl"
      return
    }
  } catch {
    # start local supabase below
  }

  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "[start-local] Warning: local Supabase URL is configured but Supabase CLI is not installed." -ForegroundColor Yellow
    Write-Host "[start-local] Install Supabase CLI or update VITE_SUPABASE_URL/SUPABASE_URL to a reachable endpoint." -ForegroundColor Yellow
    return
  }

  Write-Step "Local Supabase endpoint is down; starting Supabase local stack..."
  & supabase start
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[start-local] Supabase start failed; attempting self-heal for stale containers..." -ForegroundColor Yellow
    # Use 'stop' without --no-backup to preserve local DB volumes (user data).
    & supabase stop | Out-Null

    $stale = docker ps -a --format "{{.Names}}" | Select-String -Pattern '^supabase_'
    if ($stale) {
      $staleNames = $stale | ForEach-Object { $_.Line.Trim() }
      if ($staleNames.Count -gt 0) {
        docker rm -f $staleNames | Out-Null
        Write-Step "Removed stale Supabase containers"
      }
    }

    & supabase start
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to start local Supabase after self-heal. Run 'supabase start --debug' and fix startup errors, then retry."
    }
  }

  Write-Step "Waiting for local Supabase auth health endpoint..."
  Wait-ForHttpEndpoint -Url $healthUrl -MaxAttempts 120 -DelaySeconds 2
}

function Get-LocalSupabaseDbUrl {
  param([string]$RepoRoot)

  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    return $null
  }

  try {
    Push-Location $RepoRoot
    $statusJson = & supabase status --output json 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $statusJson) {
      return $null
    }

    $status = $statusJson | ConvertFrom-Json
    if (-not $status) {
      return $null
    }

    $dbUrlProp = $status.PSObject.Properties['DB_URL']
    if ($dbUrlProp -and $dbUrlProp.Value) {
      return [string]$dbUrlProp.Value
    }

    $dbUrlLegacyProp = $status.PSObject.Properties['DB URL']
    if ($dbUrlLegacyProp -and $dbUrlLegacyProp.Value) {
      return [string]$dbUrlLegacyProp.Value
    }

    return $null
  } catch {
    return $null
  } finally {
    Pop-Location
  }
}

function Get-ConfiguredLocalSupabaseDbUrl {
  param([string]$RepoRoot)

  $serverEnv = Join-Path $RepoRoot 'server/.env'
  $configured = Get-EnvValueFromFile -Path $serverEnv -Name 'SUPABASE_DB_URL'
  if (-not $configured) {
    return $null
  }

  if ($configured -match '@(127\.0\.0\.1|localhost):54330/') {
    return $configured
  }

  return $null
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

  if ($LASTEXITCODE -eq 0) {
    return
  }

  $dockerDesktopExe = Join-Path $Env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dockerDesktopExe)) {
    throw "Docker daemon is not running and Docker Desktop was not found at '$dockerDesktopExe'. Start Docker Desktop manually, wait until it is ready, then re-run 'npm run start:local'."
  }

  Write-Step "Docker daemon is not running. Attempting to start Docker Desktop..."
  Start-Process -FilePath $dockerDesktopExe | Out-Null

  $maxAttempts = 60
  $delaySeconds = 2
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $previousErrorAction = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      docker info 1>$null 2>$null
    } finally {
      $ErrorActionPreference = $previousErrorAction
    }

    if ($LASTEXITCODE -eq 0) {
      Write-Step "Docker daemon is ready"
      return
    }

    Start-Sleep -Seconds $delaySeconds
  }

  throw "Docker daemon did not become ready in time. Open Docker Desktop, wait for it to fully start, then re-run 'npm run start:local'."
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

  throw "Neither 'docker compose' nor 'docker-compose' is available. Install/enable Docker Compose and try again."
}

function Start-AppTerminal {
  param(
    [string]$Title,
    [string]$Command,
    [string]$RepoRoot
  )

  $escapedRoot = $RepoRoot.Replace("'", "''")
  $escapedTitle = $Title.Replace("'", "''")
  $escapedCommand = $Command.Replace("`r`n", "`n")
  $scriptToRun = @"
Set-Location '$escapedRoot'
`$host.UI.RawUI.WindowTitle = '$escapedTitle'
$escapedCommand
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($scriptToRun))

  $shellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
  $process = Start-Process $shellExe -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -PassThru
  return $process
}

function Close-ExistingAppTerminals {
  param(
    [string[]]$Titles,
    [string]$RepoRoot
  )

  $repoRootEscaped = [Regex]::Escape($RepoRoot)
  $handledIds = New-Object System.Collections.Generic.HashSet[int]

  $existing = Get-Process -Name powershell,pwsh -ErrorAction SilentlyContinue |
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

  $candidateProcesses = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'powershell.exe|pwsh.exe' }
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
  $candidateNames = @('node.exe', 'npm.cmd', 'cmd.exe', 'powershell.exe', 'pwsh.exe')
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
  $runtimeStatePath = Get-LocalRuntimeStatePath -RepoRoot $repoRoot
  Set-Location $repoRoot
  Initialize-StartLocalLogging -RepoRoot $repoRoot
  Write-StartLocalLog -Status 'info' -Stage 'start' -Message 'start-local run started'

  $appTerminalTitles = @('Lumina API', 'Lumina Worker', 'Lumina Frontend')
  Write-Step "Stopping any tracked local runtime terminals..."
  Stop-TrackedRuntimeTerminals -StatePath $runtimeStatePath

  Write-Step "Cleaning up existing app terminals before startup..."
  Close-ExistingAppTerminals -Titles $appTerminalTitles -RepoRoot $repoRoot

  Write-Step "Checking Docker availability..."
  Ensure-DockerAvailable

  Write-Step "Checking local Supabase availability..."
  Ensure-LocalSupabase -RepoRoot $repoRoot

  Write-Step "Starting required Docker services (db + redis)..."
  Invoke-DockerCompose -ComposeArgs @('up', '-d', 'db', 'redis')
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to start Docker services. Check Docker Desktop status and container logs, then re-run start:local."
  }

  Write-Step "Waiting for containers to become ready..."
  Wait-ForHealthyContainer -ContainerName 'photo-app-postgres'
  Wait-ForHealthyContainer -ContainerName 'photo-app-redis'

  $serverEnvPath = Join-Path $repoRoot 'server/.env'
  if (Test-Path $serverEnvPath) {
    $redisLine = Select-String -Path $serverEnvPath -Pattern '^REDIS_URL=' -SimpleMatch:$false | Select-Object -First 1
    $dbLine = Select-String -Path $serverEnvPath -Pattern '^SUPABASE_DB_URL=' -SimpleMatch:$false | Select-Object -First 1
    if ($redisLine -and $redisLine.Line -notmatch 'redis://localhost:6379') {
      Write-Host "[start-local] Warning: server/.env REDIS_URL is '$($redisLine.Line.Substring(10))'." -ForegroundColor Yellow
      Write-Host "[start-local] Docker Redis is mapped to redis://localhost:6379. Update server/.env if worker fails." -ForegroundColor Yellow
    }
    if ($dbLine -and $dbLine.Line -notmatch '@(localhost|127\.0\.0\.1):5432/') {
      Write-Host "[start-local] Notice: server/.env SUPABASE_DB_URL is '$($dbLine.Line.Substring(16))'." -ForegroundColor Yellow
      Write-Host "[start-local] Using DB/Redis from environment files by default (no DB override)." -ForegroundColor Yellow
    }
  }

  $localDbUrl = 'postgresql://photoapp:photoapp_dev@127.0.0.1:5432/photoapp'
  $localSupabaseDbUrl = Get-LocalSupabaseDbUrl -RepoRoot $repoRoot
  if (-not $localSupabaseDbUrl) {
    $localSupabaseDbUrl = Get-ConfiguredLocalSupabaseDbUrl -RepoRoot $repoRoot
  }
  $localRedisUrl = 'redis://localhost:6379'
  $forceLocalDockerDb = $true
  if ($localSupabaseDbUrl) {
    $forceLocalDockerDb = $false
  }
  if ($Env:START_LOCAL_FORCE_DOCKER_DB -eq 'false' -or $Env:START_LOCAL_USE_ENV -eq 'true') {
    $forceLocalDockerDb = $false
  }
  if ($Env:START_LOCAL_FORCE_DOCKER_DB -eq 'true') {
    $forceLocalDockerDb = $true
  }
  $serverEnvPrefix = ''
  if ($forceLocalDockerDb) {
    Write-Step "Using local Docker Postgres + Redis for backend/worker (set START_LOCAL_USE_ENV=true to disable)."
    $env:SUPABASE_DB_URL = $localDbUrl
    $env:SUPABASE_DB_URL_MIGRATIONS = $localDbUrl
    $env:DATABASE_URL = $localDbUrl
    $env:DB_SSL_DISABLED = 'true'
    $env:REDIS_URL = $localRedisUrl
    $serverEnvPrefix = "`$env:SUPABASE_DB_URL='$localDbUrl'; `$env:SUPABASE_DB_URL_MIGRATIONS='$localDbUrl'; `$env:DATABASE_URL='$localDbUrl'; `$env:DB_SSL_DISABLED='true'; `$env:REDIS_URL='$localRedisUrl';"
  } elseif ($localSupabaseDbUrl) {
    Write-Step "Using local Supabase Postgres from 'supabase status' + local Redis for backend/worker."
    $env:SUPABASE_DB_URL = $localSupabaseDbUrl
    $env:SUPABASE_DB_URL_MIGRATIONS = $localSupabaseDbUrl
    $env:DATABASE_URL = $localSupabaseDbUrl
    $env:DB_SSL_DISABLED = 'true'
    $env:REDIS_URL = $localRedisUrl
    $serverEnvPrefix = "`$env:SUPABASE_DB_URL='$localSupabaseDbUrl'; `$env:SUPABASE_DB_URL_MIGRATIONS='$localSupabaseDbUrl'; `$env:DATABASE_URL='$localSupabaseDbUrl'; `$env:DB_SSL_DISABLED='true'; `$env:REDIS_URL='$localRedisUrl';"
  } else {
    Write-Step "Using DB/Redis from environment files (START_LOCAL_USE_ENV=true)."
  }

  Write-Step 'Running preflight dependency/install checks...'
  Ensure-NpmDependencies -RepoRoot $repoRoot -SkipInstall:$SkipInstall

  Write-Step 'Running preflight server build...'
  Ensure-ServerBuildArtifacts -SkipBuild:$SkipBuild

  Write-Step 'Running preflight migration checks...'
  Ensure-DatabaseMigrations -SkipMigrations:$SkipMigrations

  $runtimeLogDir = Join-Path $repoRoot 'logs/local-runtime'
  if (-not (Test-Path $runtimeLogDir)) {
    New-Item -Path $runtimeLogDir -ItemType Directory -Force | Out-Null
  }
  $runStamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $apiLogPath = Join-Path $runtimeLogDir "api-$runStamp.log"
  $workerLogPath = Join-Path $runtimeLogDir "worker-$runStamp.log"
  $frontendLogPath = Join-Path $runtimeLogDir "frontend-$runStamp.log"

  Write-Step "Opening backend terminal..."
  $apiTerminal = Start-AppTerminal -Title 'Lumina API' -Command "$serverEnvPrefix npm --prefix server start *>&1 | Tee-Object -FilePath '$apiLogPath' -Append" -RepoRoot $repoRoot

  Write-Step "Opening worker terminal..."
  $workerTerminal = Start-AppTerminal -Title 'Lumina Worker' -Command "$serverEnvPrefix npm run worker *>&1 | Tee-Object -FilePath '$workerLogPath' -Append" -RepoRoot $repoRoot

  Write-Step "Opening frontend terminal..."
  $frontendTerminal = Start-AppTerminal -Title 'Lumina Frontend' -Command "npm run dev *>&1 | Tee-Object -FilePath '$frontendLogPath' -Append" -RepoRoot $repoRoot

  Write-LocalRuntimeState -StatePath $runtimeStatePath -State @{
    startedAt = (Get-Date).ToString('o')
    repoRoot = $repoRoot
    logs = @{
      api = $apiLogPath
      worker = $workerLogPath
      frontend = $frontendLogPath
    }
    terminals = @(
      @{ title = 'Lumina API'; pid = $apiTerminal.Id },
      @{ title = 'Lumina Worker'; pid = $workerTerminal.Id },
      @{ title = 'Lumina Frontend'; pid = $frontendTerminal.Id }
    )
  }

  Write-Step "Waiting for API readiness..."
  Wait-ForHttpEndpoint -Url 'http://127.0.0.1:3001/health' -MaxAttempts 180 -DelaySeconds 2

  Write-Step "Waiting for frontend readiness..."
  Wait-ForHttpEndpoint -Url 'http://localhost:5173/' -MaxAttempts 90 -DelaySeconds 2

  Monitor-StartupProcesses -ApiPid $apiTerminal.Id -WorkerPid $workerTerminal.Id -FrontendPid $frontendTerminal.Id -ApiLogPath $apiLogPath -WorkerLogPath $workerLogPath -FrontendLogPath $frontendLogPath -DurationSeconds $MonitorSeconds

  Write-Step "Startup initiated."
  Write-Host "[start-local] API health: http://127.0.0.1:3001/health" -ForegroundColor Green
  Write-Host "[start-local] Frontend:  http://localhost:5173/" -ForegroundColor Green
  Write-Host "[start-local] Run log:   $script:StartLocalLogPath" -ForegroundColor Green
  Write-StartLocalLog -Status 'success' -Stage 'completed' -Message 'Startup completed and monitoring passed'
} catch {
  $errMsg = $_.Exception.Message
  $fixHint = Get-FailureFixHint -ErrorMessage $errMsg
  Write-Host "[start-local] ERROR: $errMsg" -ForegroundColor Red
  Write-Host "[start-local] Suggested fix: $fixHint" -ForegroundColor Yellow
  Write-Host "[start-local] Host: $script:StartLocalHostName | Timestamp: $((Get-Date).ToString('o'))" -ForegroundColor Yellow
  Write-Host "[start-local] Run log: $script:StartLocalLogPath" -ForegroundColor Yellow
  Write-StartLocalLog -Status 'failure' -Stage 'failed' -Message 'Startup failed' -Issue $errMsg -Fix $fixHint
  exit 1
}
