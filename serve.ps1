$root = $PSScriptRoot
$port = 18080
$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $port)
$listener = New-Object System.Net.Sockets.TcpListener $endpoint
$listener.Start()
Write-Output "SERVING http://127.0.0.1:$port/"
function Get-ContentType($ext) {
  switch ($ext) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    default { "application/octet-stream" }
  }
}
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { $client.Close(); continue }
    while ($true) {
      $h = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($h)) { break }
    }
    $parts = $requestLine.Split(" ")
    $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
    $path = [Uri]::UnescapeDataString(($rawPath.Split("?")[0]))
    if ($path -eq "/") { $path = "/index.html" }
    $full = Join-Path $root ($path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar))
    $fullResolved = [IO.Path]::GetFullPath($full)
    $rootResolved = [IO.Path]::GetFullPath($root)
    if (-not $fullResolved.StartsWith($rootResolved)) {
      $body = [Text.Encoding]::UTF8.GetBytes("Forbidden")
      $resp = "HTTP/1.1 403 Forbidden`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $bytes = [Text.Encoding]::ASCII.GetBytes($resp) + $body
      $stream.Write($bytes, 0, $bytes.Length)
    } elseif (Test-Path $fullResolved -PathType Leaf) {
      $fileBytes = [IO.File]::ReadAllBytes($fullResolved)
      $ctype = Get-ContentType ([IO.Path]::GetExtension($fullResolved).ToLower())
      $header = "HTTP/1.1 200 OK`r`nContent-Type: $ctype`r`nContent-Length: $($fileBytes.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
      $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($fileBytes, 0, $fileBytes.Length)
    } else {
      $body = [Text.Encoding]::UTF8.GetBytes("Not Found")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $bytes = [Text.Encoding]::ASCII.GetBytes($header) + $body
      $stream.Write($bytes, 0, $bytes.Length)
    }
    $stream.Flush()
  } catch {
    # ignore broken connections
  } finally {
    $client.Close()
  }
}
