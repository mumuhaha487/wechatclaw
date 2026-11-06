$ErrorActionPreference='Stop'
if(-not $env:CLOUDFLARE_API_TOKEN){
  Add-Type -AssemblyName System.Security
  $file=Join-Path $env:LOCALAPPDATA 'QQClawDev\cloudflare.protected'
  if(-not (Test-Path -LiteralPath $file)){throw 'Configure Cloudflare/R2 environment variables before publishing.'}
  $bytes=[IO.File]::ReadAllBytes($file)
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,[Text.Encoding]::UTF8.GetBytes('QQClaw.Cloudflare/v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $credentials=[Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
  $env:CLOUDFLARE_ACCOUNT_ID=$credentials.account
  $env:CLOUDFLARE_API_TOKEN=$credentials.token
  $env:R2_ACCESS_KEY_ID=$credentials.accessKey
  $env:R2_SECRET_ACCESS_KEY=$credentials.secretKey
}
& node (Join-Path $PSScriptRoot 'publish-cloudflare.mjs') @args
exit $LASTEXITCODE
