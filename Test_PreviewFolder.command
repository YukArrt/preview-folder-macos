#!/bin/bash
# Runs the current source in the foreground and keeps visible diagnostic output.
set -u
set -o pipefail

if [[ "$(/usr/bin/uname -s)" != Darwin ]]; then
    printf 'Эта проверка предназначена для macOS.\n' >&2
    exit 1
fi

pf_base="$(cd -- "$(dirname -- "$0")" && pwd -P)"
pf_source="$pf_base/source/PreviewFolder.js"
if [[ ! -r "$pf_source" ]]; then
    printf 'Распакуй весь архив: папка source должна быть рядом с этим файлом.\n' >&2
    if [[ -t 0 ]]; then read -r -p 'Нажми Enter, чтобы закрыть окно… ' || true; fi
    exit 1
fi

pf_logs="$HOME/Library/Logs/PreviewFolder"
if ! /bin/mkdir -p "$pf_logs"; then
    printf 'Не удалось создать папку журнала.\n' >&2
    exit 1
fi
pf_log="$pf_logs/Terminal-check-$(/bin/date +%Y%m%d-%H%M%S)-$$.log"

{
    printf 'Проверка «Просмотр папки» 1.3\n'
    printf 'macOS: '
    /usr/bin/sw_vers -productVersion
    printf 'Архитектура: '
    /usr/bin/uname -m
    printf '\nПроверяю встроенные компоненты…\n'
} | /usr/bin/tee "$pf_log"

/usr/bin/osascript -l JavaScript "$pf_source" --check-native "$pf_source" 2>&1 | /usr/bin/tee -a "$pf_log"
pf_status=${PIPESTATUS[0]}
if [[ "$pf_status" -eq 0 ]]; then
    printf '\nОткрой папку с картинками в Finder списком (⌘2), выбери сортировку.\nВ окне выбора укажи один JPG или PNG из этой же папки.\nРазреши доступ к Finder, если macOS спросит.\n\n' | /usr/bin/tee -a "$pf_log"
    /usr/bin/osascript -l JavaScript "$pf_source" --diagnose 2>&1 | /usr/bin/tee -a "$pf_log"
    pf_status=${PIPESTATUS[0]}
fi

printf '\nКод завершения: %s\nЖурнал: %s\n' "$pf_status" "$pf_log" | /usr/bin/tee -a "$pf_log"
printf 'Если картинки не открылись, пришли текст или снимок этого окна.\n'
if [[ -t 0 ]]; then read -r -p 'Нажми Enter, чтобы закрыть окно… ' || true; fi
exit "$pf_status"
