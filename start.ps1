#Requires -Version 5.1
# Build, migrate, and start the f95bot stack (Windows PowerShell; no WSL).
# Usage: .\start.ps1 --profile=bot|web|both
#   bot   - mysql, redis, Discord bot
#   web   - mysql, redis, web app
#   both  - mysql, redis, bot, and web

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
Set-Location -LiteralPath $PSScriptRoot

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path -ErrorAction Stop | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { return }
        if ($line -notmatch '^(?:export\s+)?([^=]+)=(.*)$') { return }
        $name = $matches[1].Trim()
        $val = $matches[2]
        if ($name -eq '') { return }
        if ($val.Length -ge 2) {
            $c0, $c1 = $val[0], $val[$val.Length - 1]
            if ((($c0 -eq [char]'"' -or $c0 -eq [char]"'") -and $c0 -eq $c1)) {
                $val = $val.Substring(1, $val.Length - 2)
            }
        }
        [Environment]::SetEnvironmentVariable($name, $val, 'Process')
    }
}

function usage {
    $name = Split-Path -Leaf $PSCommandPath
    [Console]::Error.WriteLine("Usage: $name --profile=bot|web|both")
    [Console]::Error.WriteLine("  bot   - mysql, redis, Discord bot")
    [Console]::Error.WriteLine("  web   - mysql, redis, web app")
    [Console]::Error.WriteLine("  both  - mysql, redis, bot, and web")
}

# Prefer `docker compose` (v2). Fall back to `docker-compose` (v1) if the plugin is missing.
function Get-DockerComposeMode {
    $null = & docker compose version 2>&1
    if ($LASTEXITCODE -eq 0) { return 'v2' }
    if (Get-Command -Name 'docker-compose' -ErrorAction SilentlyContinue) { return 'v1' }
    throw "Neither 'docker compose' nor 'docker-compose' is available. Install Docker Desktop or docker-compose v1."
}

function Invoke-DockerCompose {
    param(
        [Parameter(Mandatory)]
        [string[]] $ComposeArgs
    )
    if (-not (Get-Command -Name 'docker' -ErrorAction SilentlyContinue)) { throw "docker not found in PATH" }
    $mode = Get-DockerComposeMode
    if ($mode -eq 'v2') { & docker compose @ComposeArgs }
    else { & docker-compose @ComposeArgs }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-ComposeRunBotKnex {
    if (-not (Get-Command -Name 'docker' -ErrorAction SilentlyContinue)) { throw "docker not found in PATH" }
    # --build so we use migrations from current Dockerfile/context, not a stale f95bot-app:latest image.
    $mode = Get-DockerComposeMode
    if ($mode -eq 'v2') {
        & docker compose run --build --rm --no-deps bot sh -c "npx knex migrate:latest"
    }
    else {
        & docker-compose run --build --rm --no-deps bot sh -c "npx knex migrate:latest"
    }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Import-DotEnv (Join-Path $PSScriptRoot '.env')

$rootPassword = if ($env:MYSQL_ROOT_PASSWORD) { $env:MYSQL_ROOT_PASSWORD } else { 'root' }
$script:RootPassword = $rootPassword
$script:MySqlContainer = 'f95bot-mysql'
$script:WaitSecs = 60
if ($env:START_MYSQL_WAIT_SECS) {
    $w = 0
    if ([int]::TryParse($env:START_MYSQL_WAIT_SECS, [ref]$w) -and $w -gt 0) { $script:WaitSecs = $w }
}

$Profile = $null
$i = 0
# Force array: a single unbound arg can be a [string] (no .Count under StrictMode).
$argv = @($args)
while ($i -lt $argv.Count) {
    $a = $argv[$i]
    if ($a -like '--profile=*') {
        $Profile = $a.Substring(10)
        $i++
    }
    elseif ($a -eq '--profile') {
        $i++
        if ($i -ge $argv.Count) {
            [Console]::Error.WriteLine('Error: --profile requires a value (bot, web, or both).')
            exit 1
        }
        $Profile = $argv[$i]
        $i++
    }
    elseif ($a -in '-h', '--help') { usage; exit 0 }
    else {
        [Console]::Error.WriteLine("Unknown option: $a")
        usage
        exit 1
    }
}

if ([string]::IsNullOrEmpty($Profile)) {
    [Console]::Error.WriteLine('Error: --profile=bot, --profile=web, or --profile=both is required.')
    usage
    exit 1
}

if ($Profile -notin 'bot', 'web', 'both') {
    [Console]::Error.WriteLine("Error: invalid --profile: $Profile (use bot, web, or both)")
    exit 1
}

function wait_for_mysql {
    $i = 0
    Write-Host "Waiting for MySQL in $script:MySqlContainer (up to ${script:WaitSecs}s)..."
    while ($i -lt $script:WaitSecs) {
        $null = & docker exec $script:MySqlContainer mysqladmin ping -h 127.0.0.1 -uroot ("-p$script:RootPassword") --silent 2>&1
        if ($LASTEXITCODE -eq 0) { Write-Host 'MySQL is ready.'; return }
        $i++
        Start-Sleep -Seconds 1
    }
    [Console]::Error.WriteLine("Error: MySQL did not become ready in ${script:WaitSecs}s.")
    exit 1
}

Invoke-DockerCompose -ComposeArgs @('up', '-d', 'mysql', 'redis')
wait_for_mysql

Write-Host 'Running database migrations (knex migrate:latest)...'
Invoke-ComposeRunBotKnex

if ($Profile -in 'web', 'both') {
    $null = & docker network inspect 'traefik-network' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Creating external network traefik-network (required for web)...'
        & docker network create 'traefik-network'
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

switch ($Profile) {
    'bot' {
        Write-Host 'Starting bot (build + up)...'
        Invoke-DockerCompose -ComposeArgs @('up', '-d', '--build', 'mysql', 'redis', 'bot')
    }
    'web' {
        Write-Host 'Starting web (build + up)...'
        Invoke-DockerCompose -ComposeArgs @('--profile', 'web', 'up', '-d', '--build', 'mysql', 'redis', 'web')
    }
    'both' {
        Write-Host 'Starting bot and web (build + up)...'
        Invoke-DockerCompose -ComposeArgs @('--profile', 'web', 'up', '-d', '--build', 'mysql', 'redis', 'bot', 'web')
    }
}

Write-Host "Done. Profile: $Profile"
