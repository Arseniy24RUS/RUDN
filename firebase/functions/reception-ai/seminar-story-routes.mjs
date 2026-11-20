// Additional direct recipients supported by the exhibits in the revised seminar bank.
// Alternative sets are case-specific. The original suggested route stays first.
export const additionalStoryRoutes = {
  'ads-channel-scope': {
    recipients:[['fas-moscow', 'rkn-central']],
    sources:[
      'https://mintrud.gov.ru/docs/laws/130',
    ],
  },
  'driver-planned-extension': {
    recipients:[['rostransnadzor'], ['git-moscow', 'rostransnadzor']],
    sources:[
      'https://rostransnadzor.gov.ru/news/502',
      'https://publication.pravo.gov.ru/document/0001202605180007',
    ],
  },
  'driver-shifts': {
    recipients:[['git-moscow', 'rostransnadzor']],
    sources:[
      'https://rostransnadzor.gov.ru/news/502',
      'https://git27.rostrud.gov.ru/upload/iblock/908/prikaz-rostruda-ot-11_11_2022-n-253-ob-utverzhdenii-rukovods.pdf',
    ],
  },
  'driver-split-break': {
    recipients:[['rostransnadzor'], ['git-mo', 'rostransnadzor']],
    sources:[
      'https://rostransnadzor.gov.ru/news/502',
      'https://publication.pravo.gov.ru/document/0001202605180007',
    ],
  },
  'flight-cancel-nonrefundable': {
    recipients:[['rostransnadzor'], ['rostransnadzor', 'rpn-consumer-moscow']],
    sources:[
      'https://zpp.rospotrebnadzor.ru/news/federal/325376',
      'https://zpp.rospotrebnadzor.ru/news/federal/570956',
      'https://favt.gov.ru/dokumenty-federalnye-pravila/?from=old-site',
    ],
  },
  'flight-weather-care': {
    recipients:[['rpn-consumer-moscow'], ['rostransnadzor', 'rpn-consumer-moscow']],
    sources:[
      'https://zpp.rospotrebnadzor.ru/news/federal/325376',
      'https://epp.genproc.gov.ru/ru/dvtp/activity/legal-education/explain/e8424972/',
      'https://favt.gov.ru/dokumenty-federalnye-pravila/?from=old-site',
    ],
  },
  'gas-address-correction': {
    recipients:[['mos-system112']],
    sources:[
      'https://www.mos-gaz.ru/individuals/info/accident',
    ],
  },
  'guard-property-inspection': {
    recipients:[['mos-rosgvardiya']],
    sources:[
      'https://rosguard.gov.ru/ru/page/index/kontrol-za-chastnoj-detektivnoj-sysknoj-i-oxrannoj-deyatelnostyu',
    ],
  },
  'hatch-barrier': {
    recipients:[['mos-streets'], ['mos-streets', 'mos-mosvodokanal']],
    sources:[
      'https://www.mos.ru/upload/documents/oiv/08092009-_-960_pp%281%29.pdf',
      'https://www.mos.ru/upload/documents/files/173/PostanovleniePravitelstvaMoskvi284-pp.pdf',
    ],
  },
  'hatch-known-owner': {
    recipients:[['mos-mosvodokanal', 'mos-system112']],
    sources:[
      'https://transport.mos.ru/mostrans/all_news/53836',
    ],
  },
  'hatch-network': {
    recipients:[['mos-system112', 'mos-mosvodokanal']],
    sources:[
      'https://transport.mos.ru/mostrans/all_news/53836',
    ],
  },
  'landfill-current-burning': {
    recipients:[['mos-system112']],
    sources:[
      'https://moscow.mchs.gov.ru/kontakty',
    ],
  },
  'privacy-aggregate': {
    recipients:[['rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'privacy-consent-scope': {
    recipients:[['rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'privacy-withdrawal': {
    recipients:[['rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'privacy': {
    recipients:[['rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'several-issues': {
    recipients:[['mos-transit', 'rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'several-minimum-attachments': {
    recipients:[['mo-transit', 'rkn']],
    sources:[
      'https://rkn.gov.ru/treatments/ask-question/',
    ],
  },
  'several-repair-and-complaint': {
    recipients:[['mos-gormost-road', 'mos-utilities']],
    sources:[
      'https://www.mos.ru/upload/documents/oiv/gbu_mats%281%29.pdf',
      'https://www.mos.ru/upload/documents/files/5813/PostanovleniePravitelstvaMoskviot01062012N252-PP%28r.pdf',
      'https://epp.genproc.gov.ru/ru/proc_71/activity/legal-education/explain/e1293315/',
    ],
  },
  'sidewalk-boundary': {
    recipients:[['mos-streets', 'mos-gormost-road']],
    sources:[
      'https://www.mos.ru/upload/documents/files/173/PostanovleniePravitelstvaMoskvi284-pp.pdf',
      'https://www.mos.ru/upload/documents/oiv/08092009-_-960_pp%281%29.pdf',
    ],
  },
  'sidewalk-safe-detour': {
    recipients:[['mos-streets'], ['mos-streets', 'mos-gormost-road']],
    sources:[
      'https://www.mos.ru/upload/documents/files/173/PostanovleniePravitelstvaMoskvi284-pp.pdf',
      'https://www.mos.ru/upload/documents/oiv/08092009-_-960_pp%281%29.pdf',
    ],
  },
  'sign-night-measurement': {
    recipients:[['rpn-consumer-moscow'], ['mos-streets'], ['mos-signs-department', 'rpn-consumer-moscow']],
    sources:[
      'https://www.mos.ru/upload/content/files/4f445c58c222c9e7d4613f659b00f19c/PPMot25dekabrya2013gN902PP%2812072024%29.pdf',
      'https://publication.pravo.gov.ru/Document/View/0001202102030022',
      'https://zpp.rospotrebnadzor.ru/Forum/Appeals/Details/12391',
    ],
  },
  'sign-not-ad': {
    recipients:[['mos-signs-department'], ['rpn-consumer-moscow'], ['mos-streets']],
    sources:[
      'https://www.mos.ru/upload/content/files/4f445c58c222c9e7d4613f659b00f19c/PPMot25dekabrya2013gN902PP%2812072024%29.pdf',
      'https://publication.pravo.gov.ru/Document/View/0001202102030022',
      'https://zpp.rospotrebnadzor.ru/Forum/Appeals/Details/12391',
    ],
  },
  'sign-promotion': {
    recipients:[['fas-moscow', 'rpn-consumer-moscow']],
    sources:[
      'https://www.mos.ru/upload/content/files/4f445c58c222c9e7d4613f659b00f19c/PPMot25dekabrya2013gN902PP%2812072024%29.pdf',
      'https://publication.pravo.gov.ru/Document/View/0001202102030022',
      'https://zpp.rospotrebnadzor.ru/Forum/Appeals/Details/12391',
    ],
  },
};
