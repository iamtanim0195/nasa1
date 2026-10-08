# Clean-checkout build proof.
#
# A green build in the working directory proves nothing about deploy: untracked
# files (and files silently swallowed by .gitignore) are still present there.
# This clones HEAD into a fresh directory - the same content Vercel receives -
# and builds it with `npm ci` (lockfile-exact install).

$ErrorActionPreference = 'Continue'
$clone = 'C:\Users\JM\_clean_build_check'
$src   = 'C:\Users\JM\NISAR_Project'

Write-Host "=== removing any previous clone ===" -ForegroundColor Cyan
if (Test-Path $clone) { Remove-Item -Recurse -Force $clone }

Write-Host "=== git clone (committed tree only) ===" -ForegroundColor Cyan
git clone --quiet --local $src $clone 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "CLONE FAILED" -ForegroundColor Red; exit 1 }

Set-Location $clone
Write-Host "  cloned HEAD: $(git log --oneline -1)"
Write-Host "  tracked files: $((git ls-files | Measure-Object).Count)"

Write-Host "`n=== what is MISSING vs the working tree? ===" -ForegroundColor Cyan
foreach ($probe in @(
    'frontend/src/lib/constants.ts',
    'frontend/src/lib/cesium/viewer.ts',
    'frontend/src/lib/utils.ts',
    'frontend/package-lock.json',
    'frontend/next.config.mjs',
    'frontend/tsconfig.json',
    'backend/main.py',
    'backend/api/services/nisar_processor.py',
    'frontend/.env.local',
    'frontend/public/static/feni_flood_detection.png',
    'nisar_data',
    'output'
)) {
    $exists = Test-Path (Join-Path $clone $probe)
    $flag = if ($exists) { 'present' } else { 'MISSING' }
    Write-Host ("  {0,-52} {1}" -f $probe, $flag)
}

Write-Host "`n=== npm ci (lockfile-exact) ===" -ForegroundColor Cyan
Set-Location (Join-Path $clone 'frontend')
npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 6
$ciExit = $LASTEXITCODE
Write-Host "  npm ci exit: $ciExit"

if ($ciExit -ne 0) {
    Write-Host "`nnpm ci FAILED - cannot build" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== npm run build (no .env.local present) ===" -ForegroundColor Cyan
npm run build 2>&1 | Select-Object -Last 20
$buildExit = $LASTEXITCODE
Write-Host "`n  BUILD EXIT CODE: $buildExit"

Write-Host "`n=== result ===" -ForegroundColor Cyan
if ($buildExit -eq 0) {
    Write-Host "  CLEAN CHECKOUT BUILD: PASS" -ForegroundColor Green

    # Confirm what the static output would serve, and the mock-mode hazard.
    $chunk = Get-ChildItem '.next\static\chunks' -Recurse -Filter '*.js' -ErrorAction SilentlyContinue |
             Select-String -Pattern 'NEXT_PUBLIC_USE_MOCK_API' -List | Select-Object -First 1
    Write-Host "  (no .env.local => NEXT_PUBLIC_USE_MOCK_API unset => MOCK mode at runtime)"
} else {
    Write-Host "  CLEAN CHECKOUT BUILD: FAIL" -ForegroundColor Red
}

Write-Host "`n=== leaving clone at $clone for inspection ==="
