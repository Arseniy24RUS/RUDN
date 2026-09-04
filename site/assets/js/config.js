export const CONFIG = {
  version: '1.1.11-pages',
  repository: 'https://github.com/Arseniy24RUS/RUDN',
  pagesUrl: 'https://arseniy24rus.github.io/RUDN/',
  adminEmails: ['omnistat@yandex.ru'],
  firebase: {
    apiKey: 'AIzaSyBH5MD8tpcV2DSFiE7K4FLzfUIYPNfHYHQ',
    authDomain: 'rudn-gmu-learning-platform.firebaseapp.com',
    projectId: 'rudn-gmu-learning-platform',
    storageBucket: 'rudn-gmu-learning-platform.firebasestorage.app',
    messagingSenderId: '921604605680',
    appId: '1:921604605680:web:4e859d51e628cb925f6435',
    databaseURL: 'https://rudn-gmu-learning-platform-default-rtdb.europe-west1.firebasedatabase.app/'
  },
  rootPath: 'rudn-platform/v1',
  groupPrefix: 'ГГУбд',
  groupCount: 6,
  live: {revealRatio: 0.7, revealAfterMs: 45000},
  simulatorResultsUrl: 'https://government-budget-simulator-default-rtdb.europe-west1.firebasedatabase.app/results.json',
  activityMax: {
    'lecture-1':5,'lecture-2':5,'lecture-3':5,'lecture-4':5,'lecture-5':5,'lecture-6':5,'lecture-7':5,'lecture-8':5,
    'seminar-1':5,'seminar-2':5,'seminar-3':5,'seminar-4':5,'seminar-5':5,'seminar-6':5,'seminar-7':5,'seminar-8':5,
    'exam':20
  }
};
