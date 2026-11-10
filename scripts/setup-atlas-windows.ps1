$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  $nodeVersion = (& node -p "process.versions.node").Trim()
  $versionParts = $nodeVersion.Split('.') | ForEach-Object { [int]$_ }
  if ($versionParts[0] -lt 20 -or ($versionParts[0] -eq 20 -and $versionParts[1] -lt 19)) {
    throw 'Node.js 20.19 or later is required.'
  }
  if (-not (Test-Path '.env')) {
    & node 'scripts/setup-local.js'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local .env.' }
  }
  $secureUri = Read-Host 'Paste the Atlas standard mongodb:// URI with your password included' -AsSecureString
  if ($secureUri.Length -eq 0) { throw 'Atlas connection URI cannot be empty.' }
  $uriPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUri)
  try {
    $uri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($uriPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($uriPointer)
    $secureUri.Dispose()
  }
  if (-not $uri.StartsWith('mongodb://')) { throw 'Use the standard mongodb:// URI, not the mongodb+srv:// URI.' }
  if ($uri.Contains('<') -or $uri.Contains('>')) { throw 'Replace the password placeholder in Atlas before entering the URI.' }
  $envPath = Join-Path $projectRoot '.env'
  $envLines = [IO.File]::ReadAllLines($envPath)
  $uriLineFound = $false
  for ($index = 0; $index -lt $envLines.Length; $index++) {
    if ($envLines[$index].StartsWith('MONGODB_URI=')) {
      $envLines[$index] = "MONGODB_URI=$uri"
      $uriLineFound = $true
      break
    }
  }
  if (-not $uriLineFound) { $envLines += "MONGODB_URI=$uri" }
  [IO.File]::WriteAllLines($envPath, $envLines, [Text.UTF8Encoding]::new($false))
  $uri = $null
  & npm.cmd install --include=dev
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  & npm.cmd run db:indexes
  if ($LASTEXITCODE -ne 0) { throw 'Atlas index setup failed. Check Atlas Network Access and the secure_notes_rw database role.' }
  Write-Host 'Atlas connection saved in the ignored local .env file and required indexes are ready.'
} finally {
  Pop-Location
}
