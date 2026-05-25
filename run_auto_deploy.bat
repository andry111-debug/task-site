@echo off
chcp 65001 >nul
setlocal
set "PYTHONUTF8=1"
py -3 pycharm_auto_deploy_supabase.py
if errorlevel 1 (
  echo.
  echo Не удалось запустить через py -3. Пробую python...
  python pycharm_auto_deploy_supabase.py
)
pause
