#!/bin/zsh
set -eu
cd "$(dirname "$0")"
python3 install.py --uninstall
printf '\n已恢复官方模块。聊天和整理标记均保留。\n'
