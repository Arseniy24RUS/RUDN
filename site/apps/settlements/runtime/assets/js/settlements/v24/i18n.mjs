/** Russian source strings are stable translation keys. No word substitution or
 * geographic-name transliteration: every sentence/template is translated as a
 * unit. Parameters are literal data and are never translated recursively. */
const entries = `
Обучение пройдено|Tutorial completed|教程已完成
К выбору сложности|Choose game difficulty|选择游戏难度
Обучение не начисляет баллы. Далее — основная игра.|The tutorial does not award points. Continue to the main game.|教程不计分。接下来请开始正式游戏。
Население|Population|人口
Связь|Connectivity|通信
Медицина|Healthcare|医疗
Образование|Education|教育
Досуг|Leisure|文娱
Культура|Culture|文化
Построить транспорт|Build transport route|修建交通路线
Остановок: {count} из {limit} · до {distance} км|Stops: {count} of {limit} · up to {distance} km|站点：{count}/{limit} · 最长{distance}公里
Выберите до {limit} близких поселений. Маршрут — до {distance} км.|Choose up to {limit} nearby settlements. Route length: up to {distance} km.|最多选择{limit}个邻近聚落。路线总长不超过{distance}公里。
В одном маршруте можно выбрать не более {limit} поселений|A route can include no more than {limit} selected settlements|每条路线最多可选择{limit}个聚落
Длина маршрута — {distance} км. Максимум — {limit} км. Соедините более близкие поселения или постройте отдельный участок.|Route length: {distance} km. Maximum: {limit} km. Connect closer settlements or build a separate segment.|路线长度为{distance}公里，上限为{limit}公里。请选择更近的聚落，或分段修建。
Выберите до {limit} близких поселений по порядку. Длина всего маршрута — не более {distance} км.|Select up to {limit} nearby settlements in order. The entire route must be no longer than {distance} km.|按顺序选择最多{limit}个邻近聚落。整条路线长度不得超过{distance}公里。
Для двух удалённых поселений разрешён один прямой участок исходной сети длиннее {distance} км.|For two remote settlements, one direct segment of the original network may exceed {distance} km.|对于两个偏远聚落，允许原始网络中的一个直连路段超过{distance}公里。
Убрать последнюю остановку|Remove last stop|移除最后一个站点
Добавляйте остановки по порядку|Add stops in order|按顺序添加站点
Выберите следующие поселения по порядку, затем постройте весь маршрут одним нажатием.|Select the next settlements in order, then build the whole route with one confirmation.|按顺序选择其他聚落，然后一次确认修建整条路线。
Это поселение уже выбрано. Для изменения маршрута уберите последнюю остановку.|This settlement is already selected. Remove the last stop to change the route.|该聚落已选中。要修改路线，请移除最后一个站点。
Для присоединения к действующей линии начните отдельное соединение.|Start a separate connection to join an active route.|如需接入已运行的线路，请新建一条连接。
К этому поселению нет дороги. Сначала постройте транспортное соединение.|There is no road to this settlement. Build a transport connection first.|没有道路通往该聚落。请先修建交通连接。
Неизвестные условия выездной помощи|Unknown mobile doctor rules|巡诊服务规则无法识别
Неизвестные условия транспортного маршрута|Unknown transport route rules|交通路线规则无法识别
Некорректная версия правил транспортного маршрута|Invalid transport route rules version|交通路线规则版本无效
Выберите не менее двух поселений маршрута|Select at least two stops for the route|请为路线选择至少两个聚落
Остановки маршрута не должны повторяться|Route stops must not repeat|路线站点不能重复
Остановки не совпадают с концами маршрута|Stops do not match the route endpoints|站点与路线端点不一致
Связь отсутствует в учебной транспортной сети: {from} → {to}|No connection in the educational transport network: {from} → {to}|教学交通网络中没有连接：{from} → {to}
Выезд врача требует дороги к поселению. Если её нет, сначала постройте транспортное соединение.|A mobile doctor needs a road to the settlement. If there is none, build a transport connection first.|巡诊医生需要道路通往聚落。如无道路，请先修建交通连接。
Вышка|Tower|通信塔
Вышка связи|Communications tower|通信塔
Вышки связи|Communications towers|通信塔
Построить вышку|Build tower|建造通信塔
Построить вышки|Build towers|批量建造通信塔
Выбрано вышек: {count}|Towers selected: {count}|已选通信塔：{count}
Убрать последнюю вышку|Remove last tower|移除最后一座通信塔
Коснитесь карты, чтобы добавить ещё вышку.|Tap the map to add another tower.|点按地图可继续添加通信塔。
Выберите места для вышек, затем подтвердите строительство.|Select tower sites, then confirm construction.|选择通信塔的位置，然后确认建造。
Это место уже выбрано. Можно убрать последнюю вышку.|This site is already selected. You can remove the last tower.|此位置已选中。您可以移除最后一座通信塔。
За один ход можно построить до {count} вышек.|You can build up to {count} towers in one turn.|每回合最多可建造{count}座通信塔。
Выберите от 2 до 100 мест для вышек|Select between 2 and 100 tower sites|请选择2至100个通信塔位置
Места для вышек не должны повторяться|Tower sites must not repeat|通信塔位置不能重复
Клиника|Clinic|诊所
Школа|School|学校
Центр досуга|Leisure centre|文娱中心
Общественный центр|Community centre|社区中心
Транспорт|Transport|交通
Выезд врача|Mobile doctor|巡诊服务
Выездной врач|Mobile doctor|巡诊医生
Соединить|Connect|连接
Соединение|Connection|连接
Расширение|Expansion|扩建
Система расселения|Settlement System|聚落系统
Учебная группа|Tutorial area|教学区域
Меню игры|Game menu|游戏菜单
Построить|Build|建造
Бюджет|Budget|预算
Обозначения|Legend|图例
Результат хода|Turn result|本回合结果
Результат|Result|结果
Последний ход|Last turn|上一回合
Как играть|How to play|玩法说明
Настройки|Settings|设置
Источники|Sources|数据来源
Начать заново|Start again|重新开始
Экспортировать|Export|导出
Импортировать|Import|导入
Лёгкая|Easy|低难度
Обычная|Medium|中难度
Сложная|Hard|高难度
Около 10–15 действий на слой|About 10–15 actions per service|每项服务约需10–15次操作
До 100 действий на слой|Up to 100 actions per service|每项服务最多约需100次操作
Сотни действий в больших регионах|Hundreds of actions in large regions|较大地区需要数百次操作
Низкая|Easy|低难度
Средняя|Medium|中难度
Высокая|Hard|高难度
Отменить последний ход|Undo the last turn|撤销上一回合
Отменить ход|Undo turn|撤销回合
Текущая задача|Current task|当前任务
Слой карты|Map layer|地图图层
Действие|Action|操作
Поиск|Search|搜索
Поиск поселения|Search settlements|搜索聚落
Приблизить карту|Zoom in|放大地图
Отдалить карту|Zoom out|缩小地图
Закрыть|Close|关闭
Открываем учебную группу…|Opening the tutorial area…|正在打开教学区域…
Открываем регион…|Opening the region…|正在打开地区…
Открываем регион|Opening the region|正在打开地区
Загружается только выбранная территория|Only the selected territory is being loaded|只加载所选区域
Загружаем регион…|Loading the region…|正在加载地区…
Карта. Перемещайте стрелками, масштабируйте плюс и минус. Поиск поселений доступен кнопкой Поиск.|Map. Move with the arrow keys and zoom with plus and minus. Use Search to find settlements.|地图：使用方向键移动，使用加号和减号缩放。按“搜索”查找聚落。
Карта поселений. Стрелки перемещают карту, плюс и минус меняют масштаб. Enter или пробел выбирает место в центре карты. Для выбора поселения также доступен поиск.|Settlement map. Arrow keys move the map; plus and minus zoom. Enter or Space selects the centre of the map. You can also use search to select a settlement.|聚落地图：方向键移动地图，加号和减号缩放。按回车或空格选择地图中心位置，也可搜索并选择聚落。
Без названия|Unnamed|未命名
Численность неизвестна|Population unknown|人口数量未知
{amount} млн ₽|{amount} million RUB|{amount} 百万卢布
млн ₽|million RUB|百万卢布
жителей|residents|居民
{count} жителей|{count} residents|{count} 名居民
{service}: ещё {count} жителей · {coverage}|{service}: {count} more residents · {coverage}|{service}：新增{count}名受益居民 · {coverage}
полностью обеспечено {count} пос.|{count} settlements fully served|{count}个聚落已获全面服务
доступ лучше в {count} пос.|improved access in {count} settlements|{count}个聚落的服务可达性得到改善
Сложность новой или сохранённой партии|Difficulty of the new or saved game|新游戏或存档的难度
У каждой сложности своё сохранение.|Each difficulty has its own save.|每种难度单独保存进度。
В этой точке несколько поселений|Several settlements share this location|此位置对应多个聚落
Координаты совпадают. Выберите нужную запись.|The coordinates match. Select the intended settlement.|坐标相同，请选择所需的聚落记录。
Для первого размещения коснитесь отмеченной площадки вышки.|For your first placement, tap the marked tower site.|首次放置时，请点按标记的通信塔位置。
Сейчас выберите {name} — отмеченное поселение.|Select {name}, the highlighted settlement.|请选择标记的聚落：{name}。
Выберите {name}.|Select {name}.|请选择{name}。
Теперь выберите поселение или действующую линию. Цена учитывает только новые участки.|Now select a settlement or an active connection. Only new segments are charged.|现在请选择一个聚落或已运行的线路。只需支付新增路段的费用。
Теперь выберите второе поселение. Цена учитывает только новые участки.|Now select the second settlement. Only new segments are charged.|现在请选择第二个聚落。只需支付新增路段的费用。
Коснитесь отмеченной площадки, чтобы увидеть первое покрытие.|Tap the marked site to preview your first coverage area.|点按标记位置，预览第一座通信塔的覆盖范围。
Такого региона нет в поставленном наборе.|This region is not available in the supplied data.|提供的数据中没有该地区。
Сохранение не соответствует назначенной партии.|The save does not match the assigned game.|存档与分配的游戏不匹配。
Фоновые дороги не удалось загрузить. Игровая сеть доступна; попробуйте открыть регион снова.|Background roads could not be loaded. The game network is available; try reopening the region.|背景道路加载失败。游戏交通网络仍可使用；请尝试重新打开地区。
Условия партии обновлены. Начинаем с новой исходной сети.|The game conditions have been updated. Starting with the new initial network.|游戏初始条件已更新，将从新的初始网络开始。
Не удалось открыть игру|Could not open the game|无法打开游戏
Сохранённые данные не удалены.|Your saved data has not been deleted.|已保存的数据未被删除。
Повторить|Retry|重试
Попробовать снова|Try again|重试
Открыть меню|Open menu|打开菜单
по расстоянию|by distance|按距离计费
На выбранной площадке|At the selected site|在所选位置
К сети|To the network|接入网络
Новых получателей пока нет|No new recipients yet|暂时没有新增受益居民
Это действие недоступно|This action is unavailable|无法执行此操作
Предпросмотр · Соединение|Preview · Connection|预览 · 连接
Предпросмотр|Preview|预览
Отменить примеривание|Cancel preview|取消预览
Подтвердить|Confirm|确认
Показать получателей|Show recipients|显示受益聚落
Почему такой результат?|Why this result?|为什么会得到此结果？
Ваша первая сеть|Your first network|你的第一个服务网络
Достройте сеть региона|Complete the regional network|完善地区服务网络
Первая сеть работает|Your first network is working|第一个服务网络已建成
Регион обеспечен|Region fully served|地区已获全面服务
Выбрать регион|Choose a region|选择地区
Показать текущую задачу|Show the current task|显示当前任务
Все четыре услуги — 100%|All four services — 100%|四项服务均达到100%
Посмотреть результат|View result|查看结果
Итог обучения|Tutorial result|教学结果
Другая партия|Another game|另一局游戏
Примерьте вышку на отмеченном месте|Preview a tower at the marked site|在标记位置预览通信塔
Выберите «{tool}», затем {name} на карте|Select “{tool}”, then {name} on the map|选择“{tool}”，然后在地图上选择{name}
Выберите на карте: {name}|Select on the map: {name}|在地图上选择：{name}
Примерить отмеченное место|Preview the marked site|预览标记位置
Примерить|Preview|预览
Цель: все 7 поселений получают четыре услуги на 100%.|Goal: all 7 settlements receive all four services in full.|目标：7个聚落的四项服务均达到100%。
Коснитесь места на карте|Tap a location on the map|点按地图上的位置
Выберите поселение или действующую линию|Select a settlement or an active connection|选择聚落或已运行的线路
Выберите второе поселение|Select the second settlement|选择第二个聚落
Выберите первое поселение|Select the first settlement|选择第一个聚落
Выберите поселение|Select a settlement|选择聚落
Сменить действие|Change action|更换操作
Вернуться к карте|Return to the map|返回地图
Потрачено {amount}.|Spent: {amount}.|已花费：{amount}。
Зелёный — рост|Green — growth|绿色 — 增长
Жёлтый — стабильно|Yellow — stable|黄色 — 稳定
Красный — убыль|Red — decline|红色 — 减少
Серый — нет сравнения|Grey — no comparison|灰色 — 无可比数据
○ нет услуги|○ no service|○ 无服务
✓ есть|✓ available|✓ 已覆盖
◌ изменится|◌ will change|◌ 将改变
Размер — численность населения; шкала сжата.|Size represents population on a compressed scale.|圆点大小表示人口数量；采用压缩比例。
Все обозначения|Full legend|完整图例
Пока нет новых действий|No new actions yet|尚无新操作
Пока нет подходящего учреждения|No suitable facility yet|尚无合适的设施
Нет доступного пути к учреждению|No accessible route to a facility|没有可到达设施的路线
Не хватает мест|Not enough capacity|容量不足
Нет достоверного значения спроса|No reliable demand figure|缺少可靠的需求数据
В исходных данных нет жителей|No residents in the source data|原始数据中人口为零
Услуга доступна|Service available|服务可用
Закрыть карточку|Close settlement card|关闭聚落详情
Изменение за 2010–2021 гг. не рассчитано|Change for 2010–2021 has not been calculated|未计算2010–2021年的人口变化
Изменение {value}% за 2010–2021 гг.|Change of {value}% in 2010–2021|2010–2021年变化{value}%
Исторические данные не меняются от игровых действий.|Game actions do not change historical data.|游戏操作不会改变历史数据。
Выберите отрасль для проверки доступа|Select a service to check access|选择服务以检查可达性
Нужно ещё {count} мест.|{count} more places are needed.|还需增加{count}个名额。
· свободно {free} из {total} мест.|· {free} of {total} places available.|· 共{total}个名额，空余{free}个。
Расширить · {amount}|Expand · {amount}|扩建 · {amount}
Выбрать действие|Choose an action|选择操作
Сначала завершите отмеченный шаг.|Complete the highlighted step first.|请先完成标记的步骤。
Действие выполнено. Новых получателей пока нет.|Action completed. No new recipients yet.|操作已完成，暂时没有新增受益居民。
Этот вариант пока не добавляет обслуживания. Откройте объяснение или примеряйте другое место.|This option does not improve service yet. Open the explanation or preview another location.|此方案暂未增加服务覆盖。请查看说明或预览其他位置。
Вышка даёт связь каждому поселению внутри круга, даже без дороги.|A tower connects every settlement inside its coverage circle, even without a road.|通信塔为覆盖圆内的所有聚落提供通信服务，即使没有道路也不受影响。
Соединение помогает добраться до учреждений при доступном времени пути и свободных местах. Один участок используется всеми услугами.|A connection provides access to facilities when travel time is within the limit and capacity is available. All services share the same segments.|当行程时间符合要求且设施有空余容量时，连接可使居民到达设施。所有服务共用同一路段。
Расширение добавляет места в действующем учреждении. Новые места получают доступные по сети поселения; прежние назначения сохраняются.|Expansion adds capacity to an existing facility. Settlements reachable through the network receive the new places; existing allocations are preserved.|扩建增加现有设施的容量。新增名额分配给交通网络可达的聚落；原有分配保持不变。
Учреждение обслуживает свой пункт и соседей, доступных пешком или по действующим участкам сети. Число мест ограничено; прежние назначения сохраняются.|A facility serves its own settlement and neighbours reachable on foot or via active network segments. Capacity is limited; existing allocations are preserved.|设施为所在聚落及步行或通过已运行网络可达的邻近聚落提供服务。容量有限，原有分配保持不变。
{count} жителей получают дополнительный доступ. Полностью обеспечены ещё {settlements} поселений.|{count} residents gain additional access. {settlements} more settlements are fully served.|{count}名居民获得额外服务，另有{settlements}个聚落获得全面服务。
Оплачиваются только новые участки. Ранее запущенные соединения используются бесплатно.|Only new segments are charged. Existing connections are used at no extra cost.|只支付新增路段的费用。已运行的连接可免费使用。
по действующей сети без лимита времени|via the active network with no time limit|通过已运行网络，无时间限制
Новых получателей нет: либо эти пункты уже обеспечены, либо нужны подходящее учреждение, маршрут или дополнительные места.|No new recipients: the settlements are already served, or a suitable facility, route or additional capacity is needed.|没有新增受益居民：这些聚落已有服务，或仍需合适的设施、路线或额外容量。
Условная иллюстрация объекта|Illustrative facility image|设施示意图
Результат учитывает весь регион. Граница задания не отсекает внешних получателей. Это учебная модель доступности.|The result covers the whole region. Task boundaries do not exclude recipients outside them. This is an educational access model.|结果涵盖整个地区，任务边界不会排除边界之外的受益居民。这是用于教学的服务可达性模型。
Весь регион|Whole region|整个地区
Найти поселение|Find a settlement|查找聚落
Название|Name|名称
Начните вводить название|Start typing a name|开始输入名称
Совпадений не найдено|No matches found|未找到匹配结果
От дефицита к решению|From unmet needs to a solution|从需求缺口到解决方案
Задания — необязательные подсказки. Они чередуют связь, медицину, школу и досуг, предлагая поселения с дефицитом от крупных к малым. Можно строить в любом порядке: выполненные задачи пропускаются автоматически. Кнопка возле задачи показывает нужное место и слой. Цель — 100% по всем четырём услугам во всём регионе.|Tasks are optional hints. They alternate between connectivity, healthcare, school and leisure, suggesting settlements with unmet needs from largest to smallest. Build in any order: completed tasks are skipped automatically. The button beside a task shows its location and layer. The goal is 100% for all four services across the region.|任务是可选提示，依次涉及通信、医疗、学校和文娱，并按人口从多到少推荐有需求缺口的聚落。可按任意顺序建设，已完成的任务会自动跳过。任务旁的按钮可显示对应位置和图层。目标是使整个地区的四项服务均达到100%。
Посмотрите, чего не хватает.|Check what is missing.|查看缺少哪些服务。
Выберите отраслевой слой. Необслуженные точки имеют отдельный контур.|Select a service layer. Unserved settlements have a distinct outline.|选择服务图层。未获得服务的聚落具有独立轮廓标记。
Примерьте решение.|Preview a solution.|预览解决方案。
Коснитесь места для вышки или поселения для учреждения. Сравнивать варианты можно бесплатно.|Tap a tower location or a settlement for a facility. Comparing options is free.|点按通信塔位置或需要建设设施的聚落。比较方案不会产生费用。
Проверьте получателей и цену.|Check recipients and cost.|检查受益聚落和费用。
Предпросмотр показывает результат. «Показать получателей» возвращает их в кадр.|The preview shows the result. “Show recipients” brings them into view.|预览会显示结果。“显示受益聚落”可将它们移入视野。
Подтвердите.|Confirm.|确认操作。
Только теперь списываются деньги. Ошибочный ход можно отменить.|Money is deducted only now. You can undo a mistaken turn.|只有确认后才会扣除费用。错误的操作可以撤销。
Одна дорога — разные услуги|One road, multiple services|一条道路，多种服务
«Транспорт» запускает транспорт.|“Transport” activates a transport connection.|“交通”用于开通交通连接。
Если требуется дорога, её строительство входит в ту же цену.|If a road is needed, its construction is included in the same price.|如需修建道路，道路建设费包含在该费用中。
Маршрут помогает и клинике, и школе, если у них есть свободные места. Сам по себе путь не создаёт учреждение.|A route helps both clinics and schools if they have spare capacity. A route alone does not create a facility.|只要有空余容量，路线可同时支持诊所和学校。路线本身不会创建服务设施。
После первого поселения можно выбрать действующую линию. Ветка присоединится к узлу исходной сети; оплачиваются только новые участки.|After selecting the first settlement, you can select an active connection. The branch joins a node in the source network; only new segments are charged.|选择第一个聚落后，可再选择已运行的线路。支线将接入原始网络节点；只支付新增路段的费用。
Связь есть только в зоне вышки.|Connectivity is available only within a tower's coverage area.|只有通信塔覆盖范围内才有通信服务。
Исходная сеть зависит от выбранной сложности.|The initial network depends on the selected difficulty.|初始网络取决于所选难度。
Малые поселения|Small settlements|小型聚落
Строить можно и там, где меньше 500 жителей. Цена одинакового объекта одинакова. Полезность зависит от положения, спроса и сети.|You can also build in settlements with fewer than 500 residents. The same facility costs the same everywhere. Its benefit depends on location, demand and the network.|人口少于500人的聚落也可以建设。同类设施的价格相同，效益取决于位置、需求和网络。
Начальная инфраструктура сценарная. Историческое население остаётся неизменным.|The initial infrastructure is defined by the scenario. Historical population data remains unchanged.|初始基础设施由情景设定，历史人口数据保持不变。
Начальная инфраструктура сценарная. Историческое население остаётся неизменным. Длительность человеческой партии и работа на физических телефонах ещё требуют проверки.|The initial infrastructure is defined by the scenario. Historical population data remains unchanged. Play duration and operation on physical phones still require testing.|初始基础设施由情景设定，历史人口数据保持不变。实际游戏时长和实体手机运行情况仍需验证。
Обозначения карты|Map legend|地图图例
Услуги пока нет|Service not yet available|尚无服务
Нужны дополнительные места|Additional capacity needed|需要增加容量
Изменится после подтверждения|Will change after confirmation|确认后将改变
Размер точки — численность по исходным данным; шкала сжата, чтобы малые поселения оставались видны. История за 2010–2021 гг. доступна в карточке поселения и не меняется от строительства. Территориальная сопоставимость переписей в наборе не установлена.|Point size represents the source population; the scale is compressed to keep small settlements visible. The settlement card shows historical data for 2010–2021, unchanged by construction. The dataset does not establish whether census boundaries are comparable.|圆点大小表示原始人口数量，采用压缩比例以确保小型聚落仍然可见。聚落详情显示2010–2021年的历史数据，建设不会改变这些数据。本数据集尚未确认两次人口普查的地域范围是否可比。
В слое «Население» зелёная заливка означает рост, жёлтая — изменение в пределах ±3%, красная — убыль, серая — отсутствие сравнения. В отраслевых слоях заливка означает доступ.|In the Population layer, green means growth, yellow means change within ±3%, red means decline and grey means no comparison. In service layers, the fill indicates access.|在“人口”图层中，绿色表示增长，黄色表示变化在±3%以内，红色表示减少，灰色表示无法比较。在服务图层中，填充颜色表示服务可达性。
Тонкие светлые дороги — географический фон из поставленного набора. Сине-серые линии с белой обводкой — действующие игровые маршруты. Наличие дороги на подложке само по себе не включает обслуживание: используйте «Транспорт».|Thin pale roads are geographic background from the supplied dataset. Blue-grey lines with white outlines are active game routes. A road on the background does not activate service: use Transport.|细浅色道路是数据集提供的地理背景。白色描边的蓝灰色线是已运行的游戏路线。背景中的道路不会自动开通服务，请使用“交通”。
Источники и условности|Sources and model assumptions|数据来源与模型假设
Все исходные 155 794 записи сохранены; добавлены 45 записей Москвы, Санкт-Петербурга и Севастополя. Всего 155 839 поселений: 85 субъектов в 82 игровых территориях. Численность и координаты берутся из поставленных источников.|All 155,794 original records are preserved, with 45 records added for Moscow, Saint Petersburg and Sevastopol. There are 155,839 settlements in total: 85 federal subjects grouped into 82 game territories. Population and coordinates come from the supplied sources.|保留了全部155,794条原始记录，并补充了莫斯科、圣彼得堡和塞瓦斯托波尔的45条记录。总计155,839个聚落：85个联邦主体组成82个游戏区域。人口与坐标均来自提供的数据源。
В проекте колонка Population_2020 исходной таблицы трактуется как численность переписи 2021 года. История сравнивается с 2010 годом. Территориальная сопоставимость переписей не установлена; это ограничение набора, а не подтверждённое изменение одинаковых границ.|The project interprets the source table's Population_2020 column as the 2021 census population, compared with 2010. The territorial comparability of the censuses is not established; this is a dataset limitation, not verified change within identical boundaries.|本项目将原始表中的Population_2020列解释为2021年人口普查数据，并与2010年比较。尚未确认两次普查的地域范围是否可比；这是数据集的限制，不能视为相同边界内已经证实的人口变化。
Исходная обеспеченность и учреждения —|Initial service coverage and facilities are|初始服务覆盖与设施属于
сценарные условия|scenario assumptions|情景设定
, не реестр реальной инфраструктуры. Школьный спрос условно составляет 16% населения. Цены, мощность и радиус связи — параметры паззла.|, not a register of real infrastructure. School demand is assumed to be 16% of population. Prices, capacities and tower radius are game parameters.|，并非现实基础设施名录。学校需求假定为人口的16%。价格、容量和通信覆盖半径均为游戏参数。
Связь не моделирует рельеф, частоты и качество радиосигнала.|Connectivity does not model terrain, frequencies or radio-signal quality.|通信模型不考虑地形、频率或无线信号质量。
Границы и производные геоданные: ©|Boundaries and derived geodata: ©|边界及衍生地理数据：©
, ODbL. Исходные выгрузки дорог: Geofabrik. Лицензионные сведения сохранены в поставке.|, ODbL. Source road extracts: Geofabrik. Licence information is included with the game.|，ODbL许可证。道路数据源：Geofabrik。游戏中保留了许可信息。
Происхождение данных и лицензии|Data provenance and licences|数据来源与许可证
Уменьшить движение|Reduce motion|减少动画
Все получатели и результаты остаются видимыми без анимации. Качество карты автоматически подстраивается под время кадра.|All recipients and results remain visible without animation. Map quality automatically adapts to frame time.|关闭动画后，所有受益聚落和结果仍然可见。地图质量会根据帧耗时自动调整。
Последний ход отменён.|Last turn undone.|已撤销上一回合。
Учебная группа · 7 поселений|Tutorial area · 7 settlements|教学区域 · 7个聚落
Обеспечение всего региона|Coverage across the region|全地区服务覆盖
Знаменатель — поселения с известным спросом. Полное обеспечение означает удовлетворённый спрос, без скрытых порогов. Пункты с нулевым и неизвестным населением не объявляются обслуженными автоматически.|The denominator includes settlements with known demand. Full coverage means all demand is met, with no hidden thresholds. Settlements with zero or unknown population are not automatically counted as served.|分母为需求已知的聚落。全面覆盖意味着所有需求得到满足，没有隐藏门槛。人口为零或未知的聚落不会自动计为已获服务。
Сначала освоим первый результат|Complete your first network first|先完成第一个服务网络
Завершите короткое введение: три действия с подсказкой, затем доведите четыре услуги до 100%. Затем откроются все регионы.|Complete the short tutorial: three guided actions, then bring all four services to 100%. All regions will then unlock.|完成简短教学：先进行三步引导操作，再使四项服务均达到100%。之后将解锁全部地区。
Продолжить введение|Continue tutorial|继续教学
Выберите регион|Choose a region|选择地区
Подготовленные партии — достройка сценарной сети до полного обеспечения.|Prepared games ask you to complete the scenario network until everyone is served.|预设游戏要求完善情景网络，直至实现全面服务。
Свободная игра · 85 субъектов, 82 территории|Free play · 85 federal subjects, 82 territories|自由游戏 · 85个联邦主体，82个区域
Открыть свободную игру|Open free play|开始自由游戏
Вернуться к введению|Return to tutorial|返回教学
Семь поселений: связь и общая сеть|Seven settlements: connectivity and a shared network|七个聚落：通信与共享网络
Связь для семи поселений|Connectivity for seven settlements|为七个聚落提供通信
Медицина для семи поселений|Healthcare for seven settlements|为七个聚落提供医疗
Общая дорога к школе|A shared road to school|通往学校的共享道路
Досуг для двух соседних поселений|Leisure for two neighbouring settlements|为两个相邻聚落提供文娱服务
Разместите вышку|Place a tower|放置通信塔
Примерьте вышку в отмеченном месте и подтвердите. Радиус — учебное условие, не модель радиосвязи.|Preview a tower at the marked site and confirm. The radius is an educational assumption, not a radio propagation model.|在标记位置预览通信塔并确认。该半径是教学设定，并非无线通信传播模型。
Создайте медицинский центр|Create a healthcare centre|建立医疗中心
Постройте клинику в Большой Казакбаевой. Сравните новых получателей с картой до подтверждения.|Build a clinic in Большая Казакбаева. Check the new recipients on the map before confirming.|在Большая Казакбаева建设诊所。确认前，请在地图上核对新增受益聚落。
Соедините две услуги|Connect two services|连接两项服务
Соедините Большую Казакбаеву с Мансуровой. Один маршрут помогает медицине и школе.|Connect Большая Казакбаева to Мансурова. One route supports healthcare and school access.|连接Большая Казакбаева与Мансурова。一条路线可同时改善医疗和学校服务的可达性。
Дополните условную сеть региона до полного обслуживания.|Complete the region's scenario network to provide full service.|完善地区情景网络，实现全面服务。
Все четыре направления — 100%|All four services — 100%|四项服务均达到100%
Теперь самостоятельно|Now try on your own|现在请独立完成
Связь, медицина, образование и досуг доступны всем семи поселениям. Учебное задание выполнено.|All seven settlements have access to connectivity, healthcare, education and leisure. Tutorial completed.|七个聚落均已获得通信、医疗、教育和文娱服务。教学任务完成。
Доведите связь, медицину, образование и досуг до 100%. Найдите оставшийся дефицит и сравните результат до подтверждения.|Bring connectivity, healthcare, education and leisure to 100%. Find the remaining unmet needs and compare the result before confirming.|使通信、医疗、教育和文娱均达到100%。查找剩余需求缺口，并在确认前比较结果。
Вводное задание выполнено|Tutorial completed|教学任务已完成
Вы достроили учебный фрагмент. Полный регион доступен отдельно.|You have completed the tutorial network. The full region is available separately.|你已完成教学网络建设，可另外进入完整地区。
Найдите оставшиеся поселения без связи и медицинского обслуживания.|Find the remaining settlements without connectivity or healthcare.|查找尚无通信或医疗服务的聚落。
Не удалось сохранить ход. Вернитесь к списку партий и повторите синхронизацию.|Could not save the turn. Return to the game list and retry synchronisation.|无法保存回合。请返回游戏列表并重试同步。
Партия завершена|Game completed|游戏已完成
Завершить игру|Finish game|结束游戏
Денег недостаточно для платного действия. Можно выполнить бесплатные соединения и завершить игру.|There is not enough money for a paid action. You can make free connections and finish the game.|余额不足以进行付费操作。可完成免费连接后结束游戏。
Вернуться к списку партий|Return to games|返回游戏列表
Продолжить|Continue|继续
Обучение завершено|Tutorial completed|教学已完成
Вернуться|Back|返回
К списку партий|Back to games|返回游戏列表
Просмотр завершённой партии|View completed game|查看已完成的游戏
Просмотр партии|View game|查看游戏
Завершено|Completed|已完成
Все услуги доступны|All services available|所有服务均可用
Вернуться на страницу игры|Return to game page|返回游戏页面
Пройти обучение заново|Repeat tutorial|重新学习教学
Версия 1.0|Version 1.0|版本1.0
`.trim().split('\n').map(line=>line.split('|'));

