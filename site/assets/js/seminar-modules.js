// A seminar's identity follows its work and history, independently of topic order.
const LEGACY_MODULES = Object.freeze({
  'seminar-1':'quiz', 'seminar-2':'maps', 'seminar-3':'settlements',
  'seminar-4':'legal-lab', 'seminar-5':'reception', 'seminar-6':'career',
  'seminar-7':'governor', 'seminar-8':'final'
});

export function seminarModule(topic) {
  return topic?.seminar?.module || LEGACY_MODULES[topic?.seminar?.slug] || null;
}

export function seminarTopic(course, module) {
  return course?.topics?.find(topic => seminarModule(topic) === module);
}

export function seminarModuleForSlug(course, slug) {
  return seminarModule(course?.topics?.find(topic => topic.seminar?.slug === slug));
}
