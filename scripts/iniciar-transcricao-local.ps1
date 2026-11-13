param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$IdDaExtensao,
  [string]$Pacotes = (Join-Path $env:LOCALAPPDATA 'LibrasEmReuniao/transcricao')
)
$ErrorActionPreference = 'Stop'
$raiz = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeLibras = (Get-Command node -ErrorAction Stop).Source
try {
  $existente = Invoke-RestMethod -Uri 'http://127.0.0.1:18271/health' -Headers @{ Origin = ('chrome-extension://' + $IdDaExtensao) } -TimeoutSec 2
  if ($existente.schema -eq 1) { Write-Output 'A transcrição acelerada já está aberta para esta extensão.'; return }
} catch { if ($_.Exception.Response.StatusCode.value__ -eq 403) { throw 'Há um serviço configurado para outra extensão na porta 18271. Encerre-o antes de trocar o ID.' } }
if (-not (Test-Path -LiteralPath (Join-Path $Pacotes 'node_modules/@huggingface/transformers/dist/transformers.node.mjs'))) {
  npm install --prefix $Pacotes --no-audit --no-fund --no-save @huggingface/transformers@3.8.1
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar o runtime. Confira Node.js/npm e a conexão.' }
}
New-Item -ItemType Directory -Path $Pacotes -Force | Out-Null
$servico = $null
$anteriorId = $env:LIBRAS_EXTENSAO_ID
$anteriorPacotes = $env:LIBRAS_TRANSCRICAO_PACOTES
try {
  $env:LIBRAS_EXTENSAO_ID = $IdDaExtensao
  $env:LIBRAS_TRANSCRICAO_PACOTES = $Pacotes
  $servico = Start-Process -FilePath $nodeLibras -ArgumentList @('"' + (Join-Path $raiz 'scripts/transcricao-local.mjs') + '"') -WorkingDirectory $raiz -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Pacotes 'servico.log') -RedirectStandardError (Join-Path $Pacotes 'servico-erros.log')
  $pronto = $false
  for ($tentativa = 0; $tentativa -lt 15; $tentativa++) {
    if ($servico.HasExited) { throw ('O serviço encerrou. Veja ' + (Join-Path $Pacotes 'servico-erros.log')) }
    try {
      $estado = Invoke-RestMethod -Uri 'http://127.0.0.1:18271/health' -Headers @{ Origin = ('chrome-extension://' + $IdDaExtensao) } -TimeoutSec 1
      if ($estado.schema -eq 1) { $pronto = $true; break }
    } catch { Start-Sleep -Milliseconds 150 }
  }
  if (-not $pronto) { throw 'O serviço ainda não confirmou a inicialização. Confira os logs.' }
  $servico.Id | Set-Content -LiteralPath (Join-Path $Pacotes 'servico.pid')
  Write-Output ('Serviço iniciado em segundo plano, PID {0}. Na extensão, escolha Acelerado neste computador. Logs: {1}' -f $servico.Id, $Pacotes)
} catch {
  if ($servico -and -not $servico.HasExited) { Stop-Process -Id $servico.Id -ErrorAction SilentlyContinue }
  throw
} finally {
  $env:LIBRAS_EXTENSAO_ID = $anteriorId
  $env:LIBRAS_TRANSCRICAO_PACOTES = $anteriorPacotes
}
