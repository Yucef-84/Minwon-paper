param([string]$Output = "Minwon-paper.zip")
$ErrorActionPreference = "Stop"
$files = @(
  "README.md", "THIRD_PARTY_NOTICES.md", "app.js", "build-info.json",
  "hwpx-template-data.js", "index.html", "styles.css", "vendor/jszip.min.js"
) | Sort-Object
$root = (Get-Location).Path
$outPath = [IO.Path]::GetFullPath((Join-Path $root $Output))
if (Test-Path -LiteralPath $outPath) { Remove-Item -LiteralPath $outPath -Force }
$stream = [IO.File]::Open($outPath, [IO.FileMode]::CreateNew)
$zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($path in $files) {
    $full = Join-Path $root $path
    if (!(Test-Path -LiteralPath $full)) { throw "Missing package file: $path" }
    $entry = $zip.CreateEntry($path, [IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [DateTimeOffset]::new([DateTime]::SpecifyKind([DateTime]::new(1980,1,1), [DateTimeKind]::Utc))
    $input = [IO.File]::OpenRead($full)
    $outputStream = $entry.Open()
    try { $input.CopyTo($outputStream) } finally { $outputStream.Dispose(); $input.Dispose() }
  }
} finally { $zip.Dispose(); $stream.Dispose() }
Write-Output $outPath
