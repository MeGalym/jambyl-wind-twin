#!/bin/sh
# сборка страницы турбины: wtg/ → wtg.html (один офлайн-файл)
cd "$(dirname "$0")" && node ~/.claude/skills/teardown/sims/build.mjs ./wtg | tail -1 && cp teardown-out/dist/wtg.html wtg.html && sed -i '' 's|<html lang="en">|<html lang="ru">|; s|<title>wtg</title>|<title>ВЭУ SANY SI-19580</title>|' wtg.html
