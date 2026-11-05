"""Optional macOS local installer. Standard DSH bundle installation needs no script."""

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone

SOURCE = Path(__file__).resolve().parent
MARKER = '# dsh-session-inbox managed section'
END = '# end dsh-session-inbox managed section'
# Exact alternatives match the tested native adapters; future releases stay guarded.
SUPPORTED_DSH = json.loads((SOURCE / 'package.json').read_text(encoding='utf-8'))['engines']['dsh']


def supports_dsh(version: str) -> bool:
    return version.strip().split('+', 1)[0] in {item.strip() for item in SUPPORTED_DSH.split('||')}


def replace_managed_section(text: str, section: str) -> str:
    """Replace only our own block, preserving every unrelated profile edit."""
    if text.count(MARKER) != text.count(END) or text.count(MARKER) > 1:
        raise ValueError('Ambiguous workbench configuration; no profile changes made.')
    if MARKER not in text:
        return text.rstrip() + ('\n\n' + section if section else '\n')
    start = text.index(MARKER)
    finish = text.index(END, start) + len(END)
    return text[:start].rstrip() + '\n' + section + text[finish:].lstrip('\n')


def write_patch(path: Path, text: str) -> None:
    """Validate before an atomic replacement; a failed validation keeps the old file."""
    parsed = subprocess.run(['ruby', '-ryaml', '-e', 'YAML.safe_load(STDIN.read, aliases:true)'],
                            input=text, text=True, capture_output=True)
    if parsed.returncode:
        raise ValueError('Profile YAML validation failed. Original profile preserved.')
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                     prefix='.session-inbox-', delete=False) as temporary:
        temporary.write(text)
        temporary_path = Path(temporary.name)
    temporary_path.chmod(0o600)
    temporary_path.replace(path)


def install(profile: Path, app: Path) -> None:
    executable = app / 'Contents/MacOS/DeepSeek Harness'
    asar_manifest = app / 'Contents/Resources/app.asar/package.json'
    script = 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)'
    result = subprocess.run([str(executable), '-e', script, str(asar_manifest)],
                            env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'},
                            check=True, capture_output=True, text=True)
    if not supports_dsh(result.stdout):
        raise ValueError(f'This build requires DSH {SUPPORTED_DSH}; no changes made.')
    patch = profile / 'cordis.patch.yml'
    original = patch.read_text() if patch.exists() else ''
    package = json.loads((profile / 'package.json').read_text())
    if 'dsh-session-inbox' in package.get('dsh', {}).get('profile', {}).get('bundles', []):
        raise ValueError('Already installed as a DSH bundle. Manage it through DSH instead.')
    section = (f'{MARKER}\n- id: ui-workspace\n  disabled: true\n- insert:\n'
               '    - id: session-inbox-local\n      name: ./local-plugins/dsh-session-inbox/lib/index.js\n'
               f'{END}\n')
    candidate = replace_managed_section(original, section)
    backup = profile / 'backups/dsh-session-inbox' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup.mkdir(parents=True, mode=0o700)
    (backup / 'cordis.patch.yml').write_text(original)
    (backup / 'cordis.patch.yml').chmod(0o600)
    destination = profile / 'local-plugins/dsh-session-inbox'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ['package.json', 'README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'cordis.patch.yml']:
        shutil.copy2(SOURCE / name, destination / name)
    for name in ['lib', 'locale', 'assets', 'vendor']:
        shutil.copytree(SOURCE / name, destination / name, dirs_exist_ok=True)
    write_patch(patch, candidate)
    print(f'Installed: {destination}\nProfile backup: {backup}\nChat logs were not opened or modified.')


def uninstall(profile: Path) -> None:
    patch = profile / 'cordis.patch.yml'
    if not patch.exists() or MARKER not in patch.read_text():
        print('No local override found. Bundles must be removed through DSH plugin management.')
        return
    write_patch(patch, replace_managed_section(patch.read_text(), ''))
    print('Original DSH UI restored. Chat records and workbench metadata retained.')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--profile', default='desktop')
    parser.add_argument('--dsh-home', type=Path, default=Path(os.environ.get('DSH_HOME', Path.home() / '.dsh')))
    parser.add_argument('--app', type=Path, default=Path('/Applications/DeepSeek Harness.app'))
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', args.profile):
        parser.error('Use a profile name containing only letters, digits, underscores, and hyphens.')
    profile = args.dsh_home.expanduser().resolve() / 'profiles' / args.profile
    try:
        uninstall(profile) if args.uninstall else install(profile, args.app.expanduser())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error


if __name__ == '__main__':
    main()
