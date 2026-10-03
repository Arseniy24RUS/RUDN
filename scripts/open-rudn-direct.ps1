[CmdletBinding()]
param([switch]$CheckOnly, [string]$Url = 'https://arseniy24rus.github.io/RUDN/')

# A separate interactive browser for campus-network QA. Windows proxy, VPN,
# DNS and routes stay unchanged. Students use the ordinary platform URL.
$ErrorActionPreference = 'Stop'
$platformUri = [Uri]$Url
if ($platformUri.Scheme -ne 'https' -or $platformUri.Host -ne 'arseniy24rus.github.io' -or -not $platformUri.AbsolutePath.StartsWith('/RUDN/')) {
  throw 'Use an HTTPS URL inside https://arseniy24rus.github.io/RUDN/.'
}
if ($CheckOnly) {
  $curl = (Get-Command curl.exe -ErrorAction Stop).Source
  foreach ($endpoint in @('https://arseniy24rus.github.io/RUDN/', 'https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/networkGateway/health')) {
    $ErrorActionPreference = 'Continue'
    $status = & $curl --noproxy '*' --ipv4 --connect-timeout 5 --max-time 15 --silent --show-error --output NUL --write-out '%{http_code}' $endpoint 2>$null
    $probeExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($probeExitCode -ne 0 -or "$status" -ne '200') { throw "Direct network probe failed: $endpoint (HTTP $status)." }
    Write-Output "Direct HTTPS OK: $endpoint"
  }
  return
}
$profileDirectory = Join-Path $env:LOCALAPPDATA 'RUDN\NetworkBrowser-Direct'
$browserCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$browserExecutable = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browserExecutable) { throw 'Microsoft Edge or Google Chrome is required.' }
$launchArguments = @('--no-proxy-server', '--no-first-run', '--no-default-browser-check', "`"--user-data-dir=$profileDirectory`"", "`"--app=$Url`"")
# This visible platform window is the isolated connection requested by the user.
Start-Process -FilePath $browserExecutable -ArgumentList $launchArguments
Write-Output 'Opened a separate direct-network browser. System VPN unchanged.'
