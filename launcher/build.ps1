# Builds 2DPIT.exe (a launcher for the Electron app) and drops it on the Desktop.
# Usage:  powershell -ExecutionPolicy Bypass -File launcher\build.ps1 [-OutDir <folder>]
param(
    [string]$OutDir = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe not found at $csc" }

$buildDir = Join-Path $projectRoot 'launcher\build'
New-Item -ItemType Directory -Force $buildDir | Out-Null

# --- Icon: draw the placeholder hero with System.Drawing and save as .ico ---
Add-Type -AssemblyName System.Drawing
$icoPath = Join-Path $buildDir '2DPIT.ico'
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(255, 43, 58, 46))

$body   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 74, 144, 226))
$skin   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 208, 169))
$blade  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 223, 230, 238))
$gold   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 201, 162, 39))
$grip   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 91, 58, 30))
$dark   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 34, 34))

# Body + head
$g.FillRectangle($body, 72, 110, 96, 120)
$g.FillEllipse($skin, 84, 40, 72, 72)
$g.FillEllipse($dark, 128, 66, 10, 10)
# Sword (rotated slightly)
$g.TranslateTransform(190, 150)
$g.RotateTransform(25)
$g.FillRectangle($blade, -8, -120, 16, 110)
$g.FillRectangle($gold, -24, -14, 48, 12)
$g.FillRectangle($grip, -7, -2, 14, 34)
$g.FillEllipse($gold, -10, 30, 20, 20)
$g.ResetTransform()
$g.Dispose()

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Open($icoPath, 'Create')
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()

# --- Compile ---
$src = Get-Content (Join-Path $PSScriptRoot 'Launcher.cs') -Raw
$src = $src.Replace('__PROJECT_ROOT__', $projectRoot)
$genCs = Join-Path $buildDir 'Launcher.generated.cs'
Set-Content -Path $genCs -Value $src -Encoding UTF8

$outExe = Join-Path $OutDir '2DPIT.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$outExe" "/win32icon:$icoPath" /r:System.Windows.Forms.dll $genCs
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

Write-Host "Built $outExe (launches $projectRoot)"
