$ErrorActionPreference = "Stop"
$Project = "russian-regions-puzzle"
Set-Location $PSScriptRoot

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js/npm не найден. Установите актуальную LTS-версию Node.js и повторите запуск."
}

Write-Step "Вход в Firebase"
& npx --yes firebase-tools@latest login
if ($LASTEXITCODE -ne 0) { throw "Не удалось выполнить вход в Firebase." }

Write-Step "Развёртывание правил Realtime Database и Cloud Storage"
& npx --yes firebase-tools@latest deploy --project $Project --config firebase/firebase.json --only database,storage
if ($LASTEXITCODE -ne 0) { throw "Развёртывание Firebase Rules завершилось с ошибкой." }

Write-Host "`nПравила Firebase развернуты." -ForegroundColor Green
Write-Host "Проверьте, что Anonymous и Email/Password включены в Firebase Authentication." -ForegroundColor Yellow
Write-Host "Создайте преподавателя omnistat@yandex.ru. Authorized domains для этих двух способов входа не требуется." -ForegroundColor Yellow

$OpenConsole = Read-Host "Открыть нужные страницы Firebase Console сейчас? [Y/n]"
if ([string]::IsNullOrWhiteSpace($OpenConsole) -or $OpenConsole -match '^[YyДд]') {
    Start-Process "https://console.firebase.google.com/project/$Project/authentication/providers"
    Start-Sleep -Milliseconds 500
    Start-Process "https://console.firebase.google.com/project/$Project/authentication/settings"
}