const errorEntries = `
Неизвестная версия сценария или правил|Unknown scenario or rules version|无法识别情景或规则版本
Неизвестная версия плана связи|Unknown connectivity plan version|无法识别通信规划版本
Неизвестная версия социальной политики|Unknown service policy version|无法识别服务规则版本
Некорректная сложность сценария|Invalid scenario difficulty|情景难度无效
Некорректные исходные условия сценария|Invalid initial scenario conditions|情景初始条件无效
Некорректный сценарий или регион|Invalid scenario or region|情景或地区无效
Неизвестные поселения сценария|Unknown settlements in the scenario|情景包含无法识别的聚落
Вводный сценарий должен содержать три шага|The tutorial must contain three guided steps|教学必须包含三个引导步骤
Неизвестная версия правил|Unknown rules version|无法识别规则版本
Неизвестная версия исходной сети связи|Unknown initial connectivity network version|无法识别初始通信网络版本
Некорректные условия исходной сети связи|Invalid initial connectivity network conditions|初始通信网络条件无效
Исходная сеть связи не соответствует сохранённой партии|The initial connectivity network does not match this saved game|初始通信网络与已保存的游戏不匹配
Неизвестная версия правил журнала действий|Unknown action journal rules version|无法识别操作记录的规则版本
Некорректная версия правил журнала действий|Invalid action journal rules version|操作记录的规则版本无效
Сохранение относится к другому сценарию или региону|The save belongs to another scenario or region|存档属于其他情景或地区
Версия исходных данных сохранения не совпадает с загруженным регионом|The save's source data version does not match the loaded region|存档的数据版本与已加载地区不匹配
Версия транспортных условий сохранения не совпадает со сценарием|The save's transport conditions do not match the scenario|存档的交通条件与情景不匹配
Версия плана связи сохранения не совпадает со сценарием|The save's connectivity plan does not match the scenario|存档的通信规划与情景不匹配
Сложность сохранения не совпадает со сценарием|The saved difficulty does not match the scenario|存档难度与情景不匹配
Версия социальной политики сохранения не совпадает со сценарием|The save's service policy does not match the scenario|存档的服务规则与情景不匹配
Некорректная мощность объекта|Invalid facility capacity|设施容量无效
Некорректные исходные вышки|Invalid initial towers|初始通信塔无效
Исходные вышки не соответствуют поселениям сценария|Initial towers do not match the scenario settlements|初始通信塔与情景聚落不匹配
Некорректные условия доступности объекта|Invalid facility access conditions|设施可达性条件无效
Некорректный владелец сохранения|Invalid save owner|存档所有者无效
Некорректный исходный объект|Invalid initial facility|初始设施无效
Некорректная исходная мощность|Invalid initial capacity|初始容量无效
Исходный маршрут отсутствует в учебной сети|The initial route is missing from the educational network|教学网络中缺少初始路线
Выберите действие|Choose an action|选择操作
Выберите допустимые координаты вышки|Select a valid tower location|选择有效的通信塔位置
Выберите объект и поселение|Select a facility and a settlement|选择设施与聚落
Выберите два поселения|Select two settlements|选择两个聚落
Выберите действующий участок сети|Select an active network segment|选择已运行的网络路段
Выберите объект для расширения|Select a facility to expand|选择要扩建的设施
Неизвестное действие|Unknown action|无法识别操作
Сначала выполните текущий шаг вводного задания|Complete the current tutorial step first|请先完成当前教学步骤
Недоступна геометрия границы региона|Region boundary data is unavailable|无法获取地区边界数据
Действие недоступно в этой версии правил|This action is unavailable under these rules|当前规则不支持此操作
Разместите вышку внутри границы региона|Place the tower inside the region boundary|请将通信塔放在地区边界内
Поселение отсутствует в регионе|The settlement is not in this region|该聚落不在此地区中
Объект уже есть. Его можно расширить.|The facility already exists. You can expand it.|该设施已存在，可以扩建。
Связь отсутствует в учебной транспортной сети|There is no connection in the educational transport network|教学交通网络中没有该连接
Все участки этого пути уже работают|Every segment of this route is already active|此路线的所有路段均已运行
Для участка не заданы транспортные условия|Transport conditions are missing for this segment|此路段缺少交通条件
Для участка не задано расстояние|The segment's distance is missing|此路段缺少距离数据
Сначала выберите существующий объект|Select an existing facility first|请先选择已有设施
Объект уже расширен|The facility has already been expanded|该设施已经扩建
Не хватает бюджета: нужно {amount} млн ₽|Insufficient budget: {amount} million RUB needed|预算不足：需要{amount}百万卢布
Некорректная мощность расширения|Invalid expansion capacity|扩建容量无效
Неизвестная версия сценария|Unknown scenario version|无法识别情景版本
Неизвестные транспортные условия|Unknown transport conditions|无法识别交通条件
Неизвестная версия исходных данных|Unknown source data version|无法识别数据版本
Некорректный шаг обучения|Invalid tutorial step|教学步骤无效
Некорректный или слишком большой журнал действий|The action history is invalid or too large|操作记录无效或过大
Некорректный шаг обучения в сохранении|Invalid tutorial step in the save|存档中的教学步骤无效
Шаг обучения сохранения не соответствует журналу действий|The saved tutorial step does not match the action history|存档教学步骤与操作记录不匹配
Отменять нечего|Nothing to undo|没有可撤销的操作
Нет действий для отмены|No actions to undo|没有可撤销的操作
Неизвестная сложность партии. Выберите лёгкую, обычную или сложную.|Unknown game difficulty. Choose Easy, Medium or Hard.|无法识别游戏难度。请选择低、中或高难度。
Неизвестная версия правил или сценария. Текущее прохождение не изменено.|Unknown rules or scenario version. Your current progress is unchanged.|无法识别规则或情景版本。当前进度未改变。
Этот файл относится к прежней разработческой версии. Откройте новую партию.|This save uses earlier development rules. Start a new game.|此存档使用旧版开发规则，请开始新游戏。
Не удалось сохранить в браузере. Откройте меню и экспортируйте файл.|Could not save in this browser. Open the menu and export your save.|无法在浏览器中保存。请打开菜单并导出存档。
Браузер не сохраняет прогресс. Экспортируйте прохождение через меню.|This browser is not saving progress. Export your save from the menu.|浏览器未保存进度，请通过菜单导出存档。
Файл сохранения больше 2 МБ.|The save file exceeds 2 MB.|存档文件超过2MB。
Файл прежней разработческой версии. Начните новую партию.|This file uses earlier development rules. Start a new game.|此文件使用旧版开发规则，请开始新游戏。
Восстановить прохождение?|Restore progress?|恢复进度？
Файл будет проверен повторным расчётом ходов. Текущее сохранение не меняется до успешной проверки.|The file will be checked by replaying its actions. Your current save remains unchanged until validation succeeds.|系统将重放操作以验证文件。在验证成功之前，当前存档保持不变。
Проверить и восстановить|Validate and restore|验证并恢复
Не удалось импортировать: {reason}|Could not import: {reason}|无法导入：{reason}
Файл сохранения подготовлен.|The save file is ready.|存档文件已准备好。
Начать заново?|Start again?|重新开始？
Прогресс этого сценария будет заменён. Другие регионы и сложности сохранятся. Можно сначала экспортировать прохождение.|This scenario's progress will be replaced. Other regions and difficulties are kept. You can export your progress first.|本情景的进度将被替换。其他地区和难度的进度将保留。你可以先导出进度。
Другая сложность открывает отдельную партию и сохраняет текущую.|A different difficulty opens a separate game and keeps the current one.|不同难度会开启独立游戏，并保留当前游戏。
Начать текущий сценарий заново|Restart the current scenario|重新开始当前情景
Открыть выбранную партию|Open the selected game|打开所选游戏
Вводный сценарий требует исходные семь поселений Челябинской области|The tutorial requires the original seven settlements of Chelyabinsk Oblast|教学需要车里雅宾斯克州的七个原始聚落
В регионе нет известного положительного спроса внутри заданной границы|The region has no known positive demand inside the specified boundary|地区指定边界内没有已知的正需求
Исходный маршрут отсутствует в учебном графе|The initial route is missing from the educational network|教学网络中缺少初始路线
Расширяемый сценарный объект отсутствует|The scenario facility to expand is missing|情景中缺少要扩建的设施
Контрольный маршрут отсутствует в учебном графе|The reference route is missing from the educational network|教学网络中缺少参考路线
В дорожных условиях отсутствует участок|A segment is missing from the road conditions|道路条件中缺少路段
В дорожных условиях отсутствует расстояние|A distance is missing from the road conditions|道路条件中缺少距离
Исходный населённый пункт курируемого сценария отсутствует|The curated scenario's source settlement is missing|预设情景缺少原始聚落
Нет утверждённых локальных пакетов этого региона|No approved local scenarios are available for this region|此地区没有已批准的局部情景
Локальный пакет не соответствует исходной географии или графу|The local scenario does not match the source geography or network|局部情景与原始地理或网络不匹配
Нет исходной арктической локальной группы|The source Arctic settlement group is missing|缺少原始北极聚落组
Неизвестный режим сценария|Unknown scenario mode|无法识别情景模式
Для этого региона предусмотрен свободный режим|This region is available in free play|此地区可在自由游戏模式中使用
Эта версия сценария требует загрузки регионального плана связи|This scenario requires the regional connectivity plan to be loaded|此情景需要加载地区通信规划
Некорректный исходный маршрут|Invalid initial route|初始路线无效
Исходный маршрут отсутствует в направленной учебной сети|The initial route is missing from the directed educational network|教学有向网络中缺少初始路线
Выбранный участок сети ещё не работает|The selected network segment is not active yet|所选网络路段尚未运行
Некорректный файл регионального сценария|Invalid regional scenario file|地区情景文件无效
Не удалось загрузить региональный сценарий: HTTP {status}|Could not load the regional scenario: HTTP {status}|无法加载地区情景：HTTP {status}
Социальный сценарий не соответствует исходным данным или версии правил|The service scenario does not match the source data or rules version|服务情景与原始数据或规则版本不匹配
Повреждён социальный сценарий|The service scenario is damaged|服务情景已损坏
Повреждены начальные условия сложности|The difficulty's initial conditions are damaged|难度初始条件已损坏
Для региона ещё не подготовлена новая социальная сеть|The region's service network is not available yet|此地区的服务网络尚未准备好
Эта версия сценария требует загрузки социальной сети|This scenario requires the service network to be loaded|此情景需要加载服务网络
Неизвестный уровень сложности|Unknown difficulty level|无法识别难度
Неизвестная социальная услуга|Unknown public service|无法识别公共服务
Неизвестный объект|Unknown facility|无法识别设施
Не задан порог исходных вышек|The initial tower threshold is missing|缺少初始通信塔阈值
Некорректный состав исходных вышек|Invalid initial tower set|初始通信塔集合无效
Недоступен исходный транспортный граф|The source transport network is unavailable|无法获取原始交通网络
Некорректное транспортное ребро|Invalid transport segment|交通路段无效
Для региона отсутствуют фиксированные дорожные условия|The region's road conditions are missing|缺少地区道路条件
Исходный граф не соответствует дорожным условиям сценария|The source network does not match the scenario's road conditions|原始网络与情景道路条件不匹配
Повреждён каталог дорожных условий|The road-condition catalogue is damaged|道路条件目录已损坏
Контрольная сумма дорожных условий не совпадает|The road-condition integrity check failed|道路条件完整性检查失败
Дорожные условия не соответствуют каноническому сценарию|The road conditions do not match the canonical scenario|道路条件与标准情景不匹配
Для региона отсутствуют фиксированные расстояния|The region's distances are missing|缺少地区距离数据
Контрольная сумма региональных расстояний не совпадает|The regional distance integrity check failed|地区距离数据完整性检查失败
Исходный граф не соответствует расстояниям сценария|The source network does not match the scenario distances|原始网络与情景距离不匹配
Повреждён каталог региональных расстояний|The regional distance catalogue is damaged|地区距离目录已损坏
Нулевой участок не требует строительства дороги|A zero-length segment does not require road construction|零长度路段无需修建道路
Контрольная сумма дорожной политики не совпадает|The road-policy integrity check failed|道路规则完整性检查失败
Сначала загрузите расстояния сценария|Load the scenario distances first|请先加载情景距离数据
Расстояния не соответствуют каноническому сценарию|The distances do not match the canonical scenario|距离数据与标准情景不匹配
Не удалось загрузить план связи. Повторите загрузку региона.|Could not load the connectivity plan. Reload the region.|无法加载通信规划，请重新加载地区。
Не удалось загрузить транспортную сеть региона. Повторите загрузку.|Could not load the region's transport network. Retry loading.|无法加载地区交通网络，请重试。
Транспортные данные региона повреждены. Повторите загрузку.|The region's transport data is damaged. Retry loading.|地区交通数据已损坏，请重新加载。
Не удалось загрузить данные региона. Проверьте соединение и повторите загрузку.|Could not load the region data. Check your connection and retry.|无法加载地区数据，请检查网络连接并重试。
Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.|Could not calculate the game result. Return to the game list and reopen your saved game.|无法计算游戏结果，请返回游戏列表并重新打开已保存的游戏。
Сначала загрузите региональный план связи|Load the regional connectivity plan first|请先加载地区通信规划
Для региона отсутствует план связи|The region's connectivity plan is missing|缺少地区通信规划
Контрольная сумма плана связи не совпадает|The connectivity plan integrity check failed|通信规划完整性检查失败
Неизвестное дополнение региональных данных|Unknown regional data supplement|无法识别地区数据补充
Некорректный региональный набор|Invalid regional dataset|地区数据集无效
Данные федерального города изменены|The federal city data has changed|联邦直辖市数据已改变
Дополнение не должно добавлять вымышленные дороги|The supplement must not add invented roads|补充数据不得添加虚构道路
Некорректный дополненный граф|Invalid supplemented network|补充后的网络无效
Исходные транспортные связи изменены|The source transport connections have changed|原始交通连接已改变
`.trim().split('\n').map(line=>line.split('|'));

