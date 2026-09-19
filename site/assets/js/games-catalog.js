import {academicContext,topicGate} from './access.js?v=1.3.8';

/** Free-play entries. Students unlock each module with its course topic. */
export const GAMES_COPY = {
  ru: { title: 'Игры', lead: 'Исследуйте, пробуйте разные решения и играйте снова. Все модули доступны без расписания и без оценки в журнале.', play: 'Играть', back: 'К играм', free: 'Свободная игра', guest: 'Можно играть без входа: гостевой прогресс сохраняется на этом устройстве отдельно от профиля. Для синхронизации результатов войдите перед началом игры.' },
  en: { title: 'Games', lead: 'Explore, try different decisions and play again. Every module is available at any time, without a course grade.', play: 'Play', back: 'Back to games', free: 'Free play', guest: 'Play without signing in: guest progress stays on this device, separate from your profile. To sync results, sign in before starting a game.' },
  zh: { title: '游戏', lead: '探索、尝试不同决策并反复体验。所有模块随时开放，不计入课程成绩。', play: '开始游戏', back: '返回游戏', free: '自由体验', guest: '无需登录即可体验：访客进度保存在此设备上，与账号进度分开。若要同步结果，请在开始游戏前登录。' },
};

export const GAMES = [
  { id: 'maps', href: '#puzzle', icon: '◎', title: 'Географический паззл', title_en: 'Geography puzzle', title_zh: '地理拼图', description: 'Соберите страны мира, регионы стран и муниципалитеты России. Выберите карту и сложность.', description_en: 'Assemble countries, their regions and Russian municipalities. Choose your map and difficulty.', description_zh: '拼合世界各国、各国行政区及俄罗斯市政单位，选择地图和难度。' },
  { id: 'governor', href: 'apps/governor/index.html?context=free', icon: '▥', title: 'Симулятор губернатора', title_en: 'Governor simulator', title_zh: '行政长官模拟器', description: 'Управляйте регионом, распределяйте бюджет и исследуйте последствия своих решений в новой кампании.', description_en: 'Govern a region, allocate its budget and explore the consequences of your decisions in a new campaign.', description_zh: '管理地区、分配预算，在新任期中探索决策带来的影响。' },
  { id: 'reception', href: '#games/reception', icon: '✉', title: 'Работа с обращениями граждан', title_en: 'Citizens’ appeals', title_zh: '公民诉求办理', description: 'Откройте приёмную, выберите сюжет или случайную смену и отработайте действия на разных обращениях.', description_en: 'Open the reception office, choose a case or a random shift and practise handling different appeals.', description_zh: '进入接待室，选择案例或随机班次，练习处理不同的公民诉求。' },
  { id: 'career', href: '#games/career', icon: '◇', title: 'Профориентационный тест', title_en: 'Career exploration', title_zh: '职业倾向测试', description: 'Исследуйте профессиональные интересы, сравнивайте направления работы и пробуйте практические сценарии.', description_en: 'Explore your professional interests, compare careers and try practical scenarios.', description_zh: '探索职业兴趣，比较工作方向，并体验实践情景。' },
];

const GAME_TOPICS={maps:2,reception:5,career:6,governor:7};
export const GAMES_STUDENT_LEAD={
  ru:'Играйте без оценки в журнале. Игры открываются вместе с соответствующими разделами курса.',
  en:'Play without a course grade. Games unlock together with their course sections.',
  zh:'游戏不计入课程成绩，并随相应课程章节开放。',
};

/** Use the same server-adjusted time and instructor overrides as the course. */
export function gameAccessGate(id,backend){
  if(backend.isAdmin()||!backend.getProfile()||!GAME_TOPICS[id])return null;
  const now=backend.globalNow();
  return topicGate(GAME_TOPICS[id],backend.getAccessOverrides(academicContext(now).startYear),now);
}
