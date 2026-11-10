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
  $securePassword = Read-Host 'Enter the rotated Atlas database user password' -AsSecureString
  if ($securePassword.Length -eq 0) { throw 'Atlas database password cannot be empty.' }
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $securePassword.Dispose()
  }
  $encodedPassword = [Uri]::EscapeDataString($password)
  $password = $null
  $uri = "mongodb+srv://nayeemahmedemba_db_user:$encodedPassword@cluster0.uzlvf5f.mongodb.net/secure_notes?retryWrites=true&w=majority&appName=Cluster0"
  $encodedPassword = $null
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