const dynamicEntries = `
К результатам|View results|查看结果
Бюджет исчерпан|Budget exhausted|预算已用尽
Остались бесплатные соединения. Можно продолжить или сохранить итог.|Free connections remain. Continue or save your result.|仍有免费连接可用。可继续操作或保存结果。
Доступных действий больше нет. Сохраните итог партии.|No actions remain. Save your game result.|没有可用操作。请保存游戏结果。
Завершить партию|Finish game|结束游戏
Расширить|Expand|扩建
Транспорт {transport} · Дорога {road} млн ₽|Transport {transport} · Road {road} million RUB|交通{transport} · 道路{road} 百万卢布
Изменение {change}% за 2010–2021 гг.|Change of {change}% in 2010–2021|2010–2021年变化{change}%
свободно {free} из {total} мест.|{free} of {total} places available.|共{total}个名额，空余{free}个。
{people} жителей получают дополнительный доступ. Полностью обеспечены ещё {count} поселений.|{people} residents gain additional access. {count} more settlements are fully served.|{people}名居民获得额外服务，另有{count}个聚落获得全面服务。
«Транспорт» запускает транспорт. Если требуется дорога, её строительство входит в ту же цену. Маршрут помогает и клинике, и школе, если у них есть свободные места. Сам по себе путь не создаёт учреждение. После первого поселения можно выбрать действующую линию. Ветка присоединится к узлу исходной сети; оплачиваются только новые участки.|Transport activates a transport connection. If a road is needed, its construction is included in the same price. A route supports both clinics and schools with spare capacity, but does not create a facility. After selecting the first settlement, you can select an active connection. The branch joins a source network node; only new segments are charged.|“交通”开通交通连接。如需修建道路，其建设费包含在该费用中。路线可同时支持有空余容量的诊所和学校，但不会创建设施。选择第一个聚落后，可选择已运行线路。支线接入原始网络节点，只支付新增路段的费用。
Связь есть только в зоне вышки. Исходная сеть зависит от выбранной сложности. Новая вышка — {amount}.|Connectivity is available only within a tower's coverage area. The initial network depends on difficulty. A new tower costs {amount}.|只有通信塔覆盖范围内才有通信服务。初始网络取决于难度。新通信塔费用为{amount}。
Запуск транспорта — {transport} ({transportRate}/км). Строительство дороги — {construction} ({constructionRate}/км). Итого — {total}.|Transport activation: {transport} ({transportRate}/km). Road construction: {construction} ({constructionRate}/km). Total: {total}.|开通交通：{transport}（{transportRate}/公里）。道路建设：{construction}（{constructionRate}/公里）。合计：{total}。
{service}: полностью обеспечено {covered} из {total} поселений ({percent}%)|{service}: {covered} of {total} settlements fully served ({percent}%)|{service}：{total}个聚落中有{covered}个获得全面服务（{percent}%）
{service}: удовлетворено {percent}% спроса|{service}: {percent}% of demand met|{service}：已满足{percent}%的需求
{service}: нет известного спроса|{service}: no known demand|{service}：无已知需求
Доля полностью обеспеченных поселений с известным спросом.|Share of settlements with known demand that are fully served.|需求已知的聚落中获得全面服务的比例。
Доля обслуженного спроса; для победы нужно всё.|Share of demand met; full coverage is required to win.|已满足需求的比例；获胜需要满足全部需求。
{service}: осталось {count} поселение|{service}: {count} settlement left|{service}：还剩{count}个聚落
{service}: осталось {count} поселения|{service}: {count} settlements left|{service}：还剩{count}个聚落
{service}: осталось {count} поселений|{service}: {count} settlements left|{service}：还剩{count}个聚落
≈ {distance} км · ≈ {minutes} мин на машине|≈ {distance} km · ≈ {minutes} min by car|约{distance}公里 · 驾车约{minutes}分钟
Транспорт {transport} · Дорога {construction} млн ₽|Transport {transport} · Road {construction} million RUB|交通{transport} · 道路{construction} 百万卢布
от {amount} млн / участок|from {amount} million / segment|每路段{amount}百万起
8 млн / участок|8 million / segment|每路段8百万
{distance} км от вышки — внутри радиуса {radius} км. Перекрытие с прежними зонами не считается повторно.|{distance} km from the tower, within its {radius} km radius. Overlap with existing coverage is not counted twice.|距通信塔{distance}公里，在{radius}公里半径内。与原有覆盖区域重叠的部分不重复计算。
{facility} в пункте {name}: есть доступный путь и свободные места|{facility} in {name}: an accessible route and spare capacity are available|{name}的{facility}：有可达路线和空余容量
≈ {distance} км · ≈ {minutes} мин на машине. Справочное время при {speed} км/ч; обеспеченность рассчитывается моделью доступности.|≈ {distance} km · ≈ {minutes} min by car. Indicative time at {speed} km/h; service coverage is calculated by the access model.|约{distance}公里 · 驾车约{minutes}分钟。参考车速为{speed}公里/小时；服务覆盖由可达性模型计算。
Время = расстояние / {speed} × 60.|Time = distance / {speed} × 60.|时间 = 距离 / {speed} × 60。
Весь путь — {distance} км. Новые участки — {fresh} км; строительство дороги — {construction} км.|Total route: {distance} km. New segments: {fresh} km; road construction: {construction} km.|全程{distance}公里，新增路段{fresh}公里，需修建道路{construction}公里。
Запуск транспорта — {transport}. Строительство дороги — {construction}. Итого — {total}.|Transport activation: {transport}. Road construction: {construction}. Total: {total}.|开通交通：{transport}。道路建设：{construction}。合计：{total}。
Пунктир — строительство дороги. Сплошная линия — готовая дорога; подсветка отмечает только новые участки.|Dashed lines mean road construction. Solid lines mean existing roads; highlighting marks only new segments.|虚线表示需修建道路，实线表示已有道路；高亮仅标出新增路段。
Пунктир — строительство дороги. Сплошная линия — готовая дорога; подсветка отмечает выбранный путь.|Dashed lines mean road construction. Solid lines mean existing roads; highlighting marks the selected route.|虚线表示需修建道路，实线表示已有道路；高亮标出所选路线。
Оплачиваются только новые участки пути: {amount}. Существующие участки используются бесплатно.|Only new route segments are charged: {amount}. Existing segments are free to use.|只支付新增路段费用：{amount}。已有路段可免费使用。
{minutes} мин|{minutes} min|{minutes}分钟
Лимит поездки до учреждения в модели: медицина — {medical}, досуг — {culture}, образование — {school}. Если путь превышает лимит, нужно учреждение ближе или подходящий маршрут.|Model travel-time limits: healthcare — {medical}, leisure — {culture}, education — {school}. If the route exceeds the limit, a closer facility or a suitable route is needed.|模型中的设施通行时间上限：医疗{medical}，文娱{culture}，教育{school}。若超出上限，则需要更近的设施或合适的路线。
Подготовленная партия · {count} поселений|Prepared game · {count} settlements|预设游戏 · {count}个聚落
Исходные вышки стоят в поселениях от {count} жителей.|Initial towers are placed in settlements with at least {count} residents.|初始通信塔设于人口不少于{count}人的聚落。
Новая вышка — {amount}.|A new tower costs {amount}.|新通信塔费用为{amount}。
Вышка покрывает поселения в учебном радиусе {radius} км. Повторное покрытие не добавляет жителей. Её можно поставить между поселениями. Подтверждается граница региона, но в поставке нет достоверной маски всех водоёмов.|A tower covers settlements within an educational radius of {radius} km. Overlapping coverage does not add residents again. You can place it between settlements. The region boundary is checked, but the data does not contain a reliable mask of all bodies of water.|通信塔覆盖教学设定半径{radius}公里内的聚落。重复覆盖不会重复增加居民，可将通信塔放在聚落之间。系统检查地区边界，但数据中没有可靠的完整水域范围。
{region}: связанные услуги|{region}: connected services|{region}：相互连接的服务
{region}: достройте сеть|{region}: complete the network|{region}：完善网络
{region}: учреждения и общая сеть|{region}: facilities and shared network|{region}：设施与共享网络
Не удалось открыть регион: {reason}. Текущая партия сохранена.|Could not open the region: {reason}. Your current game is saved.|无法打开地区：{reason}。当前游戏已保存。
Не удалось импортировать прохождение: {reason}. Текущая партия сохранена.|Could not import progress: {reason}. Your current game is saved.|无法导入进度：{reason}。当前游戏已保存。
`.trim().split('\n').map(line=>line.split('|'));

