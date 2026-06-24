param(
  [string]$OutputDirectory = "."
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$zipName = "twitch-chat-translator-v$version.zip"
$outputRoot = Resolve-Path $OutputDirectory
$zipPath = Join-Path $outputRoot $zipName

$files = @(
  "manifest.json",
  "background.js",
  "content-chat.js",
  "content-panel.js",
  "content-whisper.js",
  "content.js",
  "auth-callback.js",
  "help.html",
  "options.css",
  "options.html",
  "options.js",
  "offscreen.html",
  "offscreen.js",
  "offscreen-whisper.html",
  "offscreen-whisper.js",
  "whisper-injected.js",
  "whisper-worker.js",
  "LICENSE",
  "README.md",
  "README.en.md",
  "README.ru.md",
  "CHANGELOG.md",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "lib/transformers.min.js",
  "lib/ort-wasm-simd-threaded.jsep.mjs",
  "lib/ort-wasm-simd-threaded.jsep.wasm",
  "lib/ort-wasm-simd.wasm",
  "lib/ort-wasm.wasm",
  "docs/images/clip-subtitle-options.png",
  "docs/images/panel-footer.png",
  "docs/images/panel-header.png",
  "docs/images/panel-usage.png"
)

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $files) {
    $sourcePath = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Release file is missing: $relativePath"
    }

    $entryName = $relativePath.Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sourcePath, $entryName) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

Write-Host "Created $zipPath"
