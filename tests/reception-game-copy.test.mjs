import test from 'node:test';
import assert from 'node:assert/strict';
import {gameCopy} from '../site/apps/reception/localization/game-copy.js';

const roles = {
  ru: {
    before: 'Уточняет идентификатор объекта и передаёт сведения диспетчеру. Не меняет режим сигналов самостоятельно.',
    notice: 'Учебное дело.',
    instruction: 'Вы готовите проект решения в пределах указанной роли.',
    disclaimer: 'Реальные обращения и звонки не отправляются.',
    legacy: ['Вымышленное дело.', 'Вымышленное учебное дело.', 'дело.', 'Дело.'],
  },
  en: {
    before: 'Clarifies the object identifier and forwards information to the dispatcher. Does not independently change signal operation.',
    notice: 'Training case.',
    instruction: 'Prepare a proposed decision within the stated role.',
    disclaimer: 'No real appeals or calls are sent.',
    legacy: ['A fictional case.', 'Fictional training case.', 'case.', 'Case.'],
  },
  zh: {
    before: '核实设施标识并向调度员传递信息，不自行改变信号运行。',
    notice: '教学案例。',
    instruction: '请在所述岗位权限内拟定处理方案。',
    disclaimer: '',
    legacy: ['虚构案例。', '虚构教学案例。', '案例。', '案件。'],
  },
};

for (const [locale, role] of Object.entries(roles)) {
  test(`${locale}: appended case notice leaves all role instructions intact`, () => {
    const authored = `${role.before}\n\n${role.notice} ${role.instruction} ${role.disclaimer}`.trim();
    const expected = `${role.before}\n\n${role.instruction}`;
    assert.equal(gameCopy(authored, locale), expected);
    assert.equal(gameCopy(gameCopy(authored, locale), locale), expected);
  });

  test(`${locale}: current and previously shortened notices work at every sentence position`, () => {
    for (const notice of [role.notice, ...role.legacy]) {
      for (const prefix of ['', `${role.before} `, `${role.before}\n\n`]) {
        assert.equal(gameCopy(`${prefix}${notice} ${role.instruction}`, locale), `${prefix}${role.instruction}`);
      }
    }
  });

  test(`${locale}: unrelated case text and intentionally wrong actions stay unchanged`, () => {
    const plain = {
      ru: ['Дело. Проверьте материалы.', 'Подготовить вымышленные документы и скрыть факты'],
      en: ['Case. Review the materials.', 'Prepare fictional documents and hide the facts'],
      zh: ['案例。检查材料。', '准备虚构文件并隐瞒事实'],
    }[locale];
    for (const value of plain) assert.equal(gameCopy(value, locale), value);
  });
}
