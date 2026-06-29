$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $Root
$ScriptPath = Join-Path $Root 'Create-Folders.ps1'
$GuiScriptPath = Join-Path $Root 'Folder-Maker-GUI.ps1'
$CaseDir = Join-Path $Root '.test-cases'
$OutputRoot = Join-Path $Root '.test-output'

function Assert-True($Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-FolderMaker([string[]]$ToolArgs, [int]$ExpectedExitCode) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @ToolArgs
  $actual = $LASTEXITCODE
  if ($actual -ne $ExpectedExitCode) {
    throw "Expected exit code $ExpectedExitCode but got $actual. Args: $($ToolArgs -join ' ')"
  }
}

function Write-Utf8File([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Assert-Utf8Bom([string]$Path, [string]$Message) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  Assert-True ($bytes.Length -ge 3) $Message
  Assert-True ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) $Message
}

if (Test-Path -LiteralPath $CaseDir) { Remove-Item -LiteralPath $CaseDir -Recurse -Force }
if (Test-Path -LiteralPath $OutputRoot) { Remove-Item -LiteralPath $OutputRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $CaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$sampleCsv = Join-Path $Root 'sample.csv'
Assert-Utf8Bom $sampleCsv 'sample.csv should include a UTF-8 BOM so Korean text opens correctly in Excel.'
$sampleOut = Join-Path $OutputRoot 'sample'
Invoke-FolderMaker -ToolArgs @('-CsvPath', $sampleCsv, '-OutDir', $sampleOut) -ExpectedExitCode 0
Assert-True (Test-Path -LiteralPath (Join-Path $sampleOut '_folder-maker-logs')) 'Sample dry-run should write logs.'

& powershell -NoProfile -ExecutionPolicy Bypass -File $GuiScriptPath -SmokeTest
if ($LASTEXITCODE -ne 0) { throw 'Folder Maker GUI smoke test failed.' }

$tabCsv = Join-Path $CaseDir 'tab-english.tsv'
Write-Utf8File $tabCsv " template no `tschool name`tsystem id`nT010`tSchool A`tSYS010`n"
Invoke-FolderMaker -ToolArgs @('-CsvPath', $tabCsv, '-OutDir', (Join-Path $OutputRoot 'tab')) -ExpectedExitCode 0

$noHeaderCsv = Join-Path $CaseDir 'no-header.csv'
Write-Utf8File $noHeaderCsv "T020,School B,SYS020`nT021,School C,SYS021`n"
Invoke-FolderMaker -ToolArgs @('-CsvPath', $noHeaderCsv, '-OutDir', (Join-Path $OutputRoot 'no-header')) -ExpectedExitCode 0

$templateFile = Join-Path $CaseDir 'template.fig'
Write-Utf8File $templateFile 'fake fig template payload'

$duplicateCsv = Join-Path $CaseDir 'duplicate.csv'
Write-Utf8File $duplicateCsv "template,school,systemid`nT030,Duplicate School,SYS030`nT030,Duplicate School,SYS030`nT031,Created School,SYS031`n"
$duplicateOut = Join-Path $OutputRoot 'duplicate'
Invoke-FolderMaker -ToolArgs @('-CsvPath', $duplicateCsv, '-OutDir', $duplicateOut, '-CopyFile', $templateFile, '-RenameCopyToFolder', '-Execute') -ExpectedExitCode 2
Assert-True (Test-Path -LiteralPath (Join-Path $duplicateOut 'T031_Created School_SYS031')) 'Execute should create valid folders even when another row fails.'
Assert-True (Test-Path -LiteralPath (Join-Path $duplicateOut 'T031_Created School_SYS031\T031_Created School_SYS031.fig')) 'Execute should copy and rename template file into created folder.'
Assert-True (@(Get-ChildItem -LiteralPath (Join-Path $duplicateOut '_folder-maker-logs') -Filter 'failed-*.csv').Count -gt 0) 'Duplicate run should write failed log.'

$existsCsv = Join-Path $CaseDir 'exists.csv'
Write-Utf8File $existsCsv "template,school,systemid`nT031,Created School,SYS031`n"
Invoke-FolderMaker -ToolArgs @('-CsvPath', $existsCsv, '-OutDir', $duplicateOut, '-Execute') -ExpectedExitCode 0

$missingCsv = Join-Path $CaseDir 'missing.csv'
Write-Utf8File $missingCsv "template,school,systemid`nT040,,SYS040`n"
Invoke-FolderMaker -ToolArgs @('-CsvPath', $missingCsv, '-OutDir', (Join-Path $OutputRoot 'missing'), '-Execute') -ExpectedExitCode 2

if ($env:KEEP_FOLDER_MAKER_TESTS -ne '1') {
  if (Test-Path -LiteralPath $CaseDir) { Remove-Item -LiteralPath $CaseDir -Recurse -Force }
  if (Test-Path -LiteralPath $OutputRoot) { Remove-Item -LiteralPath $OutputRoot -Recurse -Force }
}

Write-Host 'Folder Maker parser tests passed.'
