<#
.SYNOPSIS
  Pre-publish safety guard for the @dloizides/* npm packages.

.DESCRIPTION
  Every packages/<pkg>/publish.ps1 calls this BEFORE it touches the version or the registry.
  It exists because of two real incidents:

    1. PUBLISHED WITHOUT BEING COMMITTED
       @dloizides/auth-client@4.0.0 and @dloizides/ui-layout@1.2.0 were LIVE on npm while
       their repos still said 3.4.1 / 1.1.0 - no commit, no changelog entry. The registry
       silently drifted ahead of the source, so nobody could tell what was in a version.

    2. ACCIDENTAL MAJOR
       auth-client@4.0.0 was published by a stray '-Bump major'. Its packed dist/index.d.ts
       is byte-identical to 3.4.1 (0-line diff). A meaningless major burns the version space
       and scares consumers into fake migrations.

  Checks (in order):
    A. major requires -AllowMajor          -> HARD FAIL
    B. clean git working tree              -> HARD FAIL (node_modules/, dist/, .node_modules_old/
                                              and gitignored paths are ignored as noise)
    C. target version not already on npm   -> HARD FAIL (soft WARN if the registry is unreachable)
    D. CHANGELOG.md has an entry for the target version -> WARN ONLY (never blocks)

.EXAMPLE
  ./scripts/publish-guard.ps1 -PackageDir ./packages/utils -Bump patch

.EXAMPLE
  ./scripts/publish-guard.ps1 -PackageDir ./packages/auth-client -Bump major -AllowMajor
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  # Package directory to guard. Each package is its own git repo.
  [string]$PackageDir = (Get-Location).Path,

  # The bump about to be applied by `npm version <Bump>`.
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch",

  # Explicit opt-in for a major. Without it, `-Bump major` is refused.
  [switch]$AllowMajor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$npmCmd = if ($env:OS -match "Windows") { "npm.cmd" } else { "npm" }

# Working-tree dirt we deliberately do NOT care about (build output / installs).
$IgnoredPathPrefixes = @("node_modules/", "dist/", ".node_modules_old/")

function Get-NextVersion {
  param([string]$Current, [string]$BumpType)

  if ($Current -notmatch '^(\d+)\.(\d+)\.(\d+)') {
    throw "Cannot parse current version '$Current' as semver (x.y.z)."
  }
  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  $patch = [int]$Matches[3]

  switch ($BumpType) {
    "major" { return "$($major + 1).0.0" }
    "minor" { return "$major.$($minor + 1).0" }
    "patch" { return "$major.$minor.$($patch + 1)" }
  }
}

function Get-PorcelainPath {
  param([string]$Line)

  # `git status --porcelain` line = 2 status chars + a space + path (renames: "old -> new").
  $path = $Line.Substring(3).Trim()
  if ($path -match '->\s*(.+)$') { $path = $Matches[1].Trim() }
  return $path.Trim('"')
}

if ($WhatIfPreference) {
  Write-Host "publish-guard.ps1 (-WhatIf): parsed OK. Checks that would run:" -ForegroundColor Cyan
  Write-Host "  A. refuse 'major' without -AllowMajor"
  Write-Host "  B. refuse a dirty git working tree (ignoring: $($IgnoredPathPrefixes -join ', '))"
  Write-Host "  C. refuse a version that already exists on npm"
  Write-Host "  D. warn when CHANGELOG.md has no entry for the new version"
  return
}

# ---------------------------------------------------------------------------------------
# Resolve the package
# ---------------------------------------------------------------------------------------
if (-not (Test-Path $PackageDir)) { throw "publish-guard: package dir not found: $PackageDir" }
$PackageDir = (Resolve-Path $PackageDir).Path

$packageJsonPath = Join-Path $PackageDir "package.json"
if (-not (Test-Path $packageJsonPath)) { throw "publish-guard: no package.json in $PackageDir" }

$rawPkg = Get-Content -Path $packageJsonPath -Raw
if ($rawPkg.Length -gt 0 -and $rawPkg[0] -eq [char]0xFEFF) { $rawPkg = $rawPkg.Substring(1) }
$pkg = $rawPkg | ConvertFrom-Json
$packageName = $pkg.name
$currentVersion = $pkg.version
$nextVersion = Get-NextVersion -Current $currentVersion -BumpType $Bump

Write-Host ""
Write-Host "=== publish-guard: $packageName $currentVersion -> $nextVersion ($Bump) ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------------------
# Check A - accidental major
# ---------------------------------------------------------------------------------------
if ($Bump -eq "major" -and -not $AllowMajor) {
  throw @"
publish-guard: REFUSING a MAJOR bump ($currentVersion -> $nextVersion) for $packageName.

A stray '-Bump major' is exactly how @dloizides/auth-client@4.0.0 shipped: its packed
dist/index.d.ts was BYTE-IDENTICAL to 3.4.1 (a 0-line API diff). A meaningless major burns
the version space and scares consumers into migrations that do not exist.

WHAT TO DO:
  * Not actually a breaking change?  Re-run with '-Bump minor' or '-Bump patch'.
  * Genuinely breaking?              Re-run with:  -Bump major -AllowMajor
                                     ...and write the breaking change into CHANGELOG.md first.
"@
}
Write-Host "  [A] bump type '$Bump' allowed." -ForegroundColor Green

# ---------------------------------------------------------------------------------------
# Check B - dirty working tree (HARD FAIL; also hard-fails if this is not a git repo)
# ---------------------------------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "publish-guard: 'git' is not on PATH. The clean-tree check is mandatory - install git or fix PATH before publishing."
}

& git -C $PackageDir rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
  throw @"
publish-guard: '$PackageDir' is NOT a git repository.

Publishing from an unversioned directory is how the registry ends up ahead of the source
(@dloizides/auth-client@4.0.0 and @dloizides/ui-layout@1.2.0 were live on npm while their
repos still said 3.4.1 / 1.1.0).

WHAT TO DO: 'git init' + connect the package's GitHub remote, commit the source, then publish.
"@
}

$porcelain = @(& git -C $PackageDir status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "publish-guard: 'git status --porcelain' failed in $PackageDir." }

$dirty = @()
foreach ($line in $porcelain) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $path = (Get-PorcelainPath -Line $line) -replace '\\', '/'
  $isNoise = $false
  foreach ($prefix in $IgnoredPathPrefixes) {
    if ($path -like "$prefix*") { $isNoise = $true; break }
  }
  if (-not $isNoise) { $dirty += $line.Trim() }
}

if ($dirty.Count -gt 0) {
  $listing = ($dirty | ForEach-Object { "    $_" }) -join "`n"
  throw @"
publish-guard: REFUSING to publish $packageName from a DIRTY working tree.

Uncommitted / untracked tracked-source changes in $PackageDir :
$listing

This is the exact failure that put @dloizides/auth-client@4.0.0 and @dloizides/ui-layout@1.2.0
on npm while their repos still said 3.4.1 / 1.1.0 - the REGISTRY DRIFTED AHEAD OF THE REPO,
with no commit and no changelog, so nobody could tell what was actually inside a version.

WHAT TO DO:
  1. cd $PackageDir
  2. Review:   git status && git diff
  3. Commit the source (and add a CHANGELOG.md entry for $nextVersion), or 'git stash' /
     'git restore' anything that should not ship.
  4. Re-run publish.ps1 -Bump $Bump.
(node_modules/, dist/, .node_modules_old/ and gitignored paths are ignored - they never block.)
"@
}
Write-Host "  [B] git working tree is clean." -ForegroundColor Green

# ---------------------------------------------------------------------------------------
# Check C - version already on the registry (soft-fail if the registry is unreachable)
# ---------------------------------------------------------------------------------------
$viewOutput = ""
$viewFailed = $false
try {
  $viewOutput = (& $npmCmd view "$packageName@$nextVersion" version 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { $viewFailed = $true }
}
catch {
  $viewFailed = $true
  $viewOutput = $_.Exception.Message
}

if (-not $viewFailed -and $viewOutput -match "(^|\s)$([regex]::Escape($nextVersion))(\s|$)") {
  throw @"
publish-guard: $packageName@$nextVersion ALREADY EXISTS on npm.

Re-publishing an existing version is always a mistake (npm will reject it anyway, and if it
did not, two different tarballs would share one version).

WHAT TO DO: the registry is ahead of this repo. Check 'npm view $packageName versions',
reconcile package.json with what is actually published, commit that, then bump from there.
"@
}
elseif ($viewFailed -and $viewOutput -notmatch "E404|404 Not Found|is not in this registry") {
  Write-Warning "publish-guard: could not reach the npm registry to check whether $packageName@$nextVersion already exists."
  Write-Warning "publish-guard: continuing (registry check DEGRADED, not enforced). npm said: $($viewOutput -replace "`r?`n", ' ')"
}
else {
  Write-Host "  [C] $packageName@$nextVersion is not on npm yet." -ForegroundColor Green
}

# ---------------------------------------------------------------------------------------
# Check D - CHANGELOG nudge (WARN ONLY)
# ---------------------------------------------------------------------------------------
$changelogPath = Join-Path $PackageDir "CHANGELOG.md"
if (Test-Path $changelogPath) {
  $changelog = Get-Content -Path $changelogPath -Raw
  if ($changelog -notmatch [regex]::Escape($nextVersion)) {
    Write-Warning "**********************************************************************"
    Write-Warning "publish-guard: CHANGELOG.md has NO entry for $nextVersion."
    Write-Warning "auth-client 4.0.0 had no changelog entry either - that is precisely why"
    Write-Warning "nobody noticed it was a no-op major with an identical API."
    Write-Warning "Add a '## $nextVersion' section describing what changed, commit it, re-run."
    Write-Warning "(Not blocking - but if you cannot describe the change, do not ship it.)"
    Write-Warning "**********************************************************************"
  }
  else {
    Write-Host "  [D] CHANGELOG.md mentions $nextVersion." -ForegroundColor Green
  }
}
else {
  Write-Host "  [D] no CHANGELOG.md in this package (skipped)." -ForegroundColor DarkYellow
}

Write-Host "=== publish-guard: OK - proceeding with $packageName@$nextVersion ===" -ForegroundColor Cyan
Write-Host ""
