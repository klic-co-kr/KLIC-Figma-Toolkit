param(
  [switch]$SmokeTest
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$GuiCmd = Join-Path $Root 'folder-maker-gui.cmd'
$Prefixes = @('http://localhost:39573/', 'http://127.0.0.1:39573/')
$BridgeToken = [Guid]::NewGuid().ToString('N')
$ClientToken = '784d084535ea34a6d54538d37fcc26455e8854cb691f66b3ac368e6aeadfcc95'

if ($SmokeTest) {
  if (-not (Test-Path -LiteralPath $GuiCmd)) { throw "Missing Folder Maker GUI wrapper: $GuiCmd" }
  $listener = New-Object System.Net.HttpListener
  foreach ($prefix in $Prefixes) { $listener.Prefixes.Add($prefix) }
  $listener.Close()
  Write-Host 'Folder Maker bridge smoke test passed.'
  exit 0
}

function Write-JsonResponse($Context, [int]$StatusCode, [string]$Json) {
  $response = $Context.Response
  $response.StatusCode = $StatusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $response.Headers['Cache-Control'] = 'no-store'
  $response.Headers['Access-Control-Allow-Origin'] = '*'
  $response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, X-KLIC-Client, X-KLIC-Bridge-Token'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.OutputStream.Close()
}

function New-Json([hashtable]$Data) {
  return ($Data | ConvertTo-Json -Compress)
}

if (-not (Test-Path -LiteralPath $GuiCmd)) {
  throw "Folder Maker GUI wrapper not found: $GuiCmd"
}

$listener = New-Object System.Net.HttpListener
foreach ($prefix in $Prefixes) { $listener.Prefixes.Add($prefix) }

try {
  $listener.Start()
  Write-Host "KLIC Folder Maker bridge listening on $($Prefixes -join ', ')"
  Write-Host 'Close this window to stop the bridge.'

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $path = $request.Url.AbsolutePath.TrimEnd('/')

    if ($request.HttpMethod -eq 'OPTIONS') {
      Write-JsonResponse $context 204 '{}'
      continue
    }

    if ($request.Headers['X-KLIC-Client'] -ne $ClientToken) {
      Write-JsonResponse $context 403 (New-Json @{ ok = $false; error = 'INVALID_CLIENT' })
      continue
    }

    if ($path -eq '' -or $path -eq '/health') {
      Write-JsonResponse $context 200 (New-Json @{
        ok = $true
        app = 'klic-folder-maker-bridge'
        bridgeToken = $BridgeToken
      })
      continue
    }

    if ($path -eq '/open-folder-maker') {
      if ($request.HttpMethod -ne 'POST') {
        Write-JsonResponse $context 405 (New-Json @{ ok = $false; error = 'METHOD_NOT_ALLOWED' })
        continue
      }
      if ($request.Headers['X-KLIC-Bridge-Token'] -ne $BridgeToken) {
        Write-JsonResponse $context 403 (New-Json @{ ok = $false; error = 'INVALID_BRIDGE_TOKEN' })
        continue
      }
      Start-Process -FilePath $GuiCmd | Out-Null
      Write-JsonResponse $context 200 (New-Json @{
        ok = $true
        opened = $true
      })
      continue
    }

    Write-JsonResponse $context 404 (New-Json @{ ok = $false; error = 'NOT_FOUND' })
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
