export const CONFIG = {
  version: '1.1.3-pages',
  repository: 'https://github.com/Arseniy24RUS/RUDN',
  pagesUrl: 'https://arseniy24rus.github.io/RUDN/',
  adminEmails: ['omnistat@yandex.ru'],
  firebase: {
    apiKey: 'AIzaSyCsHMYznP5Li-wNNYjxPRKiWjd1jo5UQ54',
    authDomain: 'russian-regions-puzzle.firebaseapp.com',
    projectId: 'russian-regions-puzzle',
    storageBucket: 'russian-regions-puzzle.firebasestorage.app',
    messagingSenderId: '352890491256',
    appId: '1:352890491256:web:db8388a1fc4810cdcaf88d',
    measurementId: 'G-60BX1RW10B',
    databaseURL: 'https://russian-regions-puzzle-default-rtdb.firebaseio.com/'
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
