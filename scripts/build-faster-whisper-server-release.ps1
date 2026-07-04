param(
  [string]$OutputDirectory = "."
)

$ErrorActionPreference = "Stop"

$root       = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverRoot = Join-Path $root "tools\faster-whisper-server"
$zipName    = "faster-whisper-server.zip"
$outputRoot = Resolve-Path $OutputDirectory
$zipPath    = Join-Path $outputRoot $zipName

$files = @(
  "server.py",
  "requirements.txt",
  "README.md"
)

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $files) {
    $sourcePath = Join-Path $serverRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Release file is missing: $relativePath"
    }

    # 展開すると faster-whisper-server フォルダが出るようにする
    $entryName = "faster-whisper-server/$relativePath"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sourcePath, $entryName) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
