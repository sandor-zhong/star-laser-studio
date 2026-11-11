param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8082,

    [ValidateNotNullOrEmpty()]
    [string]$RelayProjectPath = 'D:/PythonProjects/douyin-browser-ws-relay'
)

$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$studioServer = Join-Path $studioRoot 'studio_server.py'
$relayRoot = [System.IO.Path]::GetFullPath($RelayProjectPath)
$pythonCandidates = @(
    (Join-Path $studioRoot '.venv/Scripts/python.exe'),
    (Join-Path $relayRoot '.venv/Scripts/python.exe')
)
$studioPython = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $studioPython) {
    $pythonCommand = Get-Command python -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pythonCommand) { $studioPython = $pythonCommand.Source }
}

if (-not $studioPython) {
    throw 'Python was not found. Create a project virtual environment, provide -RelayProjectPath, or add Python to PATH.'
}
if (-not (Test-Path -LiteralPath $studioServer -PathType Leaf)) {
    throw 'studio_server.py was not found in the studio project.'
}

Write-Host "Studio display: http://127.0.0.1:$Port/?live=1"
Write-Host "Studio admin:   http://127.0.0.1:$Port/admin/"
Write-Host 'The relay gateway and Douyin collector must be started separately. Press Ctrl+C to stop.'

$studioArguments = @('-B', $studioServer, '--host', '127.0.0.1', '--port', [string]$Port, '--relay-project', $relayRoot)
Push-Location -LiteralPath $studioRoot
try {
    & $studioPython @studioArguments
    $studioExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($studioExitCode -ne 0) { exit $studioExitCode }
