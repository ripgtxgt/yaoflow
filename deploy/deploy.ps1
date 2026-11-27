<#
.SYNOPSIS
  YaoFlow 一键部署（Windows PowerShell 5.1 / 7 都能跑）。

.DESCRIPTION
  做的事和 Claude 平时的部署完全一样：
    1. 把仓库里的源码打包（apps/web/src、test、配置；packages；scripts；package.json / lock）
       —— 不含 node_modules、.next、.env.local、.data
    2. scp 到日本服务器 /tmp
    3. 服务器上：解压覆盖 ~/yaoflow → npm install（有新依赖才真装）→ vitest 全量 → next build → systemctl restart yaoflow → 打 /api/health
  测试或构建失败会停下来，不会重启线上。

.USAGE
  在 PowerShell 里：
    powershell -ExecutionPolicy Bypass -File H:\yaoflow\deploy\deploy.ps1
  可选参数：
    -SkipTests    不跑测试（赶时间才用）
    -NoRestart    只上传 + 构建，不重启（想自己挑时间重启）
  第一次跑会把 deploy\keys\jpp.pem 复制到 %USERPROFILE%\.ssh\yaoflow-jpp.pem 并收紧权限
  （Windows 的 OpenSSH 会拒绝"权限太开放"的私钥，H: 盘上的那份直接用会报错）。

.NOTES
  服务器：ubuntu@54.168.121.93（09-17 起的新公网 IP；密钥不变），代码在 ~/yaoflow，服务名 yaoflow（端口 3200），数据在 ~/yaoflow-data。
  .env.local 只在服务器上，脚本不会碰它。
#>
[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$server = "ubuntu@54.168.121.93"   # 2026-09-17 换 IP（实例没绑弹性 IP，停机再开会再变）
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # 仓库根目录（脚本在 deploy\ 下）

function Step($msg) { Write-Host ""; Write-Host ("== " + $msg) -ForegroundColor Cyan }
function Fail($msg) { Write-Host ("!! " + $msg) -ForegroundColor Red; exit 1 }

# ---- 0. 工具检查 ----
foreach ($tool in @("ssh", "scp", "tar")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "找不到 $tool（Windows 10/11 自带 OpenSSH 与 tar；设置 → 可选功能 → OpenSSH 客户端）" }
}

# ---- 1. 私钥：放到用户目录并收紧权限 ----
$keySrc = Join-Path $root "deploy\keys\jpp.pem"
if (-not (Test-Path $keySrc)) { Fail "没有 $keySrc" }
$sshDir = Join-Path $env:USERPROFILE ".ssh"
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
$key = Join-Path $sshDir "yaoflow-jpp.pem"
if (-not (Test-Path $key)) {
  Copy-Item $keySrc $key
  & icacls $key /inheritance:r /grant:r "$($env:USERNAME):(R)" | Out-Null
  Write-Host "私钥已复制到 $key 并收紧权限"
}
$sshOpts = @("-i", $key, "-o", "StrictHostKeyChecking=accept-new", "-o", "LogLevel=ERROR")

# ---- 2. 打包 ----
Step "打包源码"
Push-Location $root
try {
  $commit = (& git rev-parse --short HEAD 2>$null)
  if ($commit) { Write-Host "当前提交 $commit" }
  $dirty = (& git status --short 2>$null)
  if ($dirty) { Write-Host "注意：有未提交的改动（照样会部署）：" -ForegroundColor Yellow; $dirty | ForEach-Object { Write-Host "   $_" } }

  $paths = @(
    "apps/web/src", "apps/web/test", "apps/web/public",
    "apps/web/package.json", "apps/web/next.config.mjs", "apps/web/postcss.config.mjs",
    "apps/web/tsconfig.json", "apps/web/vitest.config.ts", "apps/web/next-env.d.ts", "apps/web/.env.example",
    "packages", "scripts", "package.json", "package-lock.json"
  ) | Where-Object { Test-Path $_ }

  $tgz = Join-Path $env:TEMP "yaoflow-deploy.tgz"
  if (Test-Path $tgz) { Remove-Item $tgz }
  & tar -czf $tgz --exclude=node_modules --exclude=.next --exclude=.env.local --exclude=.data --exclude=__pycache__ @paths
  if ($LASTEXITCODE -ne 0) { Fail "tar 打包失败" }
  $mb = [math]::Round((Get-Item $tgz).Length / 1MB, 1)
  Write-Host "已打包 $tgz（$mb MB）"
} finally { Pop-Location }

# ---- 3. 上传 ----
Step "上传到服务器"
& scp @sshOpts $tgz "${server}:/tmp/yaoflow-deploy.tgz"
if ($LASTEXITCODE -ne 0) { Fail "scp 失败" }

# ---- 4. 服务器上：解压 → 依赖 → 测试 → 构建 → 重启 → 健康检查 ----
Step "服务器：解压、测试、构建（构建约 4 分钟，请等）"
$remote = @'
set -eo pipefail
cd ~/yaoflow
tar xzf /tmp/yaoflow-deploy.tgz && rm -f /tmp/yaoflow-deploy.tgz
echo "-- npm install"
npm install --no-audit --no-fund --prefer-offline > /tmp/deploy-npm.log 2>&1 || { tail -20 /tmp/deploy-npm.log; exit 1; }
if [ "$SKIP_TESTS" != "1" ]; then
  echo "-- vitest"
  (cd apps/web && npx vitest run 2>&1 | tail -40)
fi
echo "-- next build"
npm run build -w web 2>&1 | tail -15
if [ "$NO_RESTART" = "1" ]; then
  echo "-- built, NOT restarted (as requested)"
else
  echo "-- restart"
  sudo systemctl restart yaoflow
  sleep 5
  curl -s -o /dev/null -w "health %{http_code}\n" https://yaoflow.com/api/health
  systemctl is-active yaoflow
fi
# eof -- keep this comment last: PowerShell appends "\r\n" when piping, and "fi\r" would not close the if
'@
# 去掉所有 \r（git autocrlf 可能把本文件换成 CRLF；bash 见到 \r 会整段语法错误）。
# 末尾不要再加换行：PowerShell 往管道写字符串时自己会补 "\r\n"，那个 \r 必须落在最后那行注释上，
# 否则会变成单独一行 "\r"，bash 报 "$'\r': command not found"，明明部署成功却判失败（09-12 踩过）
$remote = $remote -replace "`r", ""
# 注意：PowerShell 变量名不分大小写，这两个不能叫 $skipTests / $noRestart（会撞上开关参数本身）
$skipFlag = if ($SkipTests) { "1" } else { "0" }
$restartFlag = if ($NoRestart) { "1" } else { "0" }
$remote | & ssh @sshOpts $server "SKIP_TESTS=$skipFlag NO_RESTART=$restartFlag bash -s"
if ($LASTEXITCODE -ne 0) { Fail "服务器端失败（看上面的输出；线上服务没有被重启。测试挂了就修代码重跑；构建挂了也要修好重跑，因为 .next 已被改写，下次重启前必须有一次成功构建）" }

Step "完成"
Write-Host "别忘了提交：git add -A; git commit -m '...'" -ForegroundColor Green
