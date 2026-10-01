# Publica el proyecto de cuestionarios en GitHub y activa GitHub Pages
# Uso: doble clic en publicar.bat (o ejecutar este script)
#
# Sube index.html, css/ y js/ al repositorio y deja la pagina en
# https://<usuario>.github.io/cuestionarios/
$ErrorActionPreference = "Continue"

function Resolve-Gh {
  $cmd = Get-Command gh.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @("C:\Program Files\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")) {
    if (Test-Path $p) { return $p }
  }
  Write-Host "No se encontro GitHub CLI (gh)." -ForegroundColor Red
  exit 1
}
$gh = Resolve-Gh

& $gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Todavia no has iniciado sesion en GitHub." -ForegroundColor Yellow
  Write-Host "Abre una ventana de PowerShell y ejecuta una sola vez:" -ForegroundColor Yellow
  Write-Host "    gh auth login" -ForegroundColor Cyan
  exit 1
}

$user = (& $gh api user --jq ".login").Trim()
$repo = "cuestionarios"
$raiz = $PSScriptRoot

$archivos = @("index.html", "README.md", "css/estilos.css", "js/parser.js", "js/store.js", "js/app.js")
$faltan = @()
foreach ($a in $archivos) {
  if (-not (Test-Path (Join-Path $raiz $a))) { $faltan += $a }
}
if ($faltan.Count) {
  Write-Host "Faltan archivos: $($faltan -join ', ')" -ForegroundColor Red
  exit 1
}

# 1. Crear el repositorio si no existe
& $gh repo view "$user/$repo" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creando repositorio $user/$repo ..."
  $tmpRepo = New-TemporaryFile
  @{ name = $repo; description = "Cuestionarios de opcion multiple por materia y unidad"; private = $false } |
    ConvertTo-Json | Set-Content -Path $tmpRepo -Encoding ascii
  & $gh api -X POST /user/repos --input "$tmpRepo" *> $null
  Remove-Item $tmpRepo -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { Write-Host "No pude crear el repositorio (verifica que el nombre no este en uso)." -ForegroundColor Red; exit 1 }
}

# 1b. GitHub Pages gratis solo funciona en repositorios publicos
$tmpVis = New-TemporaryFile
Set-Content -Path $tmpVis -Value '{"private":false}' -Encoding ascii
& $gh api -X PATCH "/repos/$user/$repo" --input "$tmpVis" *> $null
Remove-Item $tmpVis -ErrorAction SilentlyContinue

$branch = (& $gh api "/repos/$user/$repo" --jq ".default_branch").Trim()

# 2. Subir / actualizar cada archivo
foreach ($rel in $archivos) {
  $ruta = Join-Path $raiz $rel
  $apiRel = [uri]::EscapeDataString($rel).Replace("%2F", "/")
  Write-Host "Subiendo $rel ..."

  $content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ruta))
  $sha = (& $gh api "/repos/$user/$repo/contents/$apiRel" --jq ".sha") 2> $null
  if ($LASTEXITCODE -ne 0) { $sha = "" }

  $tmp = New-TemporaryFile
  if ($sha) {
    @{ message = "Actualizar $rel"; content = $content; sha = $sha.Trim() } |
      ConvertTo-Json | Set-Content -Path $tmp -Encoding ascii
  } else {
    @{ message = "Agregar $rel"; content = $content } |
      ConvertTo-Json | Set-Content -Path $tmp -Encoding ascii
  }
  & $gh api -X PUT "/repos/$user/$repo/contents/$apiRel" --input "$tmp" *> $null
  Remove-Item $tmp -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { Write-Host "Error al subir $rel." -ForegroundColor Red; exit 1 }
}

# 3. Activar GitHub Pages si hace falta
$url = "https://$user.github.io/$repo/"
& $gh api "/repos/$user/$repo/pages" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Activando GitHub Pages (solo la primera vez) ..."
  $tmpPages = New-TemporaryFile
  @{ source = @{ branch = $branch; path = "/" } } | ConvertTo-Json | Set-Content -Path $tmpPages -Encoding ascii
  & $gh api -X POST "/repos/$user/$repo/pages" --input "$tmpPages" *> $null
  Remove-Item $tmpPages -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Listo. Tu pagina esta en:" -ForegroundColor Green
Write-Host $url -ForegroundColor White
Write-Host "(La primera publicacion puede tardar 1-2 minutos en estar disponible.)"