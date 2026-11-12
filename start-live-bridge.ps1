# Advanced: gateway and bundled DyHub must already be running.
param([string]$RoomId = '')
$ErrorActionPreference = 'Stop'
$studioPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $studioPython)) { throw 'Run ./setup.ps1 first.' }
Push-Location -LiteralPath $PSScriptRoot
try {
    $bridgeArgs = @('-X','utf8','-B','-m','live_relay.dyhub_bridge')
    if ($RoomId) { $bridgeArgs += @('--room',$RoomId) }
    & $studioPython @bridgeArgs
    $bridgeExitCode = $LASTEXITCODE
} finally { Pop-Location }
exit $bridgeExitCode
