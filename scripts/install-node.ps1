# Installs Pathfinder's private Node.js runtime (Windows).
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File install-node.ps1 -Dest <dest-dir> [-Check | -Verify | -UseSystem]
#
# Places node.exe in <dest-dir>\node\bin, the exact path .mcp.json starts the server
# with. A Node.js 22+ already installed on the computer is copied, with no download (set
# PATHFINDER_NODE_SKIP_SYSTEM=1 to skip that). Otherwise a pinned LTS build is downloaded
# from nodejs.org and checked against the SHA-256 below. Then the bundled server is
# started once to prove it works: only that prints the final "PRONTO:" line.
# Nothing outside <dest-dir> is touched: no administrator rights, no PATH change.
# Messages are in Portuguese, without accents (this file stays ASCII for PowerShell 5.1).
#
#   -Check      OK / FALTANDO (exit 3); installs nothing
#   -Verify     starts the server with the installed runtime; installs nothing
#   -UseSystem  copy the computer's Node.js 22+ even when a download would work
param(
  [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Dest,
  [switch]$Check,
  [switch]$Verify,
  [switch]$UseSystem
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$NodeVersion = 'v24.22.2'
# From https://nodejs.org/dist/v24.22.2/SHASUMS256.txt
$Hashes = @{
  'win-x64'   = 'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2'
  'win-arm64' = 'f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468'
}

function Fail([string]$Message) {
  [Console]::Error.WriteLine("ERRO: $Message")
  exit 1
}

# The skill passes the plugin data folder, filled in by Claude Code. A placeholder that
# was not filled in, or a relative path, means the command was improvised: installing
# anywhere else would leave Pathfinder still unable to start.
if (-not $Dest) { Fail 'informe a pasta de destino (uso: install-node.ps1 -Dest <pasta>).' }
if ($Dest.Contains('$')) { Fail "a pasta de destino nao foi preenchida ($Dest). Nada foi instalado." }
if (-not [System.IO.Path]::IsPathRooted($Dest)) { Fail "a pasta de destino precisa ser um caminho completo ($Dest). Nada foi instalado." }

$Target = Join-Path $Dest 'node'
$Bin = Join-Path $Target 'bin'
$Exe = Join-Path $Bin 'node.exe'
$Server = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\server.mjs'

function Test-Installed {
  if (-not (Test-Path $Exe)) { return $false }
  $versionFile = Join-Path $Target 'VERSION'
  if (-not (Test-Path $versionFile)) { return $false }
  # A pinned download, or a copied system Node (SOURCE file).
  $pinned = (Get-Content $versionFile -Raw).Trim() -eq $NodeVersion
  if (-not $pinned -and -not (Test-Path (Join-Path $Target 'SOURCE'))) { return $false }
  try { & $Exe --version *> $null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

# Starts the bundled server with bin\node (no ".exe", as .mcp.json names it), as Claude
# Code will, and prints the final line. "PRONTO:" is the only output that means ready.
function Confirm-Ready {
  if (-not (Test-Path $Server)) { Fail "nao encontrei os arquivos do Pathfinder ($Server). Reinstale o plugin." }
  $scratch = Join-Path $Dest (".verify-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  $result = ''
  $code = 1
  try {
    $result = (& $Exe (Join-Path $PSScriptRoot 'verify-server.mjs') (Join-Path $Bin 'node') $Server $scratch | Out-String).Trim()
    $code = $LASTEXITCODE
  } catch { $result = $_.Exception.Message }
  if ($code -eq 0) {
    $version = (& $Exe --version | Out-String).Trim()
    Write-Output "PRONTO: o Pathfinder iniciou com o componente $version em $Exe"
    exit 0
  }
  Fail "o componente esta em $Target, mas o Pathfinder nao conseguiu iniciar com ele: $result"
}

if ($Check) {
  if (Test-Installed) { Write-Output "OK $((& $Exe --version | Out-String).Trim()) (instalado em $Target)"; exit 0 }
  Write-Output "FALTANDO: o componente ainda nao esta instalado em $Target"
  exit 3
}
if ($Verify) {
  if (-not (Test-Installed)) { Write-Output "FALTANDO: o componente ainda nao esta instalado em $Target"; exit 3 }
  Confirm-Ready
}
if (-not $UseSystem -and (Test-Installed)) {
  Write-Output "OK $((& $Exe --version | Out-String).Trim()) (ja estava instalado em $Target)"
  Confirm-Ready
}

# The Node.js 22+ the person installed with the official installer (the README asks for
# it), found on PATH or in the usual install folders: an app started before the install
# does not see the new PATH yet. node.exe is copied, so nothing is downloaded.
function Use-SystemNode {
  $candidates = @()
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe') }
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe') }
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe') }
  foreach ($candidate in $candidates) {
    if (-not (Test-Path $candidate)) { continue }
    $major = 0
    try { $major = [int](& $candidate -p "process.versions.node.split('.')[0]") } catch { continue }
    if ($major -lt 22) { continue }
    if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
    New-Item -ItemType Directory -Force -Path $Bin | Out-Null
    Copy-Item $candidate $Exe
    try { New-Item -ItemType HardLink -Path (Join-Path $Bin 'node') -Target $Exe | Out-Null } catch {}
    $version = (& $Exe --version | Out-String).Trim()
    Set-Content -Path (Join-Path $Target 'VERSION') -Value $version -NoNewline
    Set-Content -Path (Join-Path $Target 'SOURCE') -Value $candidate -NoNewline
    # Straight to stdout: Write-Output here would become part of the return value.
    [Console]::Out.WriteLine("OK $version (usando o Node.js ja instalado no computador: $candidate)")
    return $true
  }
  return $false
}

if ($UseSystem) {
  if (Use-SystemNode) { Confirm-Ready }
  Fail 'nao encontrei um Node.js 22 ou mais novo instalado no computador.'
}
if (-not $env:PATHFINDER_NODE_SKIP_SYSTEM) {
  if (Use-SystemNode) { Confirm-Ready }
}

$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$platform = switch ($arch) { 'AMD64' { 'win-x64' } 'ARM64' { 'win-arm64' } default { $null } }
if (-not $platform) { Fail "processador nao suportado: $arch." }
$expected = if ($env:PATHFINDER_NODE_EXPECTED_SHA256) { $env:PATHFINDER_NODE_EXPECTED_SHA256 } else { $Hashes[$platform] }

# Windows PowerShell 5.1 defaults to old TLS versions.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$work = Join-Path $Dest (".node-install-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $work | Out-Null
try {
  $archive = "node-$NodeVersion-$platform.zip"
  $mirror = if ($env:PATHFINDER_NODE_MIRROR) { $env:PATHFINDER_NODE_MIRROR } else { 'https://nodejs.org/dist' }
  $url = "$mirror/$NodeVersion/$archive"
  $zip = Join-Path $work $archive
  Write-Output "Baixando o componente (Node.js $NodeVersion, cerca de 30 MB) de nodejs.org..."
  try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing }
  catch {
    Fail "nao consegui baixar $url. Verifique a internet (ou proxy/antivirus da empresa) e tente de novo."
  }

  $actual = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLowerInvariant()
  if ($actual -ne $expected.ToLowerInvariant()) { Fail 'o arquivo baixado nao confere com a assinatura esperada (SHA-256). Nada foi instalado.' }

  $extracted = Join-Path $work 'x'
  New-Item -ItemType Directory -Force -Path $extracted | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path $tar) { & $tar -xf $zip -C $extracted }
  if (-not (Test-Path (Join-Path $extracted "node-$NodeVersion-$platform\node.exe"))) { Expand-Archive -Path $zip -DestinationPath $extracted -Force }
  $source = Join-Path $extracted "node-$NodeVersion-$platform"
  if (-not (Test-Path (Join-Path $source 'node.exe'))) { Fail 'o pacote baixado nao tem o executavel esperado.' }

  # Only node.exe is needed. bin\node (a hard link, no extension) also covers launchers
  # that do not append ".exe" to the configured command.
  $stage = Join-Path $work 'node'
  $stageBin = Join-Path $stage 'bin'
  New-Item -ItemType Directory -Force -Path $stageBin | Out-Null
  Copy-Item (Join-Path $source 'node.exe') (Join-Path $stageBin 'node.exe')
  if (Test-Path (Join-Path $source 'LICENSE')) { Copy-Item (Join-Path $source 'LICENSE') (Join-Path $stage 'LICENSE') }
  try { New-Item -ItemType HardLink -Path (Join-Path $stageBin 'node') -Target (Join-Path $stageBin 'node.exe') | Out-Null } catch {}
  Set-Content -Path (Join-Path $stage 'VERSION') -Value $NodeVersion -NoNewline
  & (Join-Path $stageBin 'node.exe') --version *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'o componente baixado nao funciona neste computador.' }

  $old = Join-Path $Dest 'node.old'
  if (Test-Path $old) { Remove-Item -Recurse -Force $old }
  if (Test-Path $Target) { Move-Item $Target $old }
  Move-Item $stage $Target
  if (Test-Path $old) { Remove-Item -Recurse -Force $old -ErrorAction SilentlyContinue }
  Write-Output "OK $NodeVersion (instalado em $Target)"
}
finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
Confirm-Ready
