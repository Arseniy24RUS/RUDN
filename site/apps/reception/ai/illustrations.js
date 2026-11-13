import {resourceURL} from '../../../assets/js/release-resources.js';
import {GFX_EVIDENCE} from '../js/graphics-data.js';
import {icon} from './cabinet-icons.js';
import {localized, normalizeLocale} from './copy.js';

const copy = {
  ru: {gallery:'Иллюстрации к делу', open:'Увеличить изображение', close:'Закрыть изображение'},
  en: {gallery:'Case illustrations', open:'Enlarge image', close:'Close image'},
  zh: {gallery:'案例图片', open:'放大图片', close:'关闭图片'},
};
const escapeAttribute = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const assetURL = path => resourceURL('../' + path, import.meta.url).href;
const localImage = /^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/;

const bankByCase = new Map();
for (const illustration of GFX_EVIDENCE) {
  if (!illustration.approved) continue;
  if (!bankByCase.has(illustration.caseId)) bankByCase.set(illustration.caseId, new Map());
  const documents = bankByCase.get(illustration.caseId);
  if (!documents.has(illustration.documentId)) documents.set(illustration.documentId, []);
  documents.get(illustration.documentId).push(illustration);
}

// These descriptions are duplicated by the matched illustration. Keep the date,
// provenance, and limits on what the photograph establishes in the document.
const photoTextEdits = new Map([
  ['hatch/photo', {
    ru: [/^Учебное описание фотографии: на пешеходной дорожке открытый колодец без ограждения\. /, ''],
    en: [/^Training description of the photograph: an open manhole without a barrier on a pedestrian path\. /, ''],
    zh: [/^教学用照片描述：人行道上有一口敞开的检查井，未设置围挡。/, ''],
  }],
  ['hatch-barrier/photo', {
    ru: [/^Учебное описание снимка от (\d{2}\.\d{2}\.\d{4}): крышка установлена, ограждение перекрывает дорожку\. /, 'Дата снимка $1. '],
    en: [/^Training description of a photograph dated (\d{2}\.\d{2}\.\d{4}): the cover is installed and the barrier blocks the path\. /, 'Photograph taken on $1. '],
    zh: [/^(\d{2}\.\d{2}\.\d{4}) 照片的教学描述：井盖已安装，围挡堵住了道路。/, '拍摄日期为 $1。'],
  }],
  ['river-observation/observation', {
    ru: [/^Учебная фотография от (\d{2}\.\d{2}\.\d{4}): у выпуска трубы видна вода тёмного цвета\. /, 'Дата снимка $1. '],
    en: [/^Training photograph dated (\d{2}\.\d{2}\.\d{4}): dark water is visible at a pipe outfall\. /, 'Photograph taken on $1. '],
    zh: [/^(\d{2}\.\d{2}\.\d{4})的教学照片显示，管道排水口有深色水流。/, '拍摄日期为 $1。'],
  }],
]);

const translatedAlt = {
  E01__1: {en:'An open circular manhole is on the pedestrian path without a barrier.', zh:'人行道上有一个敞开的圆形检查井，旁边没有围挡。'},
  E01__2: {en:'The manhole cover is in place and metal barrier sections block the path.', zh:'井盖已安装，金属围挡堵住了道路。'},
  E24__1: {en:'Dark water flows from a pipe near the riverbank.', zh:'深色水流从河岸边的管道流出。'},
  E24__3: {en:'A wide view of the pipe, riverbank and river. The upstream source is out of view.', zh:'管道、河岸及河流全景。照片没有显示管道上游的水源。'},
};

export function illustratedDocumentText(caseId, document, locale) {
  const language = normalizeLocale(locale), text = localized(document.text, language);
  if (!bankByCase.get(caseId)?.has(document.id)) return text;
  const edit = photoTextEdits.get(`${caseId}/${document.id}`)?.[language];
  return edit ? text.replace(...edit) : text;
}

export function caseIllustrations(caseId, documents = []) {
  const bank = bankByCase.get(caseId);
  return documents.flatMap(document => {
    const illustrations = bank?.get(document.id);
    if (illustrations) return illustrations.map(({id, alt}) => ({
      id, documentId:document.id, title:document.title, alt,
      thumbnail:assetURL(`assets/gfx1/evidence/${id}__w420.webp`),
      full:assetURL(`assets/gfx1/evidence/${id}__w832.webp`),
    }));
    if (typeof document.image !== 'string' || !localImage.test(document.image)) return [];
    const url = assetURL(document.image);
    return [{id:`document-${document.id}`, documentId:document.id, title:document.title, thumbnail:url, full:url}];
  });
}

function imageLabel(illustration, language) {
  const description = language === 'ru' ? illustration.alt : translatedAlt[illustration.id]?.[language];
  return description || localized(illustration.title, language) || copy[language].gallery;
}

export function renderIllustrationThumbnails(illustrations, {locale} = {}) {
  if (!illustrations.length) return '';
  const language = normalizeLocale(locale), labels = copy[language];
  const buttons = illustrations.map(illustration => {
    const label = `${labels.open} · ${imageLabel(illustration, language)}`;
    return `<button class="rxa-illustration-thumbnail" type="button" data-action="illustration-open" data-id="${escapeAttribute(illustration.id)}" aria-haspopup="dialog" aria-label="${escapeAttribute(label)}"><img src="${escapeAttribute(illustration.thumbnail)}" alt="" loading="lazy" decoding="async"><span aria-hidden="true">${icon('out')}</span></button>`;
  }).join('');
  return `<div class="rxa-case-illustrations" role="group" aria-label="${escapeAttribute(labels.gallery)}">${buttons}</div>`;
}

export function createIllustrationViewer(root) {
  const document = root.ownerDocument;
  let dialog;

  function destroy() {
    dialog?.remove();
    dialog = undefined;
  }

  function open(illustration, {locale, trigger} = {}) {
    if (!illustration || dialog) return;
    const language = normalizeLocale(locale), labels = copy[language];
    const viewer = document.createElement('dialog');
    viewer.className = 'rxa-illustration-dialog';
    viewer.setAttribute('aria-label', localized(illustration.title, language) || labels.gallery);

    const finish = () => {
      if (dialog !== viewer) return;
      if (viewer.open) viewer.close();
      destroy();
      const currentTrigger = trigger?.isConnected ? trigger : Array.from(root.querySelectorAll('[data-action="illustration-open"]')).find(button => button.dataset.id === illustration.id);
      currentTrigger?.focus({preventScroll:true});
    };

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.autofocus = true;
    closeButton.setAttribute('aria-label', labels.close);
    closeButton.innerHTML = icon('close');
    closeButton.addEventListener('click', finish);

    const image = document.createElement('img');
    image.alt = imageLabel(illustration, language);
    image.src = illustration.full;

    viewer.append(closeButton, image);
    viewer.addEventListener('click', event => {
      if (event.target !== viewer) return;
      const box = viewer.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) finish();
    });
    viewer.addEventListener('cancel', event => {event.preventDefault();finish();});
    document.body.append(viewer);
    viewer.showModal();
    dialog = viewer;
  }

  return {open, destroy};
}
