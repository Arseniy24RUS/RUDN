/* Static shell and accessible names; never touches user input or live campaign content. */
(function(root){
 'use strict';const G=root.GovernorGame,records=new WeakMap();
 const labels=[
  ['Образовательная платформа РУДН','RUDN learning platform','RUDN教学平台'],
  ['РУДН','RUDN University','RUDN大学'],
  ['Навигация курса','Course navigation','课程导航'],
  ['Переключить язык','Switch language','切换语言'],
  ['Звуки интерфейса','Interface sounds','界面音效'],
  ['Иллюстрированная карта пяти территорий Новой области','Illustrated map of the five districts of Novaya Oblast','新州五个地区的插画地图'],
  ['Возможности версии','Version features','版本功能'],
  ['Симулятор губернатора','Governor simulator','州长模拟器'],
  ['Ресурсы кампании','Campaign resources','任期进程资源'],
  ['Открыть главное меню','Open the main menu','打开主菜单'],
  ['Основные ресурсы','Core resources','主要资源'],
  ['Открыть казначейство','Open the treasury','打开财政管理'],
  ['Прогресс главы','Chapter progress','章节进度'],
  ['Профиль игрока','Player profile','玩家资料'],
  ['Разделы игры','Game sections','游戏分区'],
  ['Стилизованная карта Новой области','Stylised map of Novaya Oblast','新州风格化地图'],
  ['Варианты решения','Decision options','决策选项'],
  ['Прогресс текущей миссии','Current mission progress','当前任务进度'],
  ['Мобильная навигация','Mobile navigation','移动端导航'],
  ['Советник','Adviser','顾问'],
  ['Закрыть','Close','关闭'],
  ['Территория и проекты','District and projects','地区与项目'],
  ['Вернуться в раздел 7','Return to section 7','返回第7单元']
 ];
 const map=new Map(labels.map(row=>[row[0],row]));
 const pick=(row,lang)=>row[{ru:0,en:1,zh:2}[G.I18n.normalize(lang)]];
 function shell(doc,lang){
  for(const element of doc.querySelectorAll('[aria-label],[alt],[title]')){
   let attrs=records.get(element);
   if(!attrs){attrs=[];for(const attr of ['aria-label','alt','title']){const row=map.get(element.getAttribute(attr));if(row)attrs.push([attr,row]);}records.set(element,attrs);}
   for(const [attr,row]of attrs)element.setAttribute(attr,pick(row,lang));
  }
  for(const [selector,key]of [['.platform-loading h1','Симулятор губернатора'],['#platform-loading-back','Вернуться в раздел 7'],['#platform-submission-close','Закрыть']]){
   const element=doc.querySelector(selector);if(element)element.textContent=pick(map.get(key),lang);
  }
  for(const image of doc.querySelectorAll('.platform-brand img,.start-logo,.topbar-logo')){
   image.src=new URL(lang==='ru'?'../../assets/img/rudn-logo.png':'../../assets/img/rudn-logo-en.png',doc.baseURI).href;
   image.alt=lang==='ru'?'РУДН':'RUDN University';
  }
 }
 G.I18n.shell=shell;G.I18n.shellLabels=labels;
})(typeof window!=='undefined'?window:globalThis);
