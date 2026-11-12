param(
    [string]$RoomId = '',
    [ValidateRange(1,65535)][int]$StudioPort = 8082,
    [ValidateRange(1,65535)][int]$RelayPort = 8002,
    [ValidateRange(1,65535)][int]$CollectorPort = 8757,
    [switch]$Check,
    [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$studioPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $studioPython)) { throw 'Run ./setup.ps1 first.' }
$launcherArgs = @('-X','utf8','-B',(Join-Path $PSScriptRoot 'live_launcher.py'))
if ($Check -and $Stop) { throw 'Choose either -Check or -Stop.' }
if ($Check) { $launcherArgs += 'check' } elseif ($Stop) { $launcherArgs += 'stop' } else { $launcherArgs += 'run' }
$launcherArgs += @('--studio-port',"$StudioPort",'--relay-port',"$RelayPort",'--collector-port',"$CollectorPort")
if ($RoomId) { $launcherArgs += @('--room',$RoomId) }
& $studioPython @launcherArgs
exit $LASTEXITCODE
