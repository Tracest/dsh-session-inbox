#!/bin/zsh
set -eu
cd "$(dirname "$0")"
python3 install.py
printf '\n已安装。请在 DSH 任务空闲时正常退出并重新打开。\n'
