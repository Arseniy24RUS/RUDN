$ErrorActionPreference = "Stop"

$RepoSlug = "Arseniy24RUS/RUDN"
$RepoUrl = "https://github.com/$RepoSlug.git"
$PagesUrl = "https://arseniy24rus.github.io/RUDN/"

Set-Location $PSScriptRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Git([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) {
    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Команда git завершилась с кодом $LASTEXITCODE: git $($Arguments -join ' ')"
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git не найден. Установите Git for Windows или GitHub Desktop, затем повторно запустите этот файл."
}

Write-Step "Подготовка локального репозитория"
if (-not (Test-Path ".git")) {
    Invoke-Git init -b main
}

$originExists = $false
& git remote get-url origin *> $null
if ($LASTEXITCODE -eq 0) { $originExists = $true }
if ($originExists) {
    Invoke-Git remote set-url origin $RepoUrl
} else {
    Invoke-Git remote add origin $RepoUrl
}

# Не блокируем первую публикацию из-за отсутствующего глобального Git-профиля.
& git config user.name *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-Git config user.name "Arseniy Sitkovskiy"
}
& git config user.email *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-Git config user.email "224411278+Arseniy24RUS@users.noreply.github.com"
}

Write-Step "Проверка обязательных файлов"
$Required = @(
    "site/index.html",
    "site/assets/js/main.js",
    "site/data/questions.json",
    "site/apps/puzzle.html",
    ".github/workflows/deploy-pages.yml"
)
foreach ($Path in $Required) {
    if (-not (Test-Path $Path)) {
        throw "Не найден обязательный файл: $Path"
    }
}

Write-Step "Создание коммита"
Invoke-Git add -A
$Pending = & git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить состояние Git." }
if ($Pending) {
    Invoke-Git commit -m "Deploy RUDN learning platform to GitHub Pages"
} else {
    Write-Host "Новых изменений для коммита нет." -ForegroundColor DarkGray
}
Invoke-Git branch -M main

Write-Step "Отправка файлов в $RepoSlug"
Invoke-Git push -u origin main

$Gh = Get-Command gh -ErrorAction SilentlyContinue
if ($Gh) {
    Write-Step "Автоматическое включение GitHub Pages"
    & gh auth status *> $null
    if ($LASTEXITCODE -eq 0) {
        & gh api "repos/$RepoSlug/pages" *> $null
        if ($LASTEXITCODE -ne 0) {
            & gh api --method POST "repos/$RepoSlug/pages" -f build_type=workflow
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Файлы загружены, но GitHub Pages не удалось включить через API. Откройте Settings -> Pages и выберите GitHub Actions."
            }
        } else {
            & gh api --method PUT "repos/$RepoSlug/pages" -f build_type=workflow *> $null
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Не удалось переключить существующий Pages-сайт на GitHub Actions. Проверьте Settings -> Pages."
            }
        }

        # Push уже запускает workflow. Команда ниже нужна лишь для репозитория, где Pages
        # включился после push и первый запуск был пропущен/остановлен.
        Start-Sleep -Seconds 3
        $RunId = & gh run list --repo $RepoSlug --workflow deploy-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null
        if ($LASTEXITCODE -eq 0 -and $RunId) {
            Write-Host "GitHub Actions run: $RunId" -ForegroundColor DarkGray
            Write-Host "Наблюдение за публикацией: gh run watch $RunId --repo $RepoSlug" -ForegroundColor DarkGray
        } else {
            & gh workflow run deploy-pages.yml --repo $RepoSlug 2>$null
        }
    } else {
        Write-Warning "GitHub CLI найден, но вход не выполнен. Команда: gh auth login"
        Write-Warning "Файлы уже отправлены. Включите Pages вручную: Settings -> Pages -> Source -> GitHub Actions."
    }
} else {
    Write-Warning "GitHub CLI не найден. Файлы уже отправлены; осталось один раз включить Pages: Settings -> Pages -> Source -> GitHub Actions."
}

Write-Host "`nПубликация репозитория завершена." -ForegroundColor Green
Write-Host "После успешного workflow сайт будет доступен: $PagesUrl" -ForegroundColor Green
Write-Host "Для общего журнала и live-квиза затем выполните настройку Firebase из DEPLOYMENT.md." -ForegroundColor Yellow
