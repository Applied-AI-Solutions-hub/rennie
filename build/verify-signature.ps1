param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$ReportPath,
    [string]$ExpectedPublisher = $env:WINDOWS_SIGNING_PUBLISHER
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ExpectedPublisher)) { throw 'Expected publisher is required' }
$file = Get-Item -LiteralPath $Path
$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
if ($signature.Status -ne 'Valid') { throw "Signature rejected: $($file.Name): $($signature.Status)" }
if ($signature.SignatureType -ne 'Authenticode') { throw "An embedded Authenticode signature is required: $($file.Name)" }
if (-not $signature.SignerCertificate -or -not $signature.TimeStamperCertificate) {
    throw "A publisher certificate and trusted timestamp are required: $($file.Name)"
}
$publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
if ($publisher -cne $ExpectedPublisher) { throw "Unexpected publisher on $($file.Name): $publisher" }
$eku = $signature.SignerCertificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' }
if (-not $eku -or '1.3.6.1.5.5.7.3.3' -notin @($eku.EnhancedKeyUsages | ForEach-Object { $_.Value })) {
    throw "Certificate is not authorized for code signing: $($file.Name)"
}
$record = [ordered]@{
    file = $file.Name
    status = $signature.Status.ToString()
    publisher = $publisher
    subject = $signature.SignerCertificate.Subject
    thumbprint = $signature.SignerCertificate.Thumbprint
    timestamp_subject = $signature.TimeStamperCertificate.Subject
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$record | ConvertTo-Json -Compress | Add-Content -LiteralPath $ReportPath -Encoding UTF8
