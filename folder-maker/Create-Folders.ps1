param(
  [Alias('c', 'csv')]
  [string]$CsvPath,

  [Alias('o', 'out')]
  [string]$OutDir,

  [switch]$Execute,

  [Alias('group-by-template')]
  [switch]$GroupByTemplate,

  [Alias('copy-file')]
  [string]$CopyFile = '',

  [Alias('rename-copy-to-folder')]
  [switch]$RenameCopyToFolder,

  [Alias('overwrite-copy')]
  [switch]$OverwriteCopy,

  [Alias('template-column')]
  [string]$TemplateColumn = '',

  [Alias('school-column')]
  [string]$SchoolColumn = '',

  [Alias('system-column')]
  [string]$SystemColumn = ''
)

$ErrorActionPreference = 'Stop'

function New-UnicodeString([int[]]$CodePoints) {
  $chars = foreach ($codePoint in $CodePoints) { [char]$codePoint }
  return -join $chars
}

$DefaultTemplateColumn = New-UnicodeString @(0xD15C, 0xD50C, 0xB9BF, 0xBC88, 0xD638)
$DefaultSchoolColumn = New-UnicodeString @(0xD559, 0xAD50, 0xBA85)
$DefaultSystemColumn = New-UnicodeString @(0xC2DC, 0xC2A4, 0xD15C, 0xC544, 0xC774, 0xB514)

if ([string]::IsNullOrWhiteSpace($TemplateColumn)) { $TemplateColumn = $DefaultTemplateColumn }
if ([string]::IsNullOrWhiteSpace($SchoolColumn)) { $SchoolColumn = $DefaultSchoolColumn }
if ([string]::IsNullOrWhiteSpace($SystemColumn)) { $SystemColumn = $DefaultSystemColumn }

function Write-Usage {
  Write-Host 'Usage:'
  Write-Host '  folder-maker\folder-create.cmd --csv input.csv --out D:\Project\Output [--execute] [--group-by-template] [--copy-file template.fig]'
  Write-Host ''
  Write-Host 'Columns:'
  Write-Host "  $TemplateColumn,$SchoolColumn,$SystemColumn"
}

function Read-RequiredPath([string]$PromptText) {
  $value = Read-Host $PromptText
  return $value.Trim('" ')
}

function Normalize-InputPath([string]$Value) {
  if ($null -eq $Value) { return '' }
  return ([string]$Value).Trim('" ')
}

function ConvertTo-SafeName([string]$Value) {
  $safe = ($Value -replace '[\\/:*?"<>|]', '_').Trim()
  $safe = $safe -replace '\s+', ' '
  $safe = $safe.TrimEnd('. ')
  if ([string]::IsNullOrWhiteSpace($safe)) { return '_' }
  return $safe
}

function Read-TextFileAutoEncoding([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    return [System.Text.Encoding]::UTF8.GetString($bytes)
  }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    return [System.Text.Encoding]::Unicode.GetString($bytes)
  }
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    return [System.Text.Encoding]::BigEndianUnicode.GetString($bytes)
  }

  try {
    $utf8Strict = New-Object System.Text.UTF8Encoding $false, $true
    return $utf8Strict.GetString($bytes)
  } catch {
    return [System.Text.Encoding]::Default.GetString($bytes)
  }
}

