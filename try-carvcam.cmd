@echo off
rem CarvCAM: instala (so na primeira vez), gera a versao final e abre no navegador.
rem Uso: clique duas vezes neste arquivo (precisa do Node.js 18 ou mais novo).
rem      try-carvcam.cmd --dev   (modo desenvolvimento)
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)

for %%D in (cam-engine gsender-ui) do (
  if not exist "%%D\node_modules" (
    echo ==^> Instalando dependencias de %%D ^(so na primeira vez^)...
    pushd %%D
    call npm install --no-audit --no-fund || (popd & pause & exit /b 1)
    popd
  )
)

cd gsender-ui
if "%~1"=="--dev" (
  echo ==^> Modo desenvolvimento em http://localhost:5173
  call npx vite --open
) else (
  echo ==^> Gerando a versao final e abrindo em http://localhost:4173
  echo     Depois da primeira abertura, o CarvCAM tambem abre sem internet nesse endereco.
  call npm run local
)
pause
