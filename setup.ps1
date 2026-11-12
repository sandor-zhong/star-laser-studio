param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& node --version
if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 20+ first.' }
& node -e "if(Number(process.versions.node.split('.')[0])<20)process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 20+ is required.' }
$studioPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $studioPython)) {
    & $Python -m venv (Join-Path $PSScriptRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11+, or pass -Python with its executable path.' }
}
& $studioPython -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
if (Get-Command uv -ErrorAction SilentlyContinue) {
    $env:UV_CACHE_DIR = Join-Path $PSScriptRoot '.local/uv-cache'
    & uv pip install --python $studioPython -r requirements.txt
} else {
    & $studioPython -m pip --disable-pip-version-check install --no-input --cache-dir (Join-Path $PSScriptRoot '.local/pip-cache') -r requirements.txt
}
if ($LASTEXITCODE -ne 0) { throw 'Python dependencies could not be installed.' }
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'vendor/dyhub')
try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Node dependencies could not be installed.' }
    & node build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Collector build failed.' }
} finally { Pop-Location }
& $studioPython -X utf8 -B live_launcher.py init
if ($LASTEXITCODE -ne 0) { throw 'Local configuration could not be initialized.' }
Write-Host 'Ready. Start: ./start-live.ps1 -RoomId 278339149230'