function Split-NonEmptyLines([string]$Text) {
  $normalized = $Text -replace "`r`n", "`n"
  $normalized = $normalized -replace "`r", "`n"
  return @($normalized -split "`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Count-DelimiterOutsideQuotes([string]$Line, [char]$Delimiter) {
  $inQuote = $false
  $count = 0
  for ($i = 0; $i -lt $Line.Length; $i++) {
    $ch = $Line[$i]
    if ($ch -eq '"') {
      if ($inQuote -and ($i + 1) -lt $Line.Length -and $Line[$i + 1] -eq '"') {
        $i++
      } else {
        $inQuote = -not $inQuote
      }
    } elseif (-not $inQuote -and $ch -eq $Delimiter) {
      $count++
    }
  }
  return $count
}

function Detect-Delimiter([string[]]$Lines) {
  $candidates = @([char]',', [char]"`t", [char]';', [char]'|')
  $bestDelimiter = [char]','
  $bestScore = -1
  foreach ($candidate in $candidates) {
    $score = 0
    foreach ($line in @($Lines | Select-Object -First 10)) {
      $score += Count-DelimiterOutsideQuotes $line $candidate
    }
    if ($score -gt $bestScore) {
      $bestScore = $score
      $bestDelimiter = $candidate
    }
  }
  return $bestDelimiter
}

function Split-DelimitedLine([string]$Line, [char]$Delimiter) {
  $items = New-Object System.Collections.Generic.List[string]
  $current = New-Object System.Text.StringBuilder
  $inQuote = $false
  for ($i = 0; $i -lt $Line.Length; $i++) {
    $ch = $Line[$i]
    if ($ch -eq '"') {
      if ($inQuote -and ($i + 1) -lt $Line.Length -and $Line[$i + 1] -eq '"') {
        [void]$current.Append('"')
        $i++
      } else {
        $inQuote = -not $inQuote
      }
    } elseif (-not $inQuote -and $ch -eq $Delimiter) {
      $items.Add($current.ToString().Trim())
      [void]$current.Clear()
    } else {
      [void]$current.Append($ch)
    }
  }
  $items.Add($current.ToString().Trim())
  return @($items)
}

function Normalize-Header([string]$Value) {
  if ($null -eq $Value) { return '' }
  return ([string]$Value).Trim([char]0xFEFF).ToLowerInvariant() -replace '[\s_\-()./]', ''
}

function New-AliasSet([string[]]$Values) {
  $set = @{}
  foreach ($value in $Values) {
    $key = Normalize-Header $value
    if (-not [string]::IsNullOrWhiteSpace($key)) { $set[$key] = $true }
  }
  return $set
}

function Find-HeaderAlias([string[]]$Headers, $Aliases) {
  foreach ($header in $Headers) {
    $key = Normalize-Header $header
    if ($Aliases.ContainsKey($key)) { return $header }
  }
  return ''
}

function Parse-FolderCsv([string]$Path) {
  $text = Read-TextFileAutoEncoding $Path
  $lines = Split-NonEmptyLines $text
  if (-not $lines -or $lines.Count -eq 0) {
    throw "CSV has no usable rows: $Path"
  }

  $delimiter = Detect-Delimiter $lines
  $firstFields = Split-DelimitedLine $lines[0] $delimiter

  $templateAliases = New-AliasSet @(
    $TemplateColumn,
    $DefaultTemplateColumn,
    (New-UnicodeString @(0xD15C, 0xD50C, 0xB9BF, 0xBC88)),
    'template',
    'templateno',
    'templatenumber',
    'templateid',
    'tmpl',
    'no',
    'number'
  )
  $schoolAliases = New-AliasSet @(
    $SchoolColumn,
    $DefaultSchoolColumn,
    (New-UnicodeString @(0xD559, 0xAD50)),
    (New-UnicodeString @(0xAE30, 0xAD00, 0xBA85)),
    (New-UnicodeString @(0xAE30, 0xAD00)),
    'school',
    'schoolname',
    'name',
    'org',
    'orgname'
  )
  $systemAliases = New-AliasSet @(
    $SystemColumn,
    $DefaultSystemColumn,
    (New-UnicodeString @(0xC2DC, 0xC2A4, 0xD15C, 'I'[0], 'D'[0])),
    'system',
    'systemid',
    'sysid',
    'id'
  )

  $matchedHeaderCount = 0
  if (Find-HeaderAlias $firstFields $templateAliases) { $matchedHeaderCount++ }
  if (Find-HeaderAlias $firstFields $schoolAliases) { $matchedHeaderCount++ }
  if (Find-HeaderAlias $firstFields $systemAliases) { $matchedHeaderCount++ }

  $hasHeader = $matchedHeaderCount -ge 2
  $dataLines = $lines
  $headers = $firstFields
  if (-not $hasHeader) {
    $headers = @($TemplateColumn, $SchoolColumn, $SystemColumn)
    for ($i = 4; $i -le [Math]::Max($firstFields.Count, 3); $i++) {
      $headers += "Extra$i"
    }
  }

  try {
    if ($hasHeader) {
      $rows = ConvertFrom-Csv -InputObject $dataLines -Delimiter $delimiter
    } else {
      $rows = ConvertFrom-Csv -InputObject $dataLines -Delimiter $delimiter -Header $headers
    }
  } catch {
    throw "CSV parse failed. Check quotes, delimiters, or broken line breaks. $($_.Exception.Message)"
  }

  if (-not $rows) {
    throw "CSV has no data rows after parsing: $Path"
  }

  $headers = @($rows[0].PSObject.Properties.Name)
  $resolvedTemplate = Find-HeaderAlias $headers $templateAliases
  $resolvedSchool = Find-HeaderAlias $headers $schoolAliases
  $resolvedSystem = Find-HeaderAlias $headers $systemAliases

  if ([string]::IsNullOrWhiteSpace($resolvedTemplate) -or [string]::IsNullOrWhiteSpace($resolvedSchool) -or [string]::IsNullOrWhiteSpace($resolvedSystem)) {
    throw "Could not resolve required columns. Found: $($headers -join ', '). Use --TemplateColumn, --SchoolColumn, --SystemColumn to map custom headers."
  }

  return [pscustomobject]@{
    Rows = @($rows)
    TemplateColumn = $resolvedTemplate
    SchoolColumn = $resolvedSchool
    SystemColumn = $resolvedSystem
    Delimiter = $delimiter
    HasHeader = $hasHeader
  }
}

function Get-FieldValue($Row, [string]$ColumnName) {
  $value = $Row.$ColumnName
  if ($null -eq $value) { return '' }
  return ([string]$value).Trim()
}

function New-Result([int]$Index, $Row, [string]$FolderName, [string]$TargetPath, [string]$Status, [string]$Reason, [string]$CopySource, [string]$CopyTarget, [string]$CopyStatus, [string]$CopyReason) {
  [pscustomobject]@{
    RowNumber = $Index
    TemplateNo = Get-FieldValue $Row $TemplateColumn
    SchoolName = Get-FieldValue $Row $SchoolColumn
    SystemId = Get-FieldValue $Row $SystemColumn
    FolderName = $FolderName
    TargetPath = $TargetPath
    Status = $Status
    Reason = $Reason
    CopySource = $CopySource
    CopyTarget = $CopyTarget
    CopyStatus = $CopyStatus
    CopyReason = $CopyReason
  }
}

function Copy-TemplateFileToFolder([string]$SourcePath, [string]$TargetFolder, [string]$FolderName) {
  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    return [pscustomobject]@{ Source = ''; Target = ''; Status = ''; Reason = '' }
  }
  $extension = [System.IO.Path]::GetExtension($SourcePath)
  $fileName = [System.IO.Path]::GetFileName($SourcePath)
  if ($RenameCopyToFolder) {
    $fileName = "$FolderName$extension"
  }
  $targetFile = Join-Path $TargetFolder $fileName
  if ((Test-Path -LiteralPath $targetFile) -and -not $OverwriteCopy) {
    return [pscustomobject]@{ Source = $SourcePath; Target = $targetFile; Status = 'SKIPPED'; Reason = 'FILE_EXISTS' }
  }
  Copy-Item -LiteralPath $SourcePath -Destination $targetFile -Force:$OverwriteCopy
  return [pscustomobject]@{ Source = $SourcePath; Target = $targetFile; Status = 'COPIED'; Reason = '' }
}

