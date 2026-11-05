[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump,

  # Explicit opt-in for a MAJOR bump. Without it, publish-guard refuses '-Bump major':
  # a stray '-Bump major' shipped @dloizides/auth-client@4.0.0 with an API identical to 3.4.1.
  [switch]$AllowMajor,

  # Skip the post-publish apps/ui-showcase sync + ui.dloizides.com redeploy (also: env SKIP_SHOWCASE_SYNC=1).
  [switch]$SkipShowcase
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Use npm.cmd on Windows to avoid PowerShell wrapper issues with strict mode
$npmCmd = if ($env:OS -match "Windows") { "npm.cmd" } else { "npm" }

# --- npm authentication (falls back to NPM_TOKEN in the repo-root .env.local) ---
# These per-package scripts used to rely PURELY on ambient ~/.npmrc auth. When that auth
# lapsed every publish died with an E404-from-401 while a perfectly good token sat in
# SaaS/.env.local the whole time - @dloizides/design-tokens@1.3.0 was gated, bumped and
# committed but never published by exactly this. Mirrors NpmPackages/publish-all.ps1.
# Precedence: $env:NPM_TOKEN > NPM_TOKEN in <repo-root>/.env.local > ambient ~/.npmrc.
$tokenToUse = $null
$tokenSource = $null
if ($env:NPM_TOKEN) {
  $tokenToUse = $env:NPM_TOKEN
  $tokenSource = "NPM_TOKEN environment variable"
} else {
  # <repo-root> is three levels up: packages/<name> -> packages -> NpmPackages -> SaaS
  $envLocalPath = Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot))) ".env.local"
  if (Test-Path $envLocalPath) {
    $tokenMatch = Select-String -Path $envLocalPath -Pattern "^NPM_TOKEN=(.+)$" | Select-Object -First 1
    if ($tokenMatch) {
      $tokenToUse = $tokenMatch.Matches[0].Groups[1].Value.Trim()
      $tokenSource = "NPM_TOKEN in $envLocalPath"
      Write-Host "Loaded NPM_TOKEN from .env.local" -ForegroundColor Green
    }
  }
}

# Shape validation MUST run before the value reaches any npm config. A value that is not a
# plausible npm token is almost certainly a mis-bound argument (a package name, a bump type,
# a path); writing it into an auth slot corrupts npm auth and surfaces MUCH later as an
# unrelated 'E404 on PUT' or 'E401 whoami'. Never echo the value - only length and shape.
function Test-NpmTokenShape {
  param([string]$Token)
  # Modern granular/classic npm tokens: 'npm_' + 36 base62 chars.
  if ($Token -match '^npm_[A-Za-z0-9]{36,}$') { return $true }
  # Legacy npm tokens were bare UUIDv4.
  if ($Token -match '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') { return $true }
  return $false
}

if ($tokenToUse -and -not (Test-NpmTokenShape -Token $tokenToUse)) {
  Write-Host "ERROR: The npm token is not a valid npm token." -ForegroundColor Red
  Write-Host "  Source   : $tokenSource" -ForegroundColor Yellow
  Write-Host "  Length   : $($tokenToUse.Length) characters" -ForegroundColor Yellow
  Write-Host "  Expected : 'npm_' followed by 36+ characters (or a legacy UUID)" -ForegroundColor Yellow
  Write-Host "NOTHING was written to any npm config. Your ~/.npmrc is untouched." -ForegroundColor Green
  exit 1
}

$tempUserConfig = $null
$previousUserConfigEnv = $env:NPM_CONFIG_USERCONFIG

