param(
  [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Generator = Join-Path $Root 'Create-Folders.ps1'
$SampleCsv = Join-Path $Root 'sample.csv'

if ($SmokeTest) {
  foreach ($path in @($Generator, $SampleCsv)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing required file: $path" }
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Write-Host 'Folder Maker GUI smoke test passed.'
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-Label([string]$Text, [int]$X, [int]$Y, [int]$W, [int]$H) {
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($W, $H)
  return $label
}

function New-TextBox([int]$X, [int]$Y, [int]$W) {
  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Location = New-Object System.Drawing.Point($X, $Y)
  $textBox.Size = New-Object System.Drawing.Size($W, 24)
  return $textBox
}

function New-Button([string]$Text, [int]$X, [int]$Y, [int]$W, [scriptblock]$OnClick) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($W, 30)
  $button.Add_Click($OnClick)
  return $button
}

function Append-Output([string]$Text) {
  $outputBox.AppendText($Text)
  if (-not $Text.EndsWith("`r`n")) { $outputBox.AppendText("`r`n") }
}

function Run-FolderMaker([bool]$Execute) {
  $csv = $csvText.Text.Trim()
  $out = $outText.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($csv) -or -not (Test-Path -LiteralPath $csv)) {
    [System.Windows.Forms.MessageBox]::Show('Select a valid CSV file.', 'Folder Maker') | Out-Null
    return
  }
  if ([string]::IsNullOrWhiteSpace($out)) {
    [System.Windows.Forms.MessageBox]::Show('Select an output folder.', 'Folder Maker') | Out-Null
    return
  }

  $toolArgs = @('-CsvPath', $csv, '-OutDir', $out)
  if ($groupCheck.Checked) { $toolArgs += '-GroupByTemplate' }
  $copyFile = $copyText.Text.Trim()
  if (-not [string]::IsNullOrWhiteSpace($copyFile)) {
    if (-not (Test-Path -LiteralPath $copyFile)) {
      [System.Windows.Forms.MessageBox]::Show('Select a valid template file to copy.', 'Folder Maker') | Out-Null
      return
    }
    $toolArgs += @('-CopyFile', $copyFile)
  }
  if ($renameCopyCheck.Checked) { $toolArgs += '-RenameCopyToFolder' }
  if ($overwriteCopyCheck.Checked) { $toolArgs += '-OverwriteCopy' }
  if ($Execute) { $toolArgs += '-Execute' }

  $outputBox.Clear()
  if ($Execute) {
    Append-Output 'CREATE MODE'
  } else {
    Append-Output 'PREVIEW MODE'
  }
  Append-Output "CSV: $csv"
  Append-Output "Output: $out"
  if (-not [string]::IsNullOrWhiteSpace($copyFile)) { Append-Output "Copy file: $copyFile" }
  Append-Output ''

  $previousLocation = Get-Location
  try {
    Set-Location (Split-Path -Parent $Root)
    $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $Generator @toolArgs 2>&1
    foreach ($line in $result) { Append-Output ([string]$line) }
    Append-Output ''
    Append-Output "ExitCode: $LASTEXITCODE"
  } catch {
    Append-Output $_.Exception.Message
  } finally {
    Set-Location $previousLocation
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Folder Maker'
$form.Size = New-Object System.Drawing.Size(820, 680)
$form.StartPosition = 'CenterScreen'

$csvText = New-TextBox 150 24 500
$outText = New-TextBox 150 68 500
$copyText = New-TextBox 150 112 500

$outputBox = New-Object System.Windows.Forms.TextBox
$outputBox.Location = New-Object System.Drawing.Point(20, 250)
$outputBox.Size = New-Object System.Drawing.Size(760, 350)
$outputBox.Multiline = $true
$outputBox.ScrollBars = 'Both'
$outputBox.ReadOnly = $true
$outputBox.Font = New-Object System.Drawing.Font('Consolas', 9)

$groupCheck = New-Object System.Windows.Forms.CheckBox
$groupCheck.Text = 'Group by template number'
$groupCheck.Location = New-Object System.Drawing.Point(150, 152)
$groupCheck.Size = New-Object System.Drawing.Size(220, 24)

$renameCopyCheck = New-Object System.Windows.Forms.CheckBox
$renameCopyCheck.Text = 'Rename copied file to folder name'
$renameCopyCheck.Location = New-Object System.Drawing.Point(150, 178)
$renameCopyCheck.Size = New-Object System.Drawing.Size(260, 24)
$renameCopyCheck.Checked = $true

$overwriteCopyCheck = New-Object System.Windows.Forms.CheckBox
$overwriteCopyCheck.Text = 'Overwrite existing copied file'
$overwriteCopyCheck.Location = New-Object System.Drawing.Point(420, 178)
$overwriteCopyCheck.Size = New-Object System.Drawing.Size(240, 24)

$form.Controls.Add((New-Label 'CSV file' 20 27 120 24))
$form.Controls.Add($csvText)
$form.Controls.Add((New-Label 'Output folder' 20 71 120 24))
$form.Controls.Add($outText)
$form.Controls.Add((New-Label 'Template file' 20 115 120 24))
$form.Controls.Add($copyText)
$form.Controls.Add($groupCheck)
$form.Controls.Add($renameCopyCheck)
$form.Controls.Add($overwriteCopyCheck)

$form.Controls.Add((New-Button 'Select CSV' 660 22 100 {
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Filter = 'CSV/TSV files (*.csv;*.tsv;*.txt)|*.csv;*.tsv;*.txt|All files (*.*)|*.*'
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $csvText.Text = $dialog.FileName
  }
}))

$form.Controls.Add((New-Button 'Select Folder' 660 66 100 {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $outText.Text = $dialog.SelectedPath
  }
}))

$form.Controls.Add((New-Button 'Select File' 660 110 100 {
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Filter = 'Figma/template files (*.fig;*.sketch;*.zip;*.pdf;*.xlsx;*.docx)|*.fig;*.sketch;*.zip;*.pdf;*.xlsx;*.docx|All files (*.*)|*.*'
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $copyText.Text = $dialog.FileName
  }
}))

$form.Controls.Add((New-Button 'Open sample CSV' 20 210 130 {
  if (-not (Test-Path -LiteralPath $SampleCsv)) {
    [System.Windows.Forms.MessageBox]::Show('sample.csv is missing.', 'Folder Maker') | Out-Null
    return
  }
  Start-Process -FilePath $SampleCsv
}))

$form.Controls.Add((New-Button 'Use sample CSV' 160 210 120 {
  $csvText.Text = $SampleCsv
}))

$form.Controls.Add((New-Button 'Save sample as' 290 210 120 {
  if (-not (Test-Path -LiteralPath $SampleCsv)) {
    [System.Windows.Forms.MessageBox]::Show('sample.csv is missing.', 'Folder Maker') | Out-Null
    return
  }
  $dialog = New-Object System.Windows.Forms.SaveFileDialog
  $dialog.Filter = 'CSV files (*.csv)|*.csv|All files (*.*)|*.*'
  $dialog.FileName = 'folder-maker-sample.csv'
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Copy-Item -LiteralPath $SampleCsv -Destination $dialog.FileName -Force
    $csvText.Text = $dialog.FileName
    Start-Process -FilePath $dialog.FileName
  }
}))

$form.Controls.Add((New-Button 'Preview' 500 210 110 {
  Run-FolderMaker $false
}))

$form.Controls.Add((New-Button 'Create Folders' 620 210 140 {
  $answer = [System.Windows.Forms.MessageBox]::Show('Create folders now?', 'Folder Maker', 'YesNo', 'Warning')
  if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
    Run-FolderMaker $true
  }
}))

$form.Controls.Add((New-Button 'Open output folder' 20 610 150 {
  $out = $outText.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($out) -or -not (Test-Path -LiteralPath $out)) {
    [System.Windows.Forms.MessageBox]::Show('Output folder does not exist yet.', 'Folder Maker') | Out-Null
    return
  }
  Start-Process -FilePath $out
}))

$form.Controls.Add($outputBox)

[void]$form.ShowDialog()