export const GAME_DICTIONARY = Object.freeze(Object.fromEntries([...entries,...errorEntries,...dynamicEntries].map(([ru,en,zh])=>[ru,Object.freeze({ru,en,'zh-Hans':zh})])));
export const visibleStrings = Object.freeze(Object.keys(GAME_DICTIONARY));

export function normalizeGameLocale(locale) {
  const value=String(locale||'ru').toLowerCase();
  return value.startsWith('zh')?'zh-Hans':value.startsWith('en')?'en':'ru';
}

const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const interpolate=(template,params)=>template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(token,key)=>Object.hasOwn(params,key)?String(params[key]):token);
function compileTemplate(source,template=source){
  const names=[];let previous=0,pattern='^';
  for(const match of template.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)){pattern+=escapeRegex(template.slice(previous,match.index))+'(.+?)';names.push(match[1]);previous=match.index+match[0].length;}
  pattern+=escapeRegex(template.slice(previous))+'$';
  return {source,names,pattern:new RegExp(pattern,'u')};
}
const templateLength=(a,b)=>b.source.replace(/\{[^}]+\}/g,'').length-a.source.replace(/\{[^}]+\}/g,'').length;
const templates=Object.keys(GAME_DICTIONARY).filter(key=>key.includes('{')).map(source=>compileTemplate(source)).sort(templateLength);
const reverseExact=new Map(Object.entries(GAME_DICTIONARY).flatMap(([source,values])=>source.includes('{')?[]:[[values.en,source],[values['zh-Hans'],source]]));
const reverseTemplates=templates.flatMap(({source})=>['en','zh-Hans'].map(locale=>compileTemplate(source,GAME_DICTIONARY[source][locale]))).sort(templateLength);
const serviceNames=new Set(['Связь','Медицина','Образование','Школа','Досуг','Культура']);
const vocabularyParameters=['service','facility','tool','region','reason','coverage','amount','transport','construction','transportRate','constructionRate','total','medical','culture','school'];
const diagnosticAliases=Object.freeze({
  'Invalid transport record':'Транспортные данные региона повреждены. Повторите загрузку.',
  'Failed to fetch':'Не удалось загрузить данные региона. Проверьте соединение и повторите загрузку.',
  'Load failed':'Не удалось загрузить данные региона. Проверьте соединение и повторите загрузку.',
  'Coverage evaluation is required':'Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.',
  'Invalid coverage evaluation':'Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.',
  'Unknown difficulty':'Неизвестный уровень сложности',
  'Platform completion requires a current regional party':'Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.',
  'Invalid party budget':'Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.',
  'Invalid transport policy':'Транспортные данные региона повреждены. Повторите загрузку.',
  'The regional party has no valid populated source point':'Не удалось рассчитать результат партии. Вернитесь к списку партий и откройте сохранённую партию.'
});

