# Installs Pathfinder's private Node.js runtime (Windows).
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File install-node.ps1 -Dest <dest-dir> [-Check | -UseSystem]
#
# Downloads a pinned LTS build from nodejs.org, checks its SHA-256 against the hash
# below, and places node.exe in <dest-dir>\node\bin. Nothing outside <dest-dir> is
# touched: no administrator rights, no PATH change. Messages are in Portuguese.
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [switch]$Check,
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

$Target = Join-Path $Dest 'node'
$Bin = Join-Path $Target 'bin'
$Exe = Join-Path $Bin 'node.exe'

function Test-Installed {
  if (-not (Test-Path $Exe)) { return $false }
  $versionFile = Join-Path $Target 'VERSION'
  if (-not (Test-Path $versionFile)) { return $false }
  if ((Get-Content $versionFile -Raw).Trim() -ne $NodeVersion) { return $false }
  try { & $Exe --version *> $null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

if ($Check) {
  if (Test-Installed) { Write-Output "OK $NodeVersion (instalado em $Target)"; exit 0 }
  Write-Output "FALTANDO: o componente ainda nao esta instalado em $Target"
  exit 3
}
if (Test-Installed) { Write-Output "OK $NodeVersion (ja estava instalado em $Target)"; exit 0 }

# Plan B when downloads are blocked: copy node.exe from a Node.js 22+ the person
# installed with the official installer.
function Use-SystemNode {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $cmd) { return $false }
  $major = 0
  try { $major = [int](& $cmd.Source -p "process.versions.node.split('.')[0]") } catch { return $false }
  if ($major -lt 22) { return $false }
  if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
  New-Item -ItemType Directory -Force -Path $Bin | Out-Null
  Copy-Item $cmd.Source $Exe
  try { New-Item -ItemType HardLink -Path (Join-Path $Bin 'node') -Target $Exe | Out-Null } catch {}
  $version = (& $Exe --version).Trim()
  Set-Content -Path (Join-Path $Target 'VERSION') -Value $NodeVersion -NoNewline
  # Straight to stdout: Write-Output here would become part of the return value.
  [Console]::Out.WriteLine("OK $version (usando o Node.js ja instalado no computador: $($cmd.Source))")
  return $true
}

if ($UseSystem) {
  if (Use-SystemNode) { exit 0 }
  Fail 'nao encontrei um Node.js 22 ou mais novo instalado no computador.'
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
    if (Use-SystemNode) { exit 0 }
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
