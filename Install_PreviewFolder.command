#!/bin/bash
# Compiles a local applet using built-in macOS tools. No sudo or downloads.
set -euo pipefail

pf_stage=''
pf_backup=''
pf_target=''

pf_cleanup() {
    if [[ -n "$pf_stage" && -d "$pf_stage" ]]; then
        /bin/rm -rf -- "$pf_stage"
    fi
}

pf_error() {
    local pf_code=$?
    trap - ERR
    printf '\nУстановка не завершена. Код ошибки: %s.\n' "$pf_code" >&2
    printf 'Скопируй сообщение выше или пришли снимок окна.\n' >&2
    if [[ -n "$pf_backup" && -e "$pf_backup" && ! -e "$pf_target" ]]; then
        /bin/mv "$pf_backup" "$pf_target" || true
    fi
    if [[ -t 0 ]]; then read -r -p 'Нажми Enter, чтобы закрыть окно… ' || true; fi
    exit "$pf_code"
}

trap pf_cleanup EXIT
trap pf_error ERR

if [[ "$(/usr/bin/uname -s)" != Darwin ]]; then
    printf 'Этот установщик предназначен для macOS.\n' >&2
    exit 1
fi

pf_base="$(cd -- "$(dirname -- "$0")" && pwd -P)"
if [[ ! -r "$pf_base/source/PreviewFolder.js" || ! -r "$pf_base/source/ConfigureBundle.js" || ! -r "$pf_base/source/StopPrevious.js" || ! -r "$pf_base/source/PreviewFolder.entitlements" ]]; then
    printf 'Сначала распакуй весь ZIP. Файлы из папки source должны быть рядом с установщиком.\n' >&2
    if [[ -t 0 ]]; then read -r -p 'Нажми Enter, чтобы закрыть окно… ' || true; fi
    exit 1
fi

pf_apps="$HOME/Applications"
/bin/mkdir -p "$pf_apps"
pf_target="$pf_apps/Просмотр папки.app"
pf_stage="$(/usr/bin/mktemp -d "$pf_apps/.PreviewFolder-build.XXXXXX")"
pf_built="$pf_stage/Просмотр папки.app"

printf 'Проверяю работу встроенных компонентов macOS…\n'
/usr/bin/osascript -l JavaScript "$pf_base/source/PreviewFolder.js" --check-native "$pf_base/source/PreviewFolder.js"
printf 'Создаю приложение «Просмотр папки» версии 1.3…\n'
/usr/bin/osacompile -l JavaScript -o "$pf_built" "$pf_base/source/PreviewFolder.js"
/usr/bin/osascript -l JavaScript "$pf_base/source/ConfigureBundle.js" "$pf_built"
/usr/bin/plutil -lint "$pf_built/Contents/Info.plist"
# osacompile may have produced a signature. Re-sign after the plist changes.
/usr/bin/codesign --force --sign - --entitlements "$pf_base/source/PreviewFolder.entitlements" "$pf_built"
/usr/bin/codesign --verify --strict "$pf_built"

printf 'Закрываю предыдущий экземпляр запускателя…\n'
/usr/bin/osascript -l JavaScript "$pf_base/source/StopPrevious.js"

if [[ -e "$pf_target" ]]; then
    pf_backup="$pf_apps/Просмотр папки — резервная $(/bin/date +%Y%m%d-%H%M%S)-$$.app"
    /bin/mv "$pf_target" "$pf_backup"
fi
/bin/mv "$pf_built" "$pf_target"

pf_lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
if [[ -x "$pf_lsregister" ]]; then
    "$pf_lsregister" -f "$pf_target" || true
fi

printf '\nГотово: %s\n' "$pf_target"
printf '\n1. В «Просмотре» открой Настройки → Изображения.\n'
printf '   Выбери «Открывать группы файлов в том же окне».\n'
printf '2. Нажми правой кнопкой по картинке → Открыть в приложении → Другое…\n'
printf '   Выбери созданное приложение «Просмотр папки».\n'
printf '3. В окне «Просмотра» включи Вид → Миниатюры, нажми миниатюру и листай ↑ ↓.\n'
printf 'Для копирования сортировки открой папку в Finder списком (⌘2) и разреши доступ к Finder.\n'
printf '\nПодробности — в README_RU.txt рядом с установщиком.\n'
printf 'Если при запуске ничего не видно, запусти Test_PreviewFolder.command из этой же папки.\n'
if [[ -n "$pf_backup" ]]; then printf '\nПредыдущая версия сохранена: %s\n' "$pf_backup"; fi
/usr/bin/open -R "$pf_target" || true
if [[ -t 0 ]]; then read -r -p 'Нажми Enter, чтобы закрыть окно… ' || true; fi
