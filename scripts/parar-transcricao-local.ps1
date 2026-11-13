param([string]$Pacotes = (Join-Path $env:LOCALAPPDATA 'LibrasEmReuniao/transcricao'))
$ErrorActionPreference = 'Stop'
$arquivoPid = Join-Path $Pacotes 'servico.pid'
if (-not (Test-Path -LiteralPath $arquivoPid)) { Write-Output 'Não há serviço registrado nesta pasta.'; return }
$processoIdLibras = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $arquivoPid -Raw).Trim(), [ref]$processoIdLibras) -or $processoIdLibras -le 0) { throw 'Registro de serviço inválido.' }
$processoLibras = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $processoIdLibras)
$scriptEsperadoLibras = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'transcricao-local.mjs'))
if (-not $processoLibras) { Write-Output 'O serviço já está encerrado.'; return }
if ($processoLibras.Name -ne 'node.exe' -or $processoLibras.CommandLine -notmatch [regex]::Escape($scriptEsperadoLibras)) { throw 'O PID pertence a outro processo. Nenhum processo foi encerrado.' }
Stop-Process -Id $processoIdLibras -ErrorAction Stop
Write-Output 'Transcrição acelerada encerrada. O modo Navegador continua disponível.'
