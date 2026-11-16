@echo off
node "%~dp0backend\scripts\housing-sync\cli.cjs" %*
exit /b %errorlevel%
