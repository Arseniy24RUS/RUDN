# Сервер общей диагностики v2

История принятых пакетов не имеет срока хранения и не перезаписывается кольцевым буфером. Удаление выполняется только по подтверждённому действию преподавателя. Ограничения 12 событий, 16 КиБ на пакет и 30 секунд между новыми пакетами ограничивают поток; они не обрезают уже принятую историю. Локальная очередь клиента ограничена отдельно, потери до отправки отражаются счётчиками.

## Развёртывание и переход

1. Проверить `node --test scripts/diagnostics-v2-service.test.mjs` и `firebase emulators:exec --project demo-rudn --config firebase.diagnostics-v2.json --only auth,database,functions "node --test --test-force-exit scripts/diagnostics-v2-emulator.test.mjs"`.
2. Через штатную авторизованную Firebase CLI развернуть **только** `functions:network-gateway:diagnosticsApi,functions:network-gateway:diagnosticsDownload,functions:network-gateway:diagnosticsProfileIndex` из `firebase/firebase.json`. `networkGateway` сохраняет прежнее поведение; его обновление для v2 не требуется. Admin SDK — прямая зависимость; новые функции используют существующий Firebase проект. Тариф и квоты проекта продолжают действовать.
3. В авторизованном преподавательском клиенте вызвать `backend.diagnosticsRequest('migrateLegacy', {kind:'archive',dryRun:true})`, затем `dryRun:false`, перебирая `nextCursor` до `null`. Выполнить также `kind:'profiles'` для поискового справочника. Ответы содержат только счётчики и курсор; не выводить токены, имена и содержимое профилей в логи. Повторный архив сохраняет новые содержимые старых слотов по их неизменному batchId; повтор той же записи идемпотентен.
4. Развернуть финальные правила Database: старые `diagnostics` и `diagnosticSessions` больше не принимают записи и автоматическое удаление по сроку. Учебные ветви правил не меняются. Перед закрытием выполнить последний архивный проход.
5. Опубликовать Pages через штатный workflow. Старые открытые вкладки могут временно перестать отправлять только диагностические записи; оценки и черновики сохраняются прежними механизмами. Принудительно обновлять занятия не требуется.

До появления нового клиентского метода миграцию выполняет оператор с обычными ADC-правами проекта:

```powershell
node scripts/diagnostics-v2-maintenance.mjs --project rudn-gmu-learning-platform --kind archive
node scripts/diagnostics-v2-maintenance.mjs --project rudn-gmu-learning-platform --kind archive --execute --confirm-project rudn-gmu-learning-platform
node scripts/diagnostics-v2-maintenance.mjs --project rudn-gmu-learning-platform --kind profiles --execute --confirm-project rudn-gmu-learning-platform
```

Без `--execute` это только предпросмотр. Команды не извлекают browser ID tokens; ADC должен быть заранее доступен уполномоченному оператору. `--pages` ограничивает число последовательных ограниченных запросов; код 3 означает незавершённый проход. Для локального стенда использовать `--emulator`. Сам сервер и браузер не используют ADC оператора: функция работает с назначенной сервисной учётной записью.

Если ADC отсутствует, разрешён необязательный `--firebase-cli <абсолютный путь к firebase-tools/lib/bin/firebase.js>` для **firebase-tools 15.30.1**. Адаптер использует обычные `Command.prepare → requireAuth → apiv2.Client` этой закреплённой версии и текущий вход Firebase CLI. Он не читает credential-файлы вручную, не вызывает getAccessToken, не выводит и не экспортирует токены. Логи библиотеки выключены внутри отдельного процесса; результат содержит только счётчики. Другой CLI version отклоняется.

```powershell
node scripts/diagnostics-v2-maintenance.mjs --project rudn-gmu-learning-platform --kind archive --firebase-cli '<путь к firebase-tools/lib/bin/firebase.js>'
# Только после проверки предпросмотра и разрешения на миграцию:
node scripts/diagnostics-v2-maintenance.mjs --project rudn-gmu-learning-platform --kind archive --firebase-cli '<путь к firebase-tools/lib/bin/firebase.js>' --execute --confirm-project rudn-gmu-learning-platform
```

Алгоритм миграции остаётся серверным `migrateLegacy`. Клиент оператора читает страницы по 20 профилей / 4 старых UID с ограниченным lookahead и применяет настоящие GET `X-Firebase-ETag` → PUT `If-Match`, повторяя конфликт 412 не более восьми раз. Это сохраняет защиту от новой ревизии имени и tombstone; обычная последовательность `database:get` → `database:update` её не обеспечивает. Разрешены только исходные ветви миграции, directory/name/group indexes и legacyArchive. Профили и оценки адаптер изменять не может. Временные payload-файлы не создаются. До запуска на production проверить `node --test scripts/diagnostics-v2-cli-adapter.test.mjs` и локальный emulator suite.

## API

`POST https://europe-west1-rudn-gmu-learning-platform.cloudfunctions.net/diagnosticsApi`, JSON, `Authorization: Bearer <Firebase ID token>`. Токен никогда не включается в диагностические события или логи. Ответ `{ok:true,...}` либо `{ok:false,error:{code,retryAfterMs?}}`. Разрешён origin платформы; локальные origin разрешены только в эмуляторе.

