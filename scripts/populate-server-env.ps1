<#
Interactive PowerShell helper to create or update `server/.env` with secrets.

USAGE (PowerShell):
  pwsh ./scripts/populate-server-env.ps1

Notes:
- This script writes to `server/.env` in the repo root. Do NOT commit that file.
- You will be prompted for values; leave blank to skip a key.
#>

param()

function Prompt-Secure([string]$prompt) {
  $val = Read-Host -Prompt $prompt -AsSecureString
  if ($val.Length -eq 0) { return '' }
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($val))
}

$envPath = Join-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) -ChildPath "..\server\.env" | Resolve-Path -Relative
$envPath = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) '..\server\.env')).Path

Write-Host "This will create or update: $envPath" -ForegroundColor Cyan
if (Test-Path $envPath) {
  $ok = Read-Host "server/.env already exists. Overwrite (y/N)?"
  if ($ok -ne 'y' -and $ok -ne 'Y') { Write-Host 'Aborting.'; exit 0 }
}

Write-Host 'Enter values for the following environment variables. Leave blank to skip.' -ForegroundColor Yellow

$values = @{}
$values.OPENAI_API_KEY = Prompt-Secure 'OPENAI_API_KEY (secret)'
$values.GOOGLE_API_KEY = Read-Host 'GOOGLE_API_KEY (public-looking)'
$values.GOOGLE_CSE_ID = Read-Host 'GOOGLE_CSE_ID (custom search engine id)'
$values.SERPAPI_API_KEY = Read-Host 'SERPAPI_API_KEY (fallback search API)'
$values.SUPABASE_URL = Read-Host 'SUPABASE_URL (e.g. https://your.supabase.co)'
$values.SUPABASE_ANON_KEY = Prompt-Secure 'SUPABASE_ANON_KEY (secret)'
$values.SUPABASE_SERVICE_ROLE_KEY = Prompt-Secure 'SUPABASE_SERVICE_ROLE_KEY (secret)'

Write-Host "Writing values to $envPath" -ForegroundColor Green

$content = @()
foreach ($k in $values.Keys) {
  $v = $values[$k]
  if ($v -ne $null -and $v -ne '') {
    # Escape literal double quotes
    $safe = $v -replace '"', '""'
    $content += "$k=$safe"
  }
}

# Ensure server directory exists
$serverDir = Join-Path (Split-Path $envPath) ''
if (-not (Test-Path $serverDir)) { New-Item -ItemType Directory -Path $serverDir | Out-Null }

[System.IO.File]::WriteAllLines($envPath, $content)
Write-Host "Wrote $(($content).Length) keys to $envPath" -ForegroundColor Green
Write-Host 'Reminder: ensure server/.env is in your .gitignore and do not commit it to source control.' -ForegroundColor Yellow
