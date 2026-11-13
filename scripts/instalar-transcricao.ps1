param([ValidateSet('base', 'small')][string]$Modelo = 'small')
$ErrorActionPreference = 'Stop'
$revisoes = @{ base = '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c'; small = '36050c46d777d46dc4b5f43f6d90574fc38f8732' }
$repo = 'onnx-community/whisper-' + $Modelo
$revisao = $revisoes[$Modelo]
$destino = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../modelos/whisper-$Modelo"))
$pesos = Invoke-RestMethod -Uri "https://huggingface.co/api/models/$repo/tree/$revisao/onnx"
$arquivos = @('config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'README.md', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx')
$origem = @()
foreach ($nome in $arquivos) {
  $arquivo = Join-Path $destino $nome
  New-Item -ItemType Directory -Path (Split-Path -Parent $arquivo) -Force | Out-Null
  $esperado = $pesos | Where-Object { $_.path -eq $nome } | Select-Object -First 1
  $hash = $esperado.lfs.oid
  $valido = (Test-Path -LiteralPath $arquivo) -and $hash -and ((Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash)
  if (-not $valido) {
    $parcial = $arquivo + '.download'
    Invoke-WebRequest -Uri "https://huggingface.co/$repo/resolve/$revisao/$nome" -OutFile $parcial
    if ($hash -and (Get-FileHash -LiteralPath $parcial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw "Hash divergente: $nome" }
    Move-Item -LiteralPath $parcial -Destination $arquivo -Force
  }
  $origem += @{ arquivo = $nome; bytes = (Get-Item -LiteralPath $arquivo).Length; sha256 = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash.ToLowerInvariant() }
  Write-Output "Verificado $nome"
}
@{ repositorio = $repo; revisao = $revisao; arquivos = $origem } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destino 'ORIGEM.json') -Encoding utf8
foreach ($licenca in @('LICENSE-MIT-Whisper', 'LICENSE-APACHE-2.0')) {
  $fonteLicenca = Join-Path $PSScriptRoot ("../modelos/whisper-base/" + $licenca)
  $alvoLicenca = Join-Path $destino $licenca
  if ((Test-Path -LiteralPath $fonteLicenca) -and [IO.Path]::GetFullPath($fonteLicenca) -ne [IO.Path]::GetFullPath($alvoLicenca)) { Copy-Item -LiteralPath $fonteLicenca -Destination $alvoLicenca -Force }
}
Write-Output "Whisper $Modelo instalado. Recarregue a extensão e reabra o painel."
