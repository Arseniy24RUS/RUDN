import {readFile, writeFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [federal, regional, territories, symbols, courseSymbols] = await Promise.all([
  load('site/apps/career/data/authorities.json'),
  load('site/apps/career/data/territorial-authorities.json'),
  load('site/apps/career/data/territories.json'),
  load('site/apps/career/data/authority-symbols.json'),
  load('site/data/symbol_manifest.json'),
]);
const career = new Map([...federal, ...regional.authorities].map(row => [row.id, row]));
const federalSource = {
  fas:'https://fas.gov.ru/', fns:'https://www.nalog.gov.ru/', fssp:'https://fssp.gov.ru/', fts:'https://customs.gov.ru/', mchs:'https://mchs.gov.ru/',
  mvd:'https://мвд.рф/', rkn:'https://rkn.gov.ru/', rosgvardiya:'https://rosguard.gov.ru/', rosobrnadzor:'https://obrnadzor.gov.ru/',
  rosprirodnadzor:'https://rpn.gov.ru/', rosreestr:'https://rosreestr.gov.ru/', rosselkhoznadzor:'https://fsvps.gov.ru/',
  rospotrebnadzor:'https://rospotrebnadzor.ru/', rostransnadzor:'https://rostransnadzor.gov.ru/', rostrud:'https://rostrud.gov.ru/', sfr:'https://sfr.gov.ru/',
};
const cityRegions = {
  'ru-77':['Москва','Moscow','莫斯科'], 'ru-50':['Красногорск','Krasnogorsk','克拉斯诺戈尔斯克'], 'ru-69':['Тверь','Tver','特维尔'],
  'ru-40':['Калуга','Kaluga','卡卢加'], 'ru-16':['Казань','Kazan','喀山'], 'ru-78':['Санкт-Петербург','Saint Petersburg','圣彼得堡'],
  'ru-52':['Нижний Новгород','Nizhny Novgorod','下诺夫哥罗德'], 'ru-54':['Новосибирск','Novosibirsk','新西伯利亚'],
  'ru-66':['Екатеринбург','Yekaterinburg','叶卡捷琳堡'], 'ru-61':['Ростов-на-Дону','Rostov-on-Don','顿河畔罗斯托夫'],
  'ru-67':['Смоленск','Smolensk','斯摩棱斯克'],
};
const regionalIds = {
  'mos-transit':'ru-77-departament-transporta-i-razvitiya-dorozhno-transportnoy-infrastruktury-goroda-moskvy',
  'mos-environment':'ru-77-departament-prirodopolzovaniya-i-okhrany-okruzhayushchey-sredy-goroda-moskvy',
  'mos-heritage':'ru-77-departament-kulturnogo-naslediya-goroda-moskvy',
  'mos-education':'ru-77-departament-obrazovaniya-i-nauki-goroda-moskvy',
  'mos-streets':'ru-77-obedinenie-administrativno-tekhnicheskikh-inspektsiy-goroda-moskvy',
  'mos-utilities':'ru-77-departament-zhilishchno-kommunalnogo-khozyaystva-goroda-moskvy',
  'mos-health':'ru-77-departament-zdravookhraneniya-goroda-moskvy',
  'mo-silence':'ru-50-ministerstvo-po-soderzhaniyu-territoriy-i-gosudarstvennomu-zhilishchnomu-nadzoru-moskovskoy-oblasti',
  'mo-environment':'ru-50-ministerstvo-ekologii-i-prirodopolzovaniya-moskovskoy-oblasti',
  'mo-transit':'ru-50-ministerstvo-transporta-i-dorozhnoy-infrastruktury-moskovskoy-oblasti',
  'tver-environment':'ru-69-ministerstvo-prirodnykh-resursov-i-ekologii-tverskoy-oblasti',
};
const regionalShort = {'mos-transit':'Дептранс Москвы','mos-heritage':'Мосгорнаследие','mos-education':'ДОНМ','mos-streets':'ОАТИ Москвы','mos-utilities':'ДЖКХ Москвы','mos-health':'ДЗМ','mo-silence':'МСТ МО','tver-environment':'Минприроды Тверской области'};
const regionalSources = {'mos-environment':'https://www.mos.ru/eco/','mos-heritage':'https://www.mos.ru/dkn/','mos-education':'https://www.mos.ru/donm/','mos-streets':'https://www.mos.ru/oati/','mos-utilities':'https://www.mos.ru/dgkh/','mos-health':'https://www.mos.ru/dzdrav/','mo-silence':'https://mstg.mosreg.ru/','tver-environment':'https://mfc-tver.ru/services/detail.php?ELEMENT_ID=54262&subserviceid=0&targetid=0'};
const siteEmblem = id => symbols.symbols[id] ? posix.normalize('apps/career/' + symbols.symbols[id].src) : null;
const localityEmblem = {'ru-77':courseSymbols.moscow_government.local_file,'ru-16':courseSymbols.tatarstan_cabinet.local_file};
const catalogue = new Map();
function put(id, row) {
  if (catalogue.has(id)) throw Error(`Duplicate authority ${id}`);
  catalogue.set(id, {id, ...row});
}
for (const {id,name,shortName,governmentUrl} of federal) {
  put(id, {name, shortName, territoryIds:[], emblem:siteEmblem(id), source:federalSource[id] || governmentUrl});
}
for (const [id, sourceId] of Object.entries(regionalIds)) {
  const {name, shortName, regionId, sourceUrl} = career.get(sourceId);
  put(id, {name, shortName:shortName || regionalShort[id] || '', territoryIds:[regionId], emblem:localityEmblem[regionId] || null, source:regionalSources[id] || sourceUrl, careerId:sourceId});
}
const offices = [
  ['rpn-moscow-kaluga','Межрегиональное управление Федеральной службы по надзору в сфере природопользования по г. Москве и Калужской области','Росприроднадзор — Москва и Калужская область',['ru-77','ru-40'],'rosprirodnadzor','https://rpn.gov.ru/regions/77/contacts/'],
  ['rpn-mo-smolensk','Межрегиональное управление Федеральной службы по надзору в сфере природопользования по Московской и Смоленской областям','Росприроднадзор — Московская и Смоленская области',['ru-50','ru-67'],'rosprirodnadzor','https://rpn.gov.ru/regions/67/contacts/'],
  ['rpn-upper-volga','Верхне-Волжское межрегиональное управление Федеральной службы по надзору в сфере природопользования','Верхне-Волжское управление Росприроднадзора',['ru-69'],'rosprirodnadzor','https://rpn.gov.ru/regions/76/contacts/'],
  ['rpn-at-site','Территориальный орган Росприроднадзора по месту объекта','Росприроднадзор по месту объекта',[],'rosprirodnadzor','https://rpn.gov.ru/regions/'],
  ['rkn-central','Управление Федеральной службы по надзору в сфере связи, информационных технологий и массовых коммуникаций по Центральному федеральному округу','Управление Роскомнадзора по ЦФО',['ru-77','ru-50'],'rkn','https://77.rkn.gov.ru/'],
  ['rkn-at-site','Территориальный орган Роскомнадзора по месту деятельности оператора','Территориальный Роскомнадзор',[],'rkn','https://rkn.gov.ru/'],
  ['fas-moscow','Управление Федеральной антимонопольной службы по г. Москве','Московское УФАС России',['ru-77'],'fas','https://moscow.fas.gov.ru/'],
  ['fas-mo','Управление Федеральной антимонопольной службы по Московской области','Московское областное УФАС России',['ru-50'],'fas','https://mo.fas.gov.ru/'],
  ['fas-at-site','Территориальный орган Федеральной антимонопольной службы по рекламному эпизоду','Территориальное УФАС',[],'fas','https://fas.gov.ru/'],
  ['rpn-consumer-moscow','Управление Федеральной службы по надзору в сфере защиты прав потребителей и благополучия человека по городу Москве','Управление Роспотребнадзора по г. Москве',['ru-77'],'rospotrebnadzor','https://77.rospotrebnadzor.ru/'],
  ['rpn-consumer-mo','Управление Федеральной службы по надзору в сфере защиты прав потребителей и благополучия человека по Московской области','Управление Роспотребнадзора по Московской области',['ru-50'],'rospotrebnadzor','https://50.rospotrebnadzor.ru/'],
  ['rpn-consumer-at-site','Территориальный орган Роспотребнадзора по месту объекта','Территориальный Роспотребнадзор',[],'rospotrebnadzor','https://rospotrebnadzor.ru/'],
  ['git-moscow','Государственная инспекция труда в городе Москве','ГИТ в г. Москве',['ru-77'],'rostrud','https://git77.rostrud.gov.ru/'],
  ['git-mo','Государственная инспекция труда в Московской области','ГИТ в Московской области',['ru-50'],'rostrud','https://git50.rostrud.gov.ru/'],
  ['git-employer','Государственная инспекция труда по месту работодателя','ГИТ по месту работодателя',[],'rostrud','https://rostrud.gov.ru/'],
  ['fssp-office','Подразделение Федеральной службы судебных приставов, ведущее исполнительное производство','Подразделение ФССП России',[],'fssp','https://fssp.gov.ru/'],
  ['fssp-superior','Вышестоящее должностное лицо Федеральной службы судебных приставов','Вышестоящий руководитель ФССП',[],'fssp','https://fssp.gov.ru/'],
  ['sfr-office','Территориальное отделение Фонда пенсионного и социального страхования Российской Федерации','Отделение СФР',[],'sfr','https://sfr.gov.ru/branches/'],
  ['registry-office','Территориальный орган Федеральной службы государственной регистрации, кадастра и картографии','Территориальный Росреестр',[],'rosreestr','https://rosreestr.gov.ru/'],
  ['fire-oversight','Территориальное подразделение государственного пожарного надзора МЧС России','Государственный пожарный надзор',[],'mchs','https://mchs.gov.ru/'],
  ['guard-oversight','Территориальное подразделение лицензионно-разрешительной работы Росгвардии','ЛРР Росгвардии',[],'rosgvardiya','https://rosguard.gov.ru/'],
  ['police-at-site','Территориальное подразделение органов внутренних дел по месту события','Полиция по месту события',[],'mvd','https://мвд.рф/'],
  ['police-moscow','Главное управление Министерства внутренних дел Российской Федерации по городу Москве','ГУ МВД России по г. Москве',['ru-77'],'mvd','https://77.мвд.рф/'],
  ['phyto-office','Территориальное управление Федеральной службы по ветеринарному и фитосанитарному надзору','Территориальный Россельхознадзор',[],'rosselkhoznadzor','https://fsvps.gov.ru/'],
  ['tax-office','Инспекция Федеральной налоговой службы, рассматривающая декларацию или заявление','ИФНС по делу',[],'fns','https://www.nalog.gov.ru/'],
  ['customs-office','Таможенный орган, указанный в проверенном уведомлении','Таможенный орган по уведомлению',[],'fts','https://customs.gov.ru/'],
  ['mos-nizhegorodsky-council','Аппарат Совета депутатов муниципального округа Нижегородский в городе Москве','Аппарат Совета депутатов МО Нижегородский',['ru-77'],null,'https://www.mun-nizh.ru/'],
  ['mos-nizhegorodsky-uprava','Управа Нижегородского района города Москвы','Управа Нижегородского района',['ru-77'],null,'https://nizhegorodsky.mos.ru/'],
];
for (const [id,name,shortName,territoryIds,parentId,source] of offices) {
  put(id, {name,shortName,territoryIds,emblem:parentId?siteEmblem(parentId):localityEmblem[territoryIds[0]] || null,source,parentId});
}
const caseRoles = [
  ['reception-unit','Уполномоченное подразделение органа, получившего обращение','Профильное подразделение'],
  ['independent-review','Руководитель или независимое уполномоченное подразделение получившего органа','Независимое рассмотрение'],
  ['mfc-manager','Руководитель многофункционального центра, работник которого совершил действие','Руководитель МФЦ'],
  ['mfc-founder','Орган государственной власти или местного самоуправления — учредитель данного многофункционального центра','Учредитель МФЦ'],
  ['mfc-issuer','Уполномоченный орган, предоставляющий услугу и выдавший результат','Орган — поставщик услуги'],
  ['info-holder','Орган или подразделение, располагающее запрошенной публичной информацией','Обладатель информации'],
  ['deciding-court','Суд, вынесший судебный акт по делу','Суд, рассмотревший дело'],
  ['court-guidance','Приёмная, получившая обращение, для разъяснения порядка обращения в суд','Приёмная — разъяснение'],
  ['duty-service','Оперативная дежурно-диспетчерская служба по месту события','Дежурная служба'],
  ['fire-dispatch','Пожарно-спасательная служба по месту события','Дежурная пожарная служба'],
  ['gas-dispatch','Аварийно-диспетчерская служба газораспределительной организации','Аварийная газовая служба'],
  ['gas-operator','Газораспределительная организация, зарегистрировавшая сообщение','Газовая служба по карточке'],
  ['medical-dispatch','Служба скорой медицинской помощи по месту события','Скорая медицинская помощь'],
  ['network-duty','Дежурно-диспетчерская служба по принадлежности инженерной сети','Дежурная инженерной сети'],
  ['road-owner','Владелец дороги или уполномоченная дорожная служба по месту объекта','Дорожная служба'],
  ['transport-local','Профильный орган организации движения по месту события','Транспортный орган'],
  ['green-local','Уполномоченное подразделение по содержанию зелёных насаждений по месту объекта','Служба зелёных насаждений'],
  ['municipal-amenities','Уполномоченный орган местного самоуправления по благоустройству','Муниципальное благоустройство'],
  ['municipal-waste','Уполномоченный муниципальный организатор места накопления отходов','Муниципальный организатор площадки'],
  ['regional-environment','Региональный орган государственного экологического надзора по месту объекта','Региональный экологический надзор'],
  ['clarify-environment','Подразделение получившего органа для установления объекта и компетентного экологического надзора','Уточнение экологической компетенции'],
  ['municipal-signs','Городское подразделение по размещению вывесок и благоустройству','Городское подразделение по вывескам'],
  ['municipal-light','Профильное подразделение наружного освещения по месту объекта','Служба наружного освещения'],
  ['regional-heritage','Региональный орган государственной охраны объектов культурного наследия по месту объекта','Региональный орган охраны наследия'],
  ['regional-education','Лицензирующий орган исполнительной власти субъекта Российской Федерации в сфере образования','Региональный орган лицензирования образования'],
  ['education-verify','Уполномоченное подразделение приёмной для проверки исполнителя и записи реестра','Проверка реестра образования'],
  ['medical-authority','Региональный орган управления здравоохранением по месту оказания помощи','Региональный орган здравоохранения'],
  ['medical-insurer','Страховая медицинская организация, защищающая права застрахованного по ОМС','Страховая медицинская организация'],
  ['medical-clinic','Медицинская организация, в которой заявитель записывается на приём','Медицинская организация'],
  ['personal-data-operator','Уполномоченный сотрудник организации — оператора персональных данных','Оператор персональных данных'],
  ['carrier','Авиаперевозчик, выполняющий перевозку по билету','Авиаперевозчик'],
  ['ticket-agent','Продавец или агент, получивший обращение о продаже билета','Агент по продаже билета'],
  ['postal-operator','Оператор почтовой связи, принявший или доставляющий отправление','Почтовый оператор'],
  ['creditor','Кредитор по договору, получивший заявление застрахованного заёмщика','Кредитор по договору'],
  ['insurer','Страховщик по индивидуальному договору страхования','Страховщик по договору'],
  ['map-operator','Оператор публичного картографического сервиса, отображающего сведения','Оператор картографического сервиса'],
  ['object-fire-safety','Ответственный за пожарную безопасность объекта','Ответственный за объект'],
  ['employer','Работодатель, ответственный за выплату своей части пособия','Работодатель'],
];
for (const [id,name,shortName] of caseRoles) put(id, {name,shortName,territoryIds:[],emblem:null,source:null});

// Reuse one displayed record for each authority with an existing Reception ID.
const aliases = Object.fromEntries(Object.entries(regionalIds).map(([id, sourceId]) => [sourceId, id]));
const answerDirectory = Object.fromEntries([...catalogue].map(([id, {name,shortName,territoryIds}]) => [id,{id,name,shortName,territoryId:territoryIds[0] || null}]));
for (const {id,name,shortName,regionId} of regional.authorities) {
  if (Object.hasOwn(aliases,id)) continue;
  put(id, {name,shortName:shortName || '',territoryIds:regionId?[regionId]:[],emblem:siteEmblem(id)});
}

const regionData = Object.fromEntries(territories.map(row => {
  const city = cityRegions[row.id];
  return [row.id, {name:{ru:row.name,en:row.name_en,zh:row.name_zh}, ...(city?{city:{ru:city[0],en:city[1],zh:city[2]}}:{})}];
}));
const correspondenceRegions = Object.fromEntries(Object.entries(regionData).filter(([,row]) => row.city));
const asRows = rows => '[\n  ' + rows.map(row => JSON.stringify(row)).join(',\n  ') + '\n]';
const files = [
  ['site/apps/reception/ai/authority-directory.js',`export const RECEPTION_TERRITORIES = ${JSON.stringify(regionData, null, 2)};\nexport const RECEPTION_AUTHORITIES = ${asRows([...catalogue.values()])};\n`],
  ['firebase/functions/reception-ai/routing-directory.mjs',`export const ROUTING_TERRITORIES = ${JSON.stringify(correspondenceRegions, null, 2)};\nexport const ROUTING_AUTHORITIES = ${JSON.stringify(answerDirectory, null, 2)};\nexport const ROUTING_AUTHORITY_ALIASES = ${JSON.stringify(aliases, null, 2)};\nexport const ROUTING_AUTHORITY_IDS = new Set(${asRows([...catalogue.keys(), ...Object.keys(aliases)])});\n`],
];
const check = process.argv.includes('--check');
for (const [path,data] of files) {
  const url = new URL(path, root);
  const output = '// Generated by scripts/build-reception-routing-directory.mjs.\n' + data;
  if (check) {
    if ((await readFile(url,'utf8')).replaceAll('\r\n','\n') !== output) throw Error(`Outdated ${fileURLToPath(url)}`);
  } else await writeFile(url, output);
}
