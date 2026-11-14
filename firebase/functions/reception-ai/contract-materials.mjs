/** Authorized supplementary reading materials; no assessment facts or mutations. */
const SOURCE_SHA256 = 'd0f32b375be23b1e97960580f82830d9b03538d81b71f2f881086ee2d54a0e90';

export function buildConflictContractMaterials(c) {
  if (c?.id !== 'conflict-relative' || c?.provenance?.sourceSHA256 !== SOURCE_SHA256) return [];
  return [
    {
      id: 'supplement-contract',
      title: {ru: 'Договор на ремонт прихожей — извлечение', en: 'Entrance hall renovation contract — extract', zh: '门厅装修合同摘录'},
      type: {ru: 'Договор', en: 'Contract', zh: '合同'},
      text: {
        ru: 'Заказчик: заявитель. Подрядчик: ООО «Городской мастер».\n\n1. Предмет договора. Подрядчик обязуется выполнить ремонт прихожей квартиры заказчика: подготовить стены к окраске, окрасить стены и установить напольные плинтусы. Заказчик обязуется принять выполненные работы и оплатить их на условиях договора.\n\n2. Цена. Согласованная общая цена работ и материалов составляет 120 000 (сто двадцать тысяч) рублей. Изменение состава работ и цены оформляется письменным соглашением сторон.\n\n3. Исполнение. Стороны согласуют доступ в квартиру и порядок выполнения работ. Передача результата и замечания к нему оформляются сторонами письменно.\n\n4. Общение сторон. Вопросы по исполнению договора стороны направляют друг другу в письменной форме.\n\nИзвлечение содержит условия договора; сведения о фактическом выполнении работ, оплате и результате рассмотрения замечаний в него не включены.',
        en: 'Customer: the applicant. Contractor: Gorodskoy Master LLC.\n\n1. Subject. The contractor undertakes to renovate the entrance hall of the customer’s apartment: prepare and paint the walls and install floor skirting boards. The customer undertakes to accept the completed work and pay for it under the contract.\n\n2. Price. The agreed total price for work and materials is RUB 120,000 (one hundred and twenty thousand). Changes to the scope and price require a written agreement between the parties.\n\n3. Performance. The parties agree on access to the apartment and the arrangements for carrying out the work. Handover of the result and any comments are recorded in writing by the parties.\n\n4. Communication. The parties send questions about performance of the contract to each other in writing.\n\nThis extract contains contract terms; it does not include information about work actually performed, payments or the outcome of any comments.',
        zh: '委托人：申请人。承包商：Gorodskoy Master 有限责任公司。\n\n1. 合同标的。承包商负责装修委托人公寓的门厅：进行墙面涂刷前处理、涂刷墙面并安装地面踢脚线。委托人按合同条件验收已完成的工程并支付价款。\n\n2. 价款。双方约定的工程及材料总价为120,000（十二万）俄罗斯卢布。工程范围及价款的变更须由双方书面约定。\n\n3. 履行。双方商定进入公寓及施工的安排。工程成果的交付及相关意见由双方书面记录。\n\n4. 沟通。双方以书面形式向对方提出有关合同履行的问题。\n\n本摘录载明合同条件，不包含实际施工、付款或相关意见处理结果的信息。'
      },
      initial: true,
      factIds: []
    },
    {
      id: 'supplement-correspondence',
      title: {ru: 'Переписка по договору', en: 'Contract correspondence', zh: '合同往来函件'},
      type: {ru: 'Переписка', en: 'Correspondence', zh: '往来函件'},
      text: {
        ru: 'Заявитель → ООО «Городской мастер»\nПрошу пояснить порядок исполнения договора на ремонт прихожей моей квартиры. Направляю договор и прошу дать письменный ответ по моему вопросу.\n\nООО «Городской мастер» → заявителю\nВаше сообщение и приложенные документы получены. Ваш вопрос принят к рассмотрению. Ответ по существу будет направлен отдельно.\n\nСумма 120 000 рублей в приложенном договоре — согласованная цена работ и материалов. Она не является сама по себе суммой денежных требований заявителя. В этой переписке отдельная сумма денежных требований не указана.',
        en: 'Applicant → Gorodskoy Master LLC\nPlease clarify the arrangements for performing the contract to renovate the entrance hall of my apartment. I am sending the contract and request a written response to my question.\n\nGorodskoy Master LLC → applicant\nYour message and attached documents have been received. Your question has been accepted for consideration. A substantive response will be sent separately.\n\nRUB 120,000 in the attached contract is the agreed price of work and materials. It is not, by itself, the amount of any monetary claim by the applicant. No separate monetary claim amount is stated in this correspondence.',
        zh: '申请人 → Gorodskoy Master 有限责任公司\n请说明我家公寓门厅装修合同的履行安排。现发送合同，请就我的问题给予书面答复。\n\nGorodskoy Master 有限责任公司 → 申请人\n已收到您的来信及所附文件。您的问题已受理，将另行给予实质性答复。\n\n所附合同中的120,000卢布是双方约定的工程及材料价款。该价款本身并不等于申请人的金钱请求金额。本往来函件未列明单独的金钱请求金额。'
      },
      initial: true,
      factIds: []
    }
  ];
}