if ([string]::IsNullOrWhiteSpace($CsvPath)) {
  Write-Usage
  $CsvPath = Read-RequiredPath 'CSV path'
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
  $OutDir = Read-RequiredPath 'Output parent folder'
}

$CsvPath = [System.IO.Path]::GetFullPath((Normalize-InputPath $CsvPath))
$OutDir = [System.IO.Path]::GetFullPath((Normalize-InputPath $OutDir))

if (-not (Test-Path -LiteralPath $CsvPath)) {
  throw "CSV file not found: $CsvPath"
}

if (-not [string]::IsNullOrWhiteSpace($CopyFile)) {
  $CopyFile = [System.IO.Path]::GetFullPath((Normalize-InputPath $CopyFile))
  if (-not (Test-Path -LiteralPath $CopyFile)) {
    throw "Copy file not found: $CopyFile"
  }
}

$parsedCsv = Parse-FolderCsv $CsvPath
$rows = $parsedCsv.Rows
$TemplateColumn = $parsedCsv.TemplateColumn
$SchoolColumn = $parsedCsv.SchoolColumn
$SystemColumn = $parsedCsv.SystemColumn

$logDir = Join-Path $OutDir '_folder-maker-logs'
if ($Execute) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$seen = @{}
$results = New-Object System.Collections.Generic.List[object]
$index = 1