# The try opens BEFORE the temp file is created, so there is no window in which a
# credential-bearing file can exist without the finally being armed to remove it.
try {

if ($tokenToUse) {
  # Redirect npm's USER-CONFIG FILE to a per-run temp copy via NPM_CONFIG_USERCONFIG.
  # We do NOT run 'npm config set --location user': that rewrites the developer's
  # machine-wide ~/.npmrc, and its matching delete only runs on the happy path, so any
  # failure in between leaves a corrupted credential behind permanently. Seed the temp
  # file from the real ~/.npmrc so unrelated settings (legacy-peer-deps etc.) still apply,
  # then override only the auth line.
  $realUserConfig = if ($env:USERPROFILE) { Join-Path $env:USERPROFILE ".npmrc" } else { Join-Path $HOME ".npmrc" }
  $tempUserConfig = Join-Path ([System.IO.Path]::GetTempPath()) ("npmrc-publish-" + [Guid]::NewGuid().ToString("N") + ".tmp")

  $carriedLines = @()
  if (Test-Path $realUserConfig) {
    $carriedLines = Get-Content -Path $realUserConfig | Where-Object { $_ -notmatch '_authToken' }
  }
  # @(...) FORCES an array. WITHOUT it, a ~/.npmrc holding exactly ONE non-authToken line makes
  # Get-Content return a scalar STRING, so '+' CONCATENATES instead of appending and the temp
  # config collapses to a single corrupt line:
  #   legacy-peer-deps=true//registry.npmjs.org/:_authToken=<token>
  # npm then finds NO token and publish dies with 'ENEEDAUTH need auth' -- while the script has
  # already printed "npm auth configured", so the log says auth succeeded. This silently blocked
  # every publish on a machine whose ~/.npmrc had one setting line; @dloizides/ui-layout@1.14.0
  # was bumped and committed but never reached npm because of it.
  Set-Content -Path $tempUserConfig -Value (@($carriedLines) + "//registry.npmjs.org/:_authToken=$tokenToUse") -Encoding ASCII

  # Restrict the temp file to the current user - it holds a live credential.
  try {
    $acl = Get-Acl $tempUserConfig
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      [System.Security.Principal.WindowsIdentity]::GetCurrent().Name, "FullControl", "Allow")
    $acl.SetAccessRule($rule)
    Set-Acl -Path $tempUserConfig -AclObject $acl
  } catch {
    Write-Warning "Could not tighten ACL on the temp npm config; continuing."
  }

  $env:NPM_CONFIG_USERCONFIG = $tempUserConfig
  Write-Host "npm auth configured from $tokenSource (temp config; ~/.npmrc NOT modified)" -ForegroundColor Green
} else {
  Write-Host "No NPM_TOKEN found - relying on ambient ~/.npmrc auth." -ForegroundColor DarkYellow
}
# --------------------------------------------------------------------------------------


$repoRoot = $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"

if (-not (Test-Path $packageJsonPath)) {
  throw "Missing file: $packageJsonPath"
}

# Read package.json
# Defensive: strip BOM if a prior failed publish corrupted package.json.
$rawPkg = Get-Content -Path $packageJsonPath -Raw
if ($rawPkg.Length -gt 0 -and $rawPkg[0] -eq [char]0xFEFF) { $rawPkg = $rawPkg.Substring(1) }
$packageJson = $rawPkg | ConvertFrom-Json
$packageName = $packageJson.name
$currentVersion = $packageJson.version

Write-Host "Building and publishing $packageName package..." -ForegroundColor Cyan
Write-Host "Current Version: $currentVersion"
Write-Host "Bump Type: $Bump"
Write-Host ""

# --- Publish guard (NpmPackages/scripts/publish-guard.ps1) ----------------------------
# Refuses: a dirty working tree (registry drifting ahead of the repo), an un-opted-in major,
# and re-publishing a version that already exists on npm. Warns on a missing CHANGELOG entry.
$script:VersionCommitted = $false
$script:NewVersion = $currentVersion
# Vendored per-package so the guard is versioned WITH the package and survives a fresh clone
# (NpmPackages/ and the SaaS root are not git repos — a shared copy would be tracked by nothing).
$guardPath = Join-Path $PSScriptRoot "publish-guard.ps1"
if (-not (Test-Path $guardPath)) {
  throw "Missing publish guard: $guardPath - it is mandatory. Restore NpmPackages/scripts/publish-guard.ps1 before publishing."
}
& $guardPath -PackageDir $repoRoot -Bump $Bump -AllowMajor:$AllowMajor
# --------------------------------------------------------------------------------------

