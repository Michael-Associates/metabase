# Michael and Associates fork: the checks that can run on our Windows machine before a push, so CI isn't the first
# to find a formatting, lint, type or bracket mistake. CI runs the full set when a pull request is marked ready.
#
#   powershell -File ma\scripts\check-changes.ps1 [-Base origin/ma-main] [-Node <folder with node.exe>]
#
# Checks the files changed since -Base, committed or not:
#   - frontend files: oxfmt (formatting) and oxlint (lint);
#   - Clojure files: brackets balance (CI only compiles them in the uberjar build);
#   - the TypeScript type check of the whole frontend, when at least 12 GB of memory is free (it needs about that).
# Unit tests need the ClojureScript build, which needs Java and the Clojure CLI, so they stay in CI.
#
# Needs `bun install --frozen-lockfile --ignore-scripts` once (esbuild's setup script fails on Windows) and Node
# matching .nvmrc: oxlint's TypeScript config needs Node 22.18 or later.
param(
  [string]$Base = "origin/ma-main",
  [string]$Node = "D:\Data Warehouse\tools\node-v22.23.4-win-x64"
)
# Continue, not Stop: Windows PowerShell turns any native tool's stderr (git's line-ending warnings) into an error,
# and every check below reads its tool's exit code instead.
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
if (Test-Path (Join-Path $Node "node.exe")) { $env:PATH = "$Node;$env:PATH" }
$failed = @()

$changed = @(
  git diff --name-only --diff-filter=ACMR "$Base...HEAD" 2>$null
  git diff --name-only --diff-filter=ACMR 2>$null
  git ls-files --others --exclude-standard 2>$null
) | Where-Object { $_ } | Sort-Object -Unique | Where-Object { Test-Path $_ }
"Changed files: $($changed.Count)"

$frontend = @($changed | Where-Object { $_ -match '^(frontend|enterprise/frontend|e2e)/.*\.(js|jsx|ts|tsx|css)$' })
if ($frontend.Count -gt 0) {
  "Formatting ($($frontend.Count) files)"
  & ".\node_modules\.bin\oxfmt.exe" --check @frontend
  if ($LASTEXITCODE -ne 0) { $failed += "formatting (fix with: node_modules\.bin\oxfmt.exe --write <files>)" }
  $lintable = @($frontend | Where-Object { $_ -notmatch '\.css$' })
  if ($lintable.Count -gt 0) {
    "Lint ($($lintable.Count) files)"
    & ".\node_modules\.bin\oxlint.exe" --disable-nested-config --max-warnings 0 --report-unused-disable-directives @lintable
    if ($LASTEXITCODE -ne 0) { $failed += "lint" }
  }
}

# Brackets in Clojure files, skipping strings, ; comments and \x character literals.
$clojure = @($changed | Where-Object { $_ -match '\.(clj|cljc|cljs|edn)$' })
foreach ($file in $clojure) {
  $text = [IO.File]::ReadAllText((Join-Path $repo $file))
  $stack = New-Object System.Collections.Generic.Stack[object]
  $pairs = @{ ')' = '('; ']' = '['; '}' = '{' }
  $line = 1; $inString = $false; $problem = $null
  for ($i = 0; $i -lt $text.Length -and -not $problem; $i++) {
    $ch = $text[$i]
    if ($ch -eq "`n") { $line++ }
    if ($inString) {
      if ($ch -eq '\') { $i++; if ($i -lt $text.Length -and $text[$i] -eq "`n") { $line++ }; continue }
      if ($ch -eq '"') { $inString = $false }
      continue
    }
    if ($ch -eq ';') { while ($i -lt $text.Length -and $text[$i] -ne "`n") { $i++ }; $line++; continue }
    if ($ch -eq '\') { $i++; continue }
    if ($ch -eq '"') { $inString = $true; continue }
    if ('([{'.Contains($ch)) { $stack.Push(@($ch, $line)) }
    elseif (')]}'.Contains($ch)) {
      if ($stack.Count -eq 0) { $problem = "line ${line}: unexpected '$ch'" }
      else {
        $open = $stack.Pop()
        if ($open[0] -ne $pairs[[string]$ch]) { $problem = "line ${line}: '$ch' closes '$($open[0])' from line $($open[1])" }
      }
    }
  }
  if (-not $problem -and $stack.Count -gt 0) { $open = $stack.Pop(); $problem = "unclosed '$($open[0])' from line $($open[1])" }
  if ($problem) { "Brackets: $file $problem"; $failed += "brackets in $file" }
}
if ($clojure.Count -gt 0) { "Brackets checked in $($clojure.Count) Clojure files" }

$typed = @($frontend | Where-Object { $_ -match '\.(ts|tsx)$' })
if ($typed.Count -gt 0) {
  $freeGb = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
  if ($freeGb -ge 12) {
    "Type check (whole frontend)"
    & node "node_modules/typescript7/bin/tsc" --noEmit
    if ($LASTEXITCODE -ne 0) { $failed += "types" }
  } else {
    "Type check skipped: {0:N1} GB of memory free, it needs about 12. CI will run it." -f $freeGb
  }
}

if ($failed.Count -gt 0) {
  "FAILED: $($failed -join ', ')"
  exit 1
}
"All local checks passed."
