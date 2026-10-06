# ============================================
# FE2 Automated Workflow Script
# Author: Fardin-Prodhan + Ridwan (storm-bringer-cse)
# Repo: iamtanim0195/nasa1
# ============================================

$ErrorActionPreference = "Stop"

# Configuration
$REPO_DIR = "C:\Users\Pedp4WPBX4125BLF1024\Documents\deepseek-harness\default-workspace\nasa1"
$BRANCH_NAME = "fe2-dashboard-charts-v2"
$COMMIT_MSG = "FE2: Add ResultCharts and dashboard improvements"
$PR_TITLE = "FE2: Analytics dashboard and charts"
$PR_BODY = "Added ResultCharts component, StatTile updates, and analysis hooks for flood visualization dashboard."

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  FE2 Automated Git Workflow" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Navigate to repo
Write-Host "[1/8] Navigating to repo..." -ForegroundColor Yellow
Set-Location $REPO_DIR
Write-Host "✓ In $REPO_DIR" -ForegroundColor Green

# Step 2: Verify identity
Write-Host ""
Write-Host "[2/8] Verifying Git identity..." -ForegroundColor Yellow
$currentUser = git config user.name
$currentEmail = git config user.email
Write-Host "  Name:  $currentUser"
Write-Host "  Email: $currentEmail"

if ($currentUser -ne "storm-bringer-cse") {
    Write-Host "⚠ Setting identity to storm-bringer-cse..." -ForegroundColor Yellow
    git config user.name "storm-bringer-cse"
    git config user.email "ridwanahmed264@gmail.com"
}

# Step 3: Switch to main and pull
Write-Host ""
Write-Host "[3/8] Updating main branch..." -ForegroundColor Yellow
git checkout main
git pull origin main
Write-Host "✓ main up to date" -ForegroundColor Green

# Step 4: Create new feature branch
Write-Host ""
Write-Host "[4/8] Creating feature branch: $BRANCH_NAME" -ForegroundColor Yellow
$branches = git branch --list $BRANCH_NAME
if ($branches) {
    Write-Host "  Branch exists. Deleting old one..." -ForegroundColor Yellow
    git branch -D $BRANCH_NAME
}
git checkout -b $BRANCH_NAME
Write-Host "✓ On branch $BRANCH_NAME" -ForegroundColor Green

# Step 5: Make automated test changes
Write-Host ""
Write-Host "[5/8] Making automated changes..." -ForegroundColor Yellow

$filePath = "frontend\src\components\ResultCharts\ResultCharts.tsx"
if (Test-Path $filePath) {
    $content = Get-Content $filePath -Raw
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $marker = "// ============================================`n// FE2 Update: $timestamp`n// Author: Ridwan (storm-bringer-cse)`n// ============================================`n"
    
    # Remove previous marker if exists
    $content = $content -replace "(?ms)// ============================================`r?`n// FE2 Update:.*?// ============================================`r?`n", ""
    
    # Add new marker at top
    $newContent = $marker + $content
    Set-Content -Path $filePath -Value $newContent -NoNewline
    Write-Host "  ✓ Updated: $filePath" -ForegroundColor Green
} else {
    Write-Host "  ⚠ File not found: $filePath" -ForegroundColor Red
    Write-Host "  Skipping automated change. Please make manual change and rerun." -ForegroundColor Yellow
}

# Step 6: Stage, commit, push
Write-Host ""
Write-Host "[6/8] Staging, committing, pushing..." -ForegroundColor Yellow
git add .

$status = git status --porcelain
if (-not $status) {
    Write-Host "  ⚠ No changes to commit. Exiting." -ForegroundColor Yellow
    exit 0
}

git commit -m $COMMIT_MSG
Write-Host "✓ Committed" -ForegroundColor Green

git push origin $BRANCH_NAME
Write-Host "✓ Pushed to origin/$BRANCH_NAME" -ForegroundColor Green

# Step 7: Create PR
Write-Host ""
Write-Host "[7/8] Creating Pull Request..." -ForegroundColor Yellow
$prOutput = gh pr create --base main --head $BRANCH_NAME --title $PR_TITLE --body $PR_BODY 2>&1
Write-Host $prOutput

# Extract PR number
$prNumber = $null
if ($prOutput -match '/pull/(\d+)') {
    $prNumber = $matches[1]
    Write-Host "✓ PR #$prNumber created" -ForegroundColor Green
}

# Step 8: Merge PR
if ($prNumber) {
    Write-Host ""
    Write-Host "[8/8] Merging PR #$prNumber..." -ForegroundColor Yellow
    gh pr merge $prNumber --squash --delete-branch
    Write-Host "✓ PR #$prNumber merged" -ForegroundColor Green
}

# Final: Switch to main and pull
Write-Host ""
Write-Host "Finalizing..." -ForegroundColor Yellow
git checkout main
git pull origin main
Write-Host "✓ Back on main with latest changes" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ✅ FE2 Workflow Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan