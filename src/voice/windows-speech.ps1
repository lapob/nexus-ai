<#
@module voice/windows-speech
@description Adapter Windows per cattura audio e trascrizione locale.
#>
param(
    [ValidatePattern('^[a-z]{2}-[A-Z]{2}$')]
    [string]$Language = 'it-IT',
    [ValidateRange(2, 30)]
    [int]$TimeoutSeconds = 15
)

$ErrorActionPreference = 'Stop'
$recognizer = $null

try {
    Add-Type -AssemblyName System.Speech
    $culture = [Globalization.CultureInfo]::GetCultureInfo($Language)
    $installed = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
    $selected = $installed | Where-Object { $_.Culture.Name -eq $Language } | Select-Object -First 1
    if ($null -eq $selected) {
        $available = ($installed | ForEach-Object { $_.Culture.Name }) -join ', '
        throw "Pacchetto di riconoscimento vocale $Language non installato. Lingue disponibili: $available"
    }
    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($culture)
    $recognizer.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    $recognizer.SetInputToDefaultAudioDevice()
    $result = $recognizer.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))

    if ($null -eq $result) {
        [pscustomobject]@{
            ok = $true
            text = ''
            confidence = 0
            language = $Language
            backend = 'windows-sapi'
        } | ConvertTo-Json -Compress
    }
    else {
        [pscustomobject]@{
            ok = $true
            text = [string]$result.Text
            confidence = [double]$result.Confidence
            language = $Language
            backend = 'windows-sapi'
        } | ConvertTo-Json -Compress
    }
}
catch {
    [pscustomobject]@{
        ok = $false
        error = $_.Exception.Message
        language = $Language
        backend = 'windows-sapi'
    } | ConvertTo-Json -Compress
    exit 1
}
finally {
    if ($null -ne $recognizer) {
        $recognizer.Dispose()
    }
}