// A sentence translated explicitly before insertion may be seen by localize()
// for the first time in EN/ZH. Recover only a known complete template. This
// keeps open dialogs switchable without translating arbitrary text fragments.
function canonicalText(value,depth=0){
  if(Object.hasOwn(diagnosticAliases,value))return diagnosticAliases[value];
  if(/^Transport record HTTP \d{3}$/.test(value))return 'Не удалось загрузить транспортную сеть региона. Повторите загрузку.';
  if(/^HTTP \d{3}$/.test(value))return 'Не удалось загрузить данные региона. Проверьте соединение и повторите загрузку.';
  const exact=reverseExact.get(value);if(exact)return exact;
  const region=REGION_TRANSLATED_NAMES[value];if(region)return region.ru;
  if(depth>3)return value;
  for(const template of reverseTemplates){
    const match=template.pattern.exec(value);if(!match)continue;
    const params=Object.fromEntries(template.names.map((name,i)=>[name,match[i+1]]));
    for(const key of vocabularyParameters)if(params[key])params[key]=canonicalText(params[key],depth+1);
    return interpolate(template.source,params);
  }
  return value;
}

/** Known dynamic sentences only. Captured place names are deliberately opaque. */
export function createGameTranslator(initialLocale='ru') {
  let locale=normalizeGameLocale(initialLocale);
  const textSources=new WeakMap(),attributeSources=new WeakMap();
  function text(value,params) {
    const original=String(value??'');
    if(!original)return original;
    // A source-name <strong> is followed by a separate ': explanation' text
    // node. Keep that delimiter outside translated sentences whose parameters
    // move in Chinese (otherwise ': 6.2' becomes the distance parameter).
    const prefixed=!params&&/^(\s*:\s+)(\S[\s\S]*)$/.exec(original);
    if(prefixed)return prefixed[1]+text(prefixed[2]);
    const trimmed=original.trim(),source=GAME_DICTIONARY[trimmed]?trimmed:canonicalText(trimmed);
    if(params){const found=GAME_DICTIONARY[source];return interpolate(found?.[locale]||source,params);}
    const region=REGION_SOURCE_NAMES[source];if(region)return original.replace(trimmed,()=>region[locale]);
    const exact=GAME_DICTIONARY[source];
    if(exact)return original.replace(trimmed,()=>exact[locale]);
    for(const template of templates){
      const match=template.pattern.exec(source);if(!match)continue;
      const values=Object.fromEntries(template.names.map((name,i)=>[name,match[i+1]]));
      // These fields are UI vocabulary; names/counts are source data.
      for(const key of vocabularyParameters)if(values[key])values[key]=text(values[key]);
      return original.replace(trimmed,()=>interpolate(GAME_DICTIONARY[template.source][locale],values));
    }
    const service=/^(Связь|Медицина|Образование|Школа|Досуг|Культура): (.+)$/u.exec(source);
    if(service&&serviceNames.has(service[1]))return original.replace(source,()=>`${text(service[1])}: ${service[2]}`);
    const network=/^(.*?) → К сети(?: · (.+))?$/u.exec(source);
    if(network)return `${network[1]} → ${text('К сети')}${network[2]?' · '+network[2]:''}`;
    // A few UI paragraphs are deliberately composed from complete sentences.
    // Translate only if every fragment is recognized, never replace loose words.
    const sentences=source.split(/(?<=[.!?])\s+(?=[А-ЯЁ«])/u);
    if(sentences.length>1){const translated=sentences.map(part=>text(part));if(translated.every((part,i)=>part!==sentences[i]))return original.replace(source,()=>translated.join(' '));}
    return original.replace(trimmed,()=>source);
  }
  function localize(root) {
    if(!root)return;
    const excluded=node=>node?.closest?.('[data-source-name],[translate="no"],script,style,textarea');
    const visitText=node=>{
      if(excluded(node.parentElement))return;
      const previous=textSources.get(node),current=node.nodeValue;
      const source=previous&&current===previous.output?previous.source:current;
      const output=text(source);if(current!==output)node.nodeValue=output;
      textSources.set(node,{source,output});
    };
    const visitElement=element=>{
      if(excluded(element))return;
      let sources=attributeSources.get(element);if(!sources){sources=new Map();attributeSources.set(element,sources);}
      for(const attr of ['aria-label','title','placeholder','alt']){
        if(!element.hasAttribute(attr))continue;
        const current=element.getAttribute(attr),previous=sources.get(attr);
        const source=previous&&current===previous.output?previous.source:current,output=text(source);
        if(current!==output)element.setAttribute(attr,output);sources.set(attr,{source,output});
      }
    };
    if(root.nodeType===1)visitElement(root);
    const document=root.ownerDocument||globalThis.document;
    const walker=document.createTreeWalker(root,5); // SHOW_ELEMENT | SHOW_TEXT
    let node;while((node=walker.nextNode())){if(node.nodeType===3)visitText(node);else visitElement(node);}
  }
  return Object.freeze({
    text,localize,translateDOM:localize,
    setLocale(value){locale=normalizeGameLocale(value);return locale;},
    layerLabel(id){
      const source={population:'Население',telecom:'Связь',medical:'Медицина',school:'Школа',culture:'Культура'}[id];
      // Compact visible labels; each button retains its full translated aria-label.
      return locale==='en'?{population:'People',telecom:'Telecom',medical:'Health',school:'School',culture:'Culture'}[id]||text(source):text(source);
    },
    get locale(){return locale;},
    number(value,options={}){return new Intl.NumberFormat(locale==='ru'?'ru-RU':locale==='en'?'en-GB':'zh-CN',options).format(value);},
    regionName(region){const record=REGION_NAMES[typeof region==='string'?region:region?.id];return record?.[locale]||region?.name||String(region??'');}
  });
}

const regionEntries = `
altayskiy_kray|Алтайский край|Altai Krai|阿尔泰边疆区
amurskaya_oblast|Амурская область|Amur Oblast|阿穆尔州
arkhangelskaya_oblast|Архангельская область|Arkhangelsk Oblast|阿尔汉格尔斯克州
astrakhanskaya_oblast|Астраханская область|Astrakhan Oblast|阿斯特拉罕州
belgorodskaya_oblast|Белгородская область|Belgorod Oblast|别尔哥罗德州
bryanskaya_oblast|Брянская область|Bryansk Oblast|布良斯克州
vladimirskaya_oblast|Владимирская область|Vladimir Oblast|弗拉基米尔州
volgogradskaya_oblast|Волгоградская область|Volgograd Oblast|伏尔加格勒州
vologodskaya_oblast|Вологодская область|Vologda Oblast|沃洛格达州
voronezhskaya_oblast|Воронежская область|Voronezh Oblast|沃罗涅日州
evreyskaya_avtonomnaya_oblast|Еврейская автономная область|Jewish Autonomous Oblast|犹太自治州
zabaykalskiy_kray|Забайкальский край|Zabaykalsky Krai|外贝加尔边疆区
ivanovskaya_oblast|Ивановская область|Ivanovo Oblast|伊万诺沃州
irkutskaya_oblast|Иркутская область|Irkutsk Oblast|伊尔库茨克州
kabardino_balkarskaya_respublika|Кабардино-Балкарская республика|Kabardino-Balkarian Republic|卡巴尔达-巴尔卡尔共和国
kaliningradskaya_oblast|Калининградская область|Kaliningrad Oblast|加里宁格勒州
kaluzhskaya_oblast|Калужская область|Kaluga Oblast|卡卢加州
kamchatskiy_kray|Камчатский край|Kamchatka Krai|堪察加边疆区
karachaevo_cherkesskaya_respublika|Карачаево-Черкесская республика|Karachay-Cherkess Republic|卡拉恰伊-切尔克斯共和国
kemerovskaya_oblast|Кемеровская область|Kemerovo Oblast|克麦罗沃州
kirovskaya_oblast|Кировская область|Kirov Oblast|基洛夫州
kostromskaya_oblast|Костромская область|Kostroma Oblast|科斯特罗马州
krasnodarskiy_kray|Краснодарский край|Krasnodar Krai|克拉斯诺达尔边疆区
krasnoyarskiy_kray|Красноярский край|Krasnoyarsk Krai|克拉斯诺亚尔斯克边疆区
kurganskaya_oblast|Курганская область|Kurgan Oblast|库尔干州
kurskaya_oblast|Курская область|Kursk Oblast|库尔斯克州
leningradskaya_oblast|Ленинградская область и Санкт-Петербург|Leningrad Oblast and Saint Petersburg|列宁格勒州与圣彼得堡
lipetskaya_oblast|Липецкая область|Lipetsk Oblast|利佩茨克州
magadanskaya_oblast|Магаданская область|Magadan Oblast|马加丹州
moskovskaya_oblast|Московская область и Москва|Moscow Oblast and Moscow|莫斯科州与莫斯科
murmanskaya_oblast|Мурманская область|Murmansk Oblast|摩尔曼斯克州
nenetskiy_avtonomnyy_okrug|Ненецкий автономный округ|Nenets Autonomous Okrug|涅涅茨自治区
nizhegorodskaya_oblast|Нижегородская область|Nizhny Novgorod Oblast|下诺夫哥罗德州
novgorodskaya_oblast|Новгородская область|Novgorod Oblast|诺夫哥罗德州
novosibirskaya_oblast|Новосибирская область|Novosibirsk Oblast|新西伯利亚州
omskaya_oblast|Омская область|Omsk Oblast|鄂木斯克州
orenburgskaya_oblast|Оренбургская область|Orenburg Oblast|奥伦堡州
orlovskaya_oblast|Орловская область|Oryol Oblast|奥廖尔州
penzenskaya_oblast|Пензенская область|Penza Oblast|奔萨州
permskiy_kray|Пермский край|Perm Krai|彼尔姆边疆区
primorskiy_kray|Приморский край|Primorsky Krai|滨海边疆区
pskovskaya_oblast|Псковская область|Pskov Oblast|普斯科夫州
respublika_adygeya|Республика Адыгея|Republic of Adygea|阿迪格共和国
respublika_altay|Республика Алтай|Altai Republic|阿尔泰共和国
respublika_bashkortostan|Республика Башкортостан|Republic of Bashkortostan|巴什科尔托斯坦共和国
respublika_buryatiya|Республика Бурятия|Republic of Buryatia|布里亚特共和国
respublika_dagestan|Республика Дагестан|Republic of Dagestan|达吉斯坦共和国
respublika_ingushetiya|Республика Ингушетия|Republic of Ingushetia|印古什共和国
respublika_kalmykiya|Республика Калмыкия|Republic of Kalmykia|卡尔梅克共和国
respublika_kareliya|Республика Карелия|Republic of Karelia|卡累利阿共和国
respublika_komi|Республика Коми|Komi Republic|科米共和国
respublika_krym|Республика Крым и Севастополь|Republic of Crimea and Sevastopol|克里米亚共和国与塞瓦斯托波尔
respublika_mariy_el|Республика Марий Эл|Mari El Republic|马里埃尔共和国
respublika_mordoviya|Республика Мордовия|Republic of Mordovia|莫尔多瓦共和国
respublika_sakha_yakutiya|Республика Саха (Якутия)|Sakha Republic (Yakutia)|萨哈共和国（雅库特）
respublika_severnaya_osetiya_alaniya|Республика Северная Осетия - Алания|Republic of North Ossetia–Alania|北奥塞梯-阿兰共和国
respublika_tatarstan|Республика Татарстан|Republic of Tatarstan|鞑靼斯坦共和国
respublika_tyva|Республика Тыва|Tuva Republic|图瓦共和国
respublika_khakasiya|Республика Хакасия|Republic of Khakassia|哈卡斯共和国
rostovskaya_oblast|Ростовская область|Rostov Oblast|罗斯托夫州
ryazanskaya_oblast|Рязанская область|Ryazan Oblast|梁赞州
samarskaya_oblast|Самарская область|Samara Oblast|萨马拉州
saratovskaya_oblast|Саратовская область|Saratov Oblast|萨拉托夫州
sakhalinskaya_oblast|Сахалинская область|Sakhalin Oblast|萨哈林州
sverdlovskaya_oblast|Свердловская область|Sverdlovsk Oblast|斯维尔德洛夫斯克州
smolenskaya_oblast|Смоленская область|Smolensk Oblast|斯摩棱斯克州
stavropolskiy_kray|Ставропольский край|Stavropol Krai|斯塔夫罗波尔边疆区
tambovskaya_oblast|Тамбовская область|Tambov Oblast|坦波夫州
tverskaya_oblast|Тверская область|Tver Oblast|特维尔州
tomskaya_oblast|Томская область|Tomsk Oblast|托木斯克州
tulskaya_oblast|Тульская область|Tula Oblast|图拉州
tyumenskaya_oblast|Тюменская область|Tyumen Oblast|秋明州
udmurtskaya_respublika|Удмуртская республика|Udmurt Republic|乌德穆尔特共和国
ulyanovskaya_oblast|Ульяновская область|Ulyanovsk Oblast|乌里扬诺夫斯克州
khabarovskiy_kray|Хабаровский край|Khabarovsk Krai|哈巴罗夫斯克边疆区
khanty_mansiyskiy_avtonomnyy_okrug_yugra|Ханты-Мансийский автономный округ - Югра|Khanty-Mansi Autonomous Okrug–Yugra|汉特-曼西自治区—尤格拉
chelyabinskaya_oblast|Челябинская область|Chelyabinsk Oblast|车里雅宾斯克州
chechenskaya_respublika|Чеченская республика|Chechen Republic|车臣共和国
chuvashskaya_respublika|Чувашская республика|Chuvash Republic|楚瓦什共和国
chukotskiy_avtonomnyy_okrug|Чукотский автономный округ|Chukotka Autonomous Okrug|楚科奇自治区
yamalo_nenetskiy_avtonomnyy_okrug|Ямало-Ненецкий автономный округ|Yamalo-Nenets Autonomous Okrug|亚马尔-涅涅茨自治区
yaroslavskaya_oblast|Ярославская область|Yaroslavl Oblast|雅罗斯拉夫尔州
`.trim().split('\n').map(line=>line.split('|'));
export const REGION_NAMES=Object.freeze(Object.fromEntries(regionEntries.map(([id,ru,en,zh])=>[id,Object.freeze({ru,en,'zh-Hans':zh})])));
const REGION_SOURCE_NAMES=Object.freeze(Object.fromEntries(Object.values(REGION_NAMES).map(region=>[region.ru,region])));
const REGION_TRANSLATED_NAMES=Object.freeze(Object.fromEntries(Object.values(REGION_NAMES).flatMap(region=>[[region.en,region],[region['zh-Hans'],region]])));