| action | Вход / результат |
| --- | --- |
| openSession | clientSessionId, installationId, studentKey?, build, environment → sessionId, subjectKey, generation, reportCode, openedAt |
| append | sessionId, batchId, events≤12, dropped?, deduplicated? → batchId, receivedAt, duplicate |
| searchStudents | query?, group?, cursor?, limit≤20 → items, nextCursor; фамилия — префикс любого слова имени, номер — точный профиль с alias |
| listSessions | studentKey?/subjectKey?, filters {build,browser,module,code,installationId,from,to}, cursor?, limit≤20 → items, nextCursor |
| readEvents / exportSession | sessionId, cursor?, limit≤50/100 → items, nextCursor; export включает метаданные сессии |
| status | scope all/student/session или jobId → ограниченная страница статистики либо следующий шаг удаления |
| createExport | sessionId → downloadURL, expiresAt; одноразовая ссылка запускает native NDJSON download без полной буферизации |
| previewDelete | scope all/student/session + ключ → confirmationToken, target, первая страница статистики |
| delete | confirmationToken → job; повтор confirmationToken возвращает ту же задачу |
| migrateLegacy | kind profiles/archive/listArchive, dryRun?, cursor?, limit → scanned, copied, nextCursor |

Чтение, поиск, экспорт, миграция и удаление разрешены только прежней политикой преподавателя (`omnistat@yandex.ru`). Клиентское прямое чтение/запись v2 в RTDB запрещено даже преподавателю: API обеспечивает ограниченный размер ответа. Фильтры проверяются сервером для всего выбранного индекса; пустая страница с nextCursor означает, что поиск продолжается. Курсоры относятся к конкретному запросу и не являются основанием для доступа.

`filters.from/to` — включительные границы серверного `session.openedAt` в целых Unix миллисекундах, 0…9 999 999 999 999, from ≤ to. Это не время события, сообщённое устройством. Границы применяются к выбранному индексу до чтения ограниченной страницы и включены в подпись курсора; изменённый диапазон требует нового первого запроса.

## Привязка и данные

Сессия неизменно связана с Firebase UID и каноническим studentKey, проверенным по `profiles`, `studentAliases`, ownerUid/ownerUids. Смена профиля при том же UID создаёт новую сессию. До выбора профиля события остаются анонимными; они не переименовываются задним числом. Преподаватель имеет отдельный тип сессии. Это достоверность в пределах существующей схемы заявленного учебного профиля, не дополнительная проверка личности.

Имя/группа хранятся только в преподавательском поисковом справочнике. События не содержат ФИО, номера студента, ответов, текстов поиска, сообщений исключений, URL, токенов и оценок. Стек ограничен координатами собственных исходников без query/hash. Необязательный `errorClass` принимает только `Error`, `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, `URIError`, `EvalError`, `AggregateError`, `DOMException`, `FirebaseError`; неизвестный класс клиент опускает. Произвольное имя или сообщение сервер отклоняет. Старые события без поля сохраняют прежний формат. Полная схема и лимиты — `firebase/functions/diagnostics-schema.mjs`.

installationId обозначает случайный экземпляр браузерного хранилища, а не физически уникальный телефон. Модель берётся только из стандартных UA Client Hints, если доступна; иначе отсутствует. Safari может сообщать замороженную версию ОС, поэтому osSource сохраняется отдельно. Нельзя выводить «iPhone 14/15» из размеров экрана или косвенных признаков. Данные о возможностях устройства являются заявленными браузером, без GPU-проверок и fingerprint probes.

Архив v1 помечен `legacy-unbound`: один старый UID мог обслуживать несколько учебных профилей. Сохраняются только оставшиеся старые пакеты; уже перезаписанные кольцом записи восстановить невозможно. Автоматически приписывать этот архив текущему студенту запрещено.

## Удаление и восстановление после ошибок

Перед очисткой повышается generation выбранного субъекта/всего хранилища либо ставится session tombstone. Ограниченное серверное подключение RTDB проверяет поколение правилами при самой записи. Поздний append и неизвестный клиенту успешный ответ не могут воскресить удалённую историю. Задача очищает ограниченные страницы, возобновляется `status(jobId)` и сохраняет прогресс. Новые сессии следующего поколения сохраняются. Tombstones и служебные счётчики остаются для защиты от повторной доставки; это не журналы учебных ответов.

Пакеты неизменяемы. Повтор batchId с тем же digest возвращает прежний receivedAt; другое содержимое даёт 409. При частично завершённом обновлении индексов повтор того же пакета восстанавливает индекс. Отказ диагностики не должен блокировать сохранение учебной работы.

Откат Pages возможен на предыдущий проверенный build; сервер v2 и принятая история остаются. Не включать обратно старый автоматический срок удаления и не удалять v2 для отката интерфейса. Если нужно временно остановить сбор — закрыть v2 ingest правилами или отключить клиентскую отправку, сохранив чтение преподавателя через функцию. Никакая команда этого руководства не удаляет оценки или профили.

Потоковый экспорт обслуживает diagnosticsDownload с обратным давлением. На каждое событие отправляется строка NDJSON, последняя строка kind=complete подтверждает полноту. Ссылка действует 2 минуты до начала и принимается один раз; это срок технической ссылки, не истории. Во время передачи ручное удаление останавливает дальнейшую выдачу. Полный размер выгрузки не ограничен клиентским Blob-лимитом; сетевой обрыв или серверный HTTP timeout остаются обычными причинами неполной загрузки. До четырёх неиспользованных ссылок на преподавателя хранятся в фиксированных слотах. Не включать downloadURL в логи.

Статистика суммируется по nextCursor до null; partial=true не является общим итогом. Для всей истории после v2-сессий курсор проходит непривязанный архив порциями до десяти записей, не считая tombstones. Предпросмотр общего удаления включает этот архив. bytes — размер JSON принятых пакетов и архивных записей, не сумма всех индексов и не счёт провайдера. Статистика и экспорт не загружают оценки.
