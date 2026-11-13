param([string]$Destino = (Join-Path $env:TEMP 'libras-asr-070'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $Destino -Force | Out-Null
$frases = @('Olá, tudo bem?', 'Como você está?', 'Onde é?', 'Qual seu nome?', 'Quem é você?', 'Quero te conhecer.', 'Eu não quero cancelar a reunião de amanhã.', 'Gabriel, você pode repetir o que acabou de falar?')
$sintese = New-Object System.Speech.Synthesis.SpeechSynthesizer
$formato = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$amostras = @()
try {
  foreach ($voz in @('Microsoft Maria Desktop', 'Microsoft Daniel')) {
    $sintese.SelectVoice($voz)
    for ($i = 0; $i -lt $frases.Count; $i++) {
      $arquivo = ('fala-{0}-{1}.wav' -f $(if ($voz -like '*Daniel*') { 'masculina' } else { 'feminina' }), $i)
      $sintese.Rate = 0
      $sintese.SetOutputToWaveFile((Join-Path $Destino $arquivo), $formato)
      $sintese.Speak($frases[$i])
      $sintese.SetOutputToNull()
      $amostras += @{ arquivo = $arquivo; texto = $frases[$i]; voz = $voz; origem = 'Sintetizado no Windows, não é gravação humana'; taxa = 16000 }
    }
  }
} finally { $sintese.Dispose() }
$amostras | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $Destino 'manifesto.json') -Encoding utf8
Write-Output ('Preparadas {0} frases em {1}' -f $amostras.Count, $Destino)