try {
  Push-Location $repoRoot

  # Step 1: Clean
  Write-Host "Step 1: Cleaning previous build..." -ForegroundColor Yellow
  & $npmCmd run clean
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run clean failed" }

  # Step 2: Install dependencies
  Write-Host ""
  Write-Host "Step 2: Installing dependencies..." -ForegroundColor Yellow
  & $npmCmd ci
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd ci failed" }

  # Step 3: Lint
  Write-Host ""
  Write-Host "Step 3: Linting..." -ForegroundColor Yellow
  & $npmCmd run lint
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run lint failed" }

  # Step 4: Type check
  Write-Host ""
  Write-Host "Step 4: Type checking..." -ForegroundColor Yellow
  & $npmCmd run typecheck
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run typecheck failed" }

  # Step 5: Test
  Write-Host ""
  Write-Host "Step 5: Running tests..." -ForegroundColor Yellow
  & $npmCmd test
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd test failed" }

  # Step 6: Build
  Write-Host ""
  Write-Host "Step 6: Building..." -ForegroundColor Yellow
  & $npmCmd run build
  if ($LASTEXITCODE -ne 0) { throw "& $npmCmd run build failed" }

  # Step 7: Version bump (this also creates a git tag)
  Write-Host ""
  Write-Host "Step 7: Bumping version ($Bump)..." -ForegroundColor Yellow
  & $npmCmd version $Bump --no-git-tag-version
  if ($LASTEXITCODE -ne 0) { throw "npm version failed" }

  # Read new version
  $packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
  $newVersion = $packageJson.version

  Write-Host "Version: $currentVersion -> $newVersion" -ForegroundColor Green

  # --- Release commit (publish-guard) -------------------------------------------------
  # Commit the bump BEFORE publishing so the repo can never lag the registry again:
  # auth-client@4.0.0 / ui-layout@1.2.0 went live on npm while their repos said 3.4.1 / 1.1.0.
  # We commit, we do NOT push - pushing stays a human decision.
  Write-Host ""
  Write-Host "Step: Committing version bump (release: $packageName v$newVersion)..." -ForegroundColor Yellow
  $filesToCommit = @("package.json")
  if (Test-Path (Join-Path $repoRoot "package-lock.json")) { $filesToCommit += "package-lock.json" }
  if (Test-Path (Join-Path $repoRoot "CHANGELOG.md")) { $filesToCommit += "CHANGELOG.md" }
  & git -C $repoRoot add -- $filesToCommit
  if ($LASTEXITCODE -ne 0) { throw "git add failed - ABORTING BEFORE npm publish. Never publish a version that is not committed. Fix the repo in $repoRoot and re-run." }
  & git -C $repoRoot commit -m "release: $packageName v$newVersion"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed - ABORTING BEFORE npm publish (better to not publish than to publish uncommitted). Check 'git -C $repoRoot status', fix it, and re-run publish.ps1." }
  $script:VersionCommitted = $true
  $script:NewVersion = $newVersion
  Write-Host "Committed 'release: $packageName v$newVersion' (NOT pushed - run: git -C $repoRoot push)" -ForegroundColor Green
  # ------------------------------------------------------------------------------------

  # Step 8: Publish
  Write-Host ""
  Write-Host "Step 8: Publishing to npm..." -ForegroundColor Yellow
  & $npmCmd publish --access public
  if ($LASTEXITCODE -ne 0) { throw "npm publish failed" }

  Write-Host ""
  Write-Host "Successfully published $packageName@$newVersion to npm!" -ForegroundColor Green
  # SHOWCASE-1e: bump apps/ui-showcase + redeploy ui.dloizides.com. Never fails the publish.
  try { $showcaseSync = Join-Path $PSScriptRoot "..\..\..\personalServerNotes\scripts\showcase-sync.ps1"; if (Test-Path $showcaseSync) { & $showcaseSync -PackageName $packageName -Version $newVersion -Skip:$SkipShowcase } else { Write-Warning "showcase-sync.ps1 not found at $showcaseSync - ui.dloizides.com NOT synced to $packageName@$newVersion" } } catch { Write-Warning "SHOWCASE SYNC FAILED (the package is already live on the registry): $_" }
}
catch {
  # The bump is already committed: rolling package.json back here would re-dirty the tree
  # and desync it from the release commit. Leave the commit; tell the human what to do.
  if ($script:VersionCommitted) {
    Write-Warning "Publish FAILED, but the version bump to v$($script:NewVersion) is ALREADY COMMITTED."
    Write-Warning "Nothing was published. Either fix the failure and re-run 'npm publish --access public' in $repoRoot,"
    Write-Warning "or undo the release commit with: git -C $repoRoot reset --hard HEAD~1"
    throw
  }
  # Rollback version on failure
  Write-Warning "Build/publish failed. Attempting to rollback version change..."
    # Rewrite ONLY the version string in the raw text. Do NOT round-trip the file
  # through ConvertFrom-Json | ConvertTo-Json: PowerShell re-serialises the WHOLE
  # document, unicode-escaping '>' as \u003e and '&' as \u0026 and reindenting it.
  # The output stays VALID JSON -- so nothing complains -- but it is no longer the
  # file npm wrote. That silently corrupted 10 package.json files (2 got committed).
  $raw = [System.IO.File]::ReadAllText($packageJsonPath)
  $pattern = '("version"\s*:\s*")[^"]*(")'
  $rolledBack = [regex]::Replace($raw, $pattern, "`${1}$currentVersion`${2}", 1)
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($packageJsonPath, $rolledBack, $utf8NoBom)
  Write-Warning "Rolled back version in package.json to $currentVersion"
  throw
}
finally {
  Pop-Location
}

}
finally {
  # Runs on EVERY exit path. Note this only removes state THIS script created: the temp
  # config file and the env var it set. ~/.npmrc was never written, so there is nothing
  # in it to restore.

  # Restore the caller's NPM_CONFIG_USERCONFIG exactly as we found it (including unset),
  # so a parent publish-all.ps1 run keeps its own temp config.
  if ($null -eq $previousUserConfigEnv) {
    Remove-Item Env:\NPM_CONFIG_USERCONFIG -ErrorAction SilentlyContinue
  } else {
    $env:NPM_CONFIG_USERCONFIG = $previousUserConfigEnv
  }

  if ($tempUserConfig -and (Test-Path $tempUserConfig)) {
    # Overwrite before unlinking so the credential does not linger in free space.
    try { Set-Content -Path $tempUserConfig -Value "" -Encoding ASCII -ErrorAction SilentlyContinue } catch { }
    Remove-Item -Path $tempUserConfig -Force -ErrorAction SilentlyContinue
  }
}