foreach ($row in $rows) {
  $templateNo = Get-FieldValue $row $TemplateColumn
  $schoolName = Get-FieldValue $row $SchoolColumn
  $systemId = Get-FieldValue $row $SystemColumn

  $safeTemplate = ConvertTo-SafeName $templateNo
  $safeSchool = ConvertTo-SafeName $schoolName
  $safeSystem = ConvertTo-SafeName $systemId
  $folderName = "${safeTemplate}_${safeSchool}_${safeSystem}"

  $parent = $OutDir
  if ($GroupByTemplate) {
    $parent = Join-Path $OutDir $safeTemplate
  }
  $targetPath = Join-Path $parent $folderName
  $copyInfo = [pscustomobject]@{ Source = ''; Target = ''; Status = ''; Reason = '' }

  if ([string]::IsNullOrWhiteSpace($templateNo) -or [string]::IsNullOrWhiteSpace($schoolName) -or [string]::IsNullOrWhiteSpace($systemId)) {
    $results.Add((New-Result $index $row $folderName $targetPath 'FAILED' 'MISSING_REQUIRED_FIELD' '' '' '' ''))
  } elseif ($seen.ContainsKey($targetPath.ToLowerInvariant())) {
    $results.Add((New-Result $index $row $folderName $targetPath 'FAILED' 'DUPLICATE_IN_CSV' '' '' '' ''))
  } elseif (Test-Path -LiteralPath $targetPath) {
    if ($Execute) {
      try {
        $copyInfo = Copy-TemplateFileToFolder $CopyFile $targetPath $folderName
      } catch {
        $results.Add((New-Result $index $row $folderName $targetPath 'FAILED' $_.Exception.Message $CopyFile '' 'FAILED' $_.Exception.Message))
        $seen[$targetPath.ToLowerInvariant()] = $true
        $index++
        continue
      }
    }
    $results.Add((New-Result $index $row $folderName $targetPath 'SKIPPED' 'EXISTS' $copyInfo.Source $copyInfo.Target $copyInfo.Status $copyInfo.Reason))
  } elseif ($Execute) {
    try {
      New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
      $copyInfo = Copy-TemplateFileToFolder $CopyFile $targetPath $folderName
      $results.Add((New-Result $index $row $folderName $targetPath 'CREATED' '' $copyInfo.Source $copyInfo.Target $copyInfo.Status $copyInfo.Reason))
    } catch {
      $results.Add((New-Result $index $row $folderName $targetPath 'FAILED' $_.Exception.Message $CopyFile '' 'FAILED' $_.Exception.Message))
    }
  } else {
    if (-not [string]::IsNullOrWhiteSpace($CopyFile)) {
      $extension = [System.IO.Path]::GetExtension($CopyFile)
      $fileName = [System.IO.Path]::GetFileName($CopyFile)
      if ($RenameCopyToFolder) { $fileName = "$folderName$extension" }
      $copyInfo = [pscustomobject]@{ Source = $CopyFile; Target = (Join-Path $targetPath $fileName); Status = 'PREVIEW'; Reason = 'DRY_RUN' }
    }
    $results.Add((New-Result $index $row $folderName $targetPath 'PREVIEW' 'DRY_RUN' $copyInfo.Source $copyInfo.Target $copyInfo.Status $copyInfo.Reason))
  }

  $seen[$targetPath.ToLowerInvariant()] = $true
  $index++
}

$previewCount = @($results | Where-Object { $_.Status -eq 'PREVIEW' }).Count
$createdCount = @($results | Where-Object { $_.Status -eq 'CREATED' }).Count
$skippedCount = @($results | Where-Object { $_.Status -eq 'SKIPPED' }).Count
$failedCount = @($results | Where-Object { $_.Status -eq 'FAILED' }).Count
$copiedCount = @($results | Where-Object { $_.CopyStatus -eq 'COPIED' }).Count

if (-not $Execute) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $previewLog = Join-Path $logDir "preview-$timestamp.csv"
  $results | Export-Csv -LiteralPath $previewLog -NoTypeInformation -Encoding UTF8
  Write-Host "DRY RUN: no folders were created."
  Write-Host "Preview: $previewCount, Failed: $failedCount"
  Write-Host "Preview log: $previewLog"
  Write-Host "Run again with --execute to create folders."
  if ($failedCount -gt 0) { exit 2 }
  exit 0
}

$createdLog = Join-Path $logDir "created-$timestamp.csv"
$failedLog = Join-Path $logDir "failed-$timestamp.csv"
$results | Where-Object { $_.Status -in @('CREATED', 'SKIPPED') } | Export-Csv -LiteralPath $createdLog -NoTypeInformation -Encoding UTF8
$results | Where-Object { $_.Status -eq 'FAILED' } | Export-Csv -LiteralPath $failedLog -NoTypeInformation -Encoding UTF8

Write-Host "Folder creation finished."
Write-Host "Created: $createdCount, Skipped: $skippedCount, Failed: $failedCount, Files copied: $copiedCount"
Write-Host "Created/skipped log: $createdLog"
Write-Host "Failed log: $failedLog"

if ($failedCount -gt 0) { exit 2 }
exit 0
