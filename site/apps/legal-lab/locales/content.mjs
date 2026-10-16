// UI overlays preserve canonical answer values and IDs.
const rows = [
['S01','Орган-издатель указан сверху. Подпись подтверждает принятие акта, но не заменяет название органа.','Who issued this document?','The issuing authority is named at the top. The signature does not replace its name.','这份文件由哪个机关发布？','发布机关名称位于上部，签名不能替代机关名称。'],
['S02','Дата акта стоит рядом с номером. Дата регистрации или ознакомления относится к другому действию.','Where is the document date?','The act date is beside its number. Registration and acknowledgement dates record different events.','文件日期在哪里？','文件日期与编号相邻。登记日期或签收日期记录的是其他行为。'],
['S03','Номер в строке с датой и знаком № идентифицирует сам акт, а не приложение.','Where is the document number?','The number beside the date and № identifies the act itself, not an attachment.','文件编号在哪里？','日期旁“№”后的编号标识文件本身，而不是附件。'],
['S04','Нужен номер приказа в строке с его датой. Номер государственной регистрации относится к регистрации акта.','Where is the order’s own number?','Select the order number beside its date, not the state registration number.','命令本身的编号在哪里？','应选择命令日期旁的编号，而不是国家登记编号。'],
['S05','Гриф утверждения на приложении называет акт, которым утверждено положение. Заголовок положения этих реквизитов не заменяет.','Which act approved these regulations?','The approval block identifies the approving act. The regulations’ heading does not replace those details.','本规定由哪一文件批准？','批准标记注明批准本规定的文件，规定标题不能替代这些信息。'],
['S06','Подпись лица, издавшего акт, находится после основного текста. Отметка об ознакомлении адресата выполняет другую функцию.','Where is the official’s signature?','The issuing official signs below the main text. The recipient’s acknowledgement serves a different purpose.','负责人签名在哪里？','发布文件的负责人在正文下方签名，收件人的签收标记具有不同作用。'],
['T01',null,'Which type of act is used here?','The President approved this strategy by decree. Compare the issuer, heading and act type in the original.','这里使用的是哪一类法律文件？','总统以总统令批准战略。请对照原件的发布机关、标题和文件类型。'],
['T02',null,'Which type of act is used here?','The Government used an executive order for this individual appointment.','这里使用的是哪一类法律文件？','政府以指令办理这项具体人事任命。'],
['T03',null,'Which type of act is used here?','The ministry used a ministerial order. Such orders can regulate matters beyond the ministry’s own staff.','这里使用的是哪一类法律文件？','该部使用部门命令。部门命令的适用范围可以超出部门内部人员事务。'],
['T04',null,'Which type of act is used here?','The district administration head amended internal work rules by administrative order.','这里使用的是哪一类法律文件？','区行政机关负责人以行政命令修改内部工作规则。'],
['T05',null,'Which type of act is used here?','The President granted this individual commendation by executive order.','这里使用的是哪一类法律文件？','总统以指令作出这项具体表彰。'],
['T06',null,'Which type of act is used here?','The Government regulated these state supervision matters by resolution.','这里使用的是哪一类法律文件？','政府以决议规范此项国家监督事务。'],
['T07',null,'Which type of act is used here?','The council of deputies approved the commission regulations by decision.','这里使用的是哪一类法律文件？','代表委员会以决定批准委员会工作规定。'],
['T08',null,'Which type of act is used here?','Executive order No. 4146-r approved the strategy. Government executive orders also address nationwide matters.','这里使用的是哪一类法律文件？','第4146-р号指令批准战略。政府指令也可涉及全国性事务。'],
['Q01','Статья 10 называет законодательную, исполнительную и судебную власть и самостоятельность их органов. Нужен весь перечень.','Into which branches is state power divided?','Article 10 names legislative, executive and judicial power and the independence of their bodies. The complete list is needed.','国家权力分为哪些分支？','第10条列出立法权、行政权和司法权，并规定其机关独立行使职权。答案应包含全部三项。'],
['Q02','Часть 1 статьи 132 перечисляет муниципальную собственность, бюджет, местные налоги и сборы и иные вопросы местного значения.','Which matters do local self-government bodies decide independently?','Article 132(1) lists municipal property, the local budget, local taxes and charges, and other local matters.','地方自治机关独立处理哪些事项？','第132条第1款列出市政财产、地方预算、地方税费和其他地方性事务。'],
['Q03','Часть 3 статьи 132 прямо включает местное самоуправление и государственные органы в единую систему публичной власти.','Are local self-government bodies part of the unified system of public authority?','Article 132(3) expressly includes local self-government and state bodies in the unified system of public authority.','地方自治机关是否属于统一公共权力体系？','第132条第3款明确将地方自治机关和国家机关纳入统一公共权力体系。'],
['Q04','По части 1 статьи 2.3 КоАП РФ важен возраст на момент правонарушения: шестнадцать лет.','At what age can a person incur administrative liability?','Article 2.3(1) sets the age at sixteen, measured when the offence was committed.','行政责任年龄从几岁开始？','第2.3条第1款规定为十六周岁，以违法行为发生时的年龄为准。'],
['Q05','Статья 2.2 описывает обе формы вины: умысел и неосторожность. Одной части недостаточно.','Which forms of fault does the Code recognise?','Article 2.2 defines intent and negligence. Selecting only one part leaves the answer incomplete.','法典规定了哪些过错形式？','第2.2条规定故意和过失，仅选择其中一款则答案不完整。'],
['Q06','Часть 1 статьи 1.5 требует установления вины. Наличие последствий само по себе её не устанавливает.','Can a person be held liable without establishing fault?','Article 1.5(1) requires established fault. Harmful consequences alone do not establish fault.','能否在未确定过错的情况下追究责任？','第1.5条第1款要求确定过错。损害后果本身不能替代过错认定。'],
['Q07','Цель Стратегии — сбалансированная система расселения и территориальная организация экономики для национальных целей и безопасности.','What is the goal of Russia’s spatial development?','The goal is a balanced settlement system and territorial organisation of the economy supporting national goals and security.','俄罗斯空间发展的目标是什么？','目标是形成均衡的居民点体系和经济地域组织，促进国家目标实现并保障国家安全。'],
['Q08','Опорный пункт связан с приоритетным развитием и доступностью услуг для прилегающей территории. Одной численности населения недостаточно.','What qualifies as a key settlement?','The definition links a key settlement to priority development and services for the surrounding area. Population size alone is insufficient.','什么是支撑性居民点？','定义强调优先发展及为周边地区提供服务，不能仅凭人口规模判断。'],
['Q09','Пункт 2 поручает подготовить проект плана Минэкономразвития России совместно с заинтересованными федеральными органами.','Which ministry must prepare the Strategy’s implementation plan?','Paragraph 2 assigns the draft plan to the Ministry of Economic Development with the relevant federal bodies.','哪个部负责制定战略实施计划？','第2项将计划草案交给俄罗斯经济发展部，并要求与相关联邦机关协作。'],
['Q10','Часть 3 статьи 9 перечисляет пять групп. Не смешивайте группы с категориями должностей.','Which groups of civil service positions does the law establish?','Article 9(3) lists five groups. Groups are distinct from position categories.','法律规定了哪些文职公务员职务组别？','第9条第3款列出五个组别。职务组别不同于职务类别。'],
['Q11','Нужны оба условия: предварительное уведомление представителя нанимателя и отсутствие конфликта интересов.','May a civil servant undertake other paid work?','Both conditions matter: prior notification of the employer’s representative and no conflict of interest.','文职公务员能否从事其他有偿工作？','须事先通知用人方代表，且不得产生利益冲突，两个条件均不可遗漏。'],
['Q12','Членство в профсоюзе прямо названо среди прав гражданского служащего.','May a civil servant join a trade union?','Trade union membership is expressly listed among a civil servant’s rights.','文职公务员能否加入工会？','加入工会被明确列为文职公务员的权利。'],
['Q13','Полный перечень: высшие, главные, ведущие, старшие и младшие должности.','Which groups of municipal service positions does the law establish?','The complete list is highest, principal, leading, senior and junior positions.','法律规定了哪些市政公务员职务组别？','完整清单包括最高、主要、骨干、高级和初级职务。'],
['Q14','Уведомление должно быть предварительным и письменным; конфликт интересов недопустим. Норма отдельно исключает главу администрации по контракту.','May a municipal servant undertake other paid work?','Prior written notification and no conflict of interest are required. An administration head serving under contract is expressly excluded.','市政公务员能否从事其他有偿工作？','须事先书面通知且不得产生利益冲突，按合同任职的行政机关负责人属于特别例外。'],
['Q15','Аттестация проводится один раз в три года для проверки соответствия должности.','How often is a municipal servant assessed?','Assessment takes place once every three years to determine suitability for the position.','市政公务员多久接受一次任职考核？','每三年考核一次，以确定是否符合所任职务要求。'],
['Q16','Перечень включает гражданскую, военную и государственную службу иных видов. Муниципальная служба в него не включена.','Which types of state service exist in Russia?','The list includes civil, military and other state service. Municipal service is not included.','俄罗斯有哪些国家公务类型？','清单包括文职、军事和其他类型国家公务，不包括市政公务。'],
['Q17','Военная служба и государственная служба иных видов являются федеральными. Гражданская служба есть и на уровне субъектов.','Which types of service are exclusively federal?','Military and other state service are federal. Civil service also exists at regional level.','哪些公务类型仅属于联邦层级？','军事和其他类型国家公务属于联邦公务，文职公务也存在于联邦主体层级。'],
['Q18','Ищите правило включения муниципальной службы в стаж в установленном законом порядке, а не перечень видов службы.','Can municipal service count towards length of state service?','Find the rule allowing municipal service periods to count as prescribed by law, not the list of service types.','市政公务期间能否计入国家公务年限？','应查找依法计入市政公务期间的规则，而不是公务类型清单。'],
['Q19','Обязательны представительный орган, глава муниципального образования и местная администрация. Иные возможные органы — другой перечень.','Which bodies must form part of local self-government?','A representative body, municipal head and local administration are mandatory. Other possible bodies form a different list.','地方自治结构必须包含哪些机关？','代表机关、市政实体负责人和地方行政机关为必备部分，其他可设置机关属于另一清单。'],
['Q20','Представительный орган утверждает структуру по представлению главы администрации. Внесение предложения и утверждение — разные полномочия.','Who approves the structure of the local administration?','The representative body approves it on the administration head’s proposal. Proposing and approving are different powers.','谁批准地方行政机关的组织结构？','代表机关根据行政机关负责人的提议批准。提议权与批准权不同。'],
['Q21','Непосредственное осуществление: референдум, муниципальные выборы, сход граждан. Отличайте их от иных форм участия.','How can residents exercise local self-government directly?','Direct exercise includes a referendum, municipal elections and a citizens’ assembly. Distinguish these from other participation.','居民如何直接实行地方自治？','直接方式包括公民投票、市政选举和居民大会，应与其他参与形式区分。'],
['Q22','Нужна единая информационная система в сфере закупок. Отдельная электронная площадка не заменяет её определение.','What is the system for publishing public procurement information called?','Find the unified procurement information system, not an individual electronic platform.','发布公共采购信息的系统叫什么？','应查找采购领域统一信息系统，而不是某个电子交易平台。'],
['Q23','Норма прямо запрещает закупки вне плана-графика. Общее описание планирования не заменяет запрет.','Can a procurement take place if it is not in the procurement schedule?','The rule expressly prohibits procurement omitted from the schedule. A general planning provision is insufficient.','未列入采购计划表的采购能否实施？','条款明确禁止实施未列入计划表的采购，一般规划说明并不足够。'],
['Q24','Нужны обе части: конкурентные способы и единственный поставщик; затем конкурсы, аукционы и электронный запрос котировок.','Which methods of selecting a supplier does the law provide?','Both parts are needed: competitive methods or a sole supplier, then tenders, auctions and electronic quotation requests.','法律规定了哪些供应商选择方式？','需要两部分：竞争性方式或单一供应商，以及招标、拍卖和电子询价清单。'],
['Q25','Личная заинтересованность влияет или может повлиять на надлежащее, объективное и беспристрастное исполнение обязанностей.','What constitutes a conflict of interest?','Personal interest affects or may affect proper, objective and impartial performance of duties.','什么构成利益冲突？','个人利益影响或可能影响适当、客观、公正履职。'],
['Q26','Указаны представитель нанимателя, прокуратура или другие государственные органы. Не ограничивайте норму одним адресатом.','Whom must a servant notify of an attempt to induce a corruption offence?','The rule names the employer’s representative, prosecution authorities or other state bodies. Do not reduce it to one recipient.','有人试图诱使公务员腐败违法时，应通知谁？','条款列出用人方代表、检察机关或其他国家机关，不应缩减为单一接收方。'],
['Q27','Указаны супруг или супруга и несовершеннолетние дети. Родители и совершеннолетние дети здесь не названы.','Which family members’ income and property must be disclosed where required by law?','The rule covers a spouse and minor children. It does not name parents or adult children.','依法申报收入和财产时，涉及哪些家庭成员？','条款涉及配偶和未成年子女，不包括父母或成年子女。'],
['Q28','Нужен полный перечень национальных целей. Отдельный целевой показатель его не заменяет.','Which national development goals are established?','Select the full list of national goals. An individual target does not replace it.','规定了哪些国家发展目标？','应选择国家目标完整清单，单个指标不能替代。'],
['Q29','Сопоставьте показатель бедности с 2030 годом. Показатель на 2036 год отвечает на другой вопрос.','To what level should poverty fall by 2030?','Match the poverty target to 2030. The 2036 target answers a different question.','到2030年贫困率应降至什么水平？','应核对2030年的贫困率目标，而不是2036年的目标。'],
['Q30','Для задания нужен показатель продолжительности жизни именно к 2030 году, а не более позднему сроку.','What life expectancy target is set for 2030?','Select the life expectancy target for 2030, not a later year.','2030年的预期寿命目标是多少？','应选择2030年的预期寿命目标，而不是更晚年份的指标。'],
['Q31','Категории: руководители, помощники (советники), специалисты и обеспечивающие специалисты. Группы — другая классификация.','Into which categories are Moscow civil service positions divided?','Categories are managers, assistants/advisers, specialists and support specialists. Groups are a different classification.','莫斯科文职公务员职务分为哪些类别？','类别包括领导、助理（顾问）、专业人员和保障专业人员，组别属于另一种分类。'],
['Q32','Представитель действует от имени Москвы: руководитель органа, лицо на государственной должности или их представитель.','Who acts as the employer’s representative?','A body’s head, a state office holder or their representative acts on behalf of Moscow.','谁担任用人方代表？','机关负责人、担任国家职务的人员或其代表以莫斯科市名义行事。'],
['Q33','Эти чины присваивает Мэр Москвы. Порядок присвоения иных чинов к ним переносить нельзя.','Who awards the ranks of actual state councillor of Moscow?','The Mayor of Moscow awards these ranks. Do not apply the procedure for other ranks.','谁授予莫斯科市实际国务顾问等级？','这些等级由莫斯科市长授予，不能套用其他等级的授予程序。'],
['Q34','Нужен заголовок приложения 1, где названы оба знака отличия. Основной текст лишь утверждает приложение.','Which distinctions are described in Annex 1?','Find the Annex 1 heading naming both distinctions. The main act merely approves the annex.','附件1规定了哪些荣誉标志？','应查找列明两种荣誉标志的附件1标题，主文件只是批准附件。'],
['Q35','Положение прямо исключает повторное награждение. Нужна эта норма, а не общий порядок представления к награде.','Can the distinction “For Merit to Moscow” be awarded twice?','The regulations prohibit a repeat award. Find this rule, not the general nomination procedure.','能否再次获得“为莫斯科建功”荣誉标志？','规定禁止重复授予，应查找此规则，而不是一般提名程序。'],
['Q36','Московский закон перечисляет пять групп муниципальных должностей: от высших до младших.','Which groups of municipal service positions are established in Moscow?','Moscow’s law lists five groups, from highest to junior.','莫斯科规定了哪些市政公务员职务组别？','莫斯科法律列出从最高到初级的五个组别。'],
['Q37','Московский закон устанавливает аттестацию один раз в три года. Выберите правило о периодичности.','How often is a municipal servant assessed?','Moscow’s law requires assessment once every three years. Select the timing rule.','市政公务员多久接受一次任职考核？','莫斯科法律规定每三年考核一次，应选择周期规则。'],
['Q38','Представительный орган — Екатеринбургская городская Дума. Администрация города является другим органом.','What is Yekaterinburg’s representative body called?','The representative body is the Yekaterinburg City Duma. The city administration is a different body.','叶卡捷琳堡的代表机关叫什么？','代表机关是叶卡捷琳堡市杜马，市行政机关是另一个机关。'],
['X01','Часть 4 статьи 109 запрещает роспуск с момента выдвижения обвинения до решения Совета Федерации. Справка переворачивает правило.','A memo says: “After the Duma brings charges against the President, the President may dissolve it before the Federation Council decides.” Which provision disproves this?','Article 109(4) bars dissolution from the charges until the Federation Council’s decision. The memo reverses the rule.','一份说明称：“杜马对总统提出指控后，总统可在联邦委员会决定前解散杜马。”哪一条款能反驳？','第109条第4款禁止在提出指控至联邦委员会决定期间解散杜马。说明颠倒了规则。'],
['H01','Для события 2012 года нужен Закон № 122-ФЗ в соответствующей редакции. Статья 6 признаёт ранее возникшее право и без введённой этим законом регистрации. Более поздний Закон № 218-ФЗ к событию не применяется.','On 12 July 2012, a citizen was told their land right was invalid because it was not in the property register. The right arose lawfully and was documented in 1997. No transaction is taking place. Select the act applicable at the event date and the provision needed to check the claim.','Use the relevant 2012 version of Law No. 122-FZ. Article 6 recognises pre-existing rights without the registration introduced by that law. Later Law No. 218-FZ does not apply to this event.','2012年7月12日，一名公民被告知，其土地权利因未记入权利登记簿而无效。该权利于1997年合法产生并办理了文件，现无交易。请选择事件发生时适用的法律和核查该结论的条款。','应使用第122-ФЗ号法律的2012年相应版本。第6条承认此前产生的权利，即使未进行该法引入的登记。较晚的第218-ФЗ号法律不适用于本事件。']
];
export const taskCopy=Object.fromEntries(rows.map(([id,ru,p,x,z,y])=>[id,{ru:ru?{explanation:ru}:{},en:{prompt:p,explanation:x},zh:{prompt:z,explanation:y}}]));
const caseRows=[
['A01','The President introduces a bill abolishing a tax. Is a Government opinion required?','总统提出取消税收的法案，是否需要政府意见？'],
['A02','A Duma deputy proposes exempting a category of taxpayers. Is a Government opinion required?','杜马议员提议免除某类纳税人的税款，是否需要政府意见？'],
['A03','A regional legislature submits a federal bill involving federal budget expenditure. Which opinion is required?','联邦主体立法机关提出涉及联邦预算支出的法案，需要哪一机关的意见？'],
['A04','A region imposes a customs duty on goods from a neighbouring Russian region. Is this allowed?','某地区对从相邻俄罗斯联邦主体运入的货物征收关税，是否允许？'],
['A05','A fee for transporting goods is introduced at the boundary between two Russian regions. Which provision lets you assess this decision?','俄罗斯两个联邦主体的边界处设置货物通行费，哪一条款可用于判断该决定？'],
['A06','An administration demands a special fee for moving goods between Russian regions, specifically for crossing the internal boundary. Is this allowed?','行政机关专门因货物跨越俄罗斯内部地区边界而收取费用，是否允许？'],
['A07','The Ministry of Finance decides to issue money independently. Who holds this power?','财政部决定自行发行货币，该权限属于谁？'],
['A08','A region proposes issuing its own currency alongside the rouble. Is this allowed?','某地区提议发行自己的货币并与卢布并行使用，是否允许？'],
['A09','An executive body asks a commercial bank to issue a new local currency. Which constitutional provision lets you assess this instruction?','行政机关要求商业银行发行新的地方货币，哪一宪法条款可用于核查？'],
['A10','At an official event, a municipal servant receives a laptop worth 60,000 roubles in connection with official duties. May they keep it without formally handing it over?','市政公务员因履职在官方活动中获赠六万卢布的笔记本电脑，能否不办理移交而自行保留？'],
['A11','At a protocol event, a municipal servant receives a watch worth 40,000 roubles. Which provision determines ownership and the handover procedure?','市政公务员在礼宾活动中获赠四万卢布的手表，哪一条款规定归属及移交程序？'],
['A12','An organisation offers to pay for a municipal servant’s private holiday in gratitude for official duties. Which prohibition applies?','组织为感谢市政公务员履职，提出支付其私人旅游费用。适用哪项禁止规定？'],
['A13','A municipal servant is appointed directly subordinate to their wife’s brother, also a municipal servant. Which restriction applies?','市政公务员被安排直接隶属于妻子的亲兄弟，后者也是市政公务员。适用哪项限制？'],
['A14','A municipal servant is appointed directly subordinate to her mother, also a municipal servant. Is this allowed?','女性市政公务员入职后直接隶属于同为市政公务员的母亲，是否允许？'],
['A15','Two spouses in municipal service are transferred so one directly supervises the other. Which provision applies?','一对市政公务员夫妻被调任，使一方直接监督另一方。适用哪一条款？'],
['A16','A civil servant receives written notice of dismissal the next day for failing probation. How much notice is required?','文职公务员收到因试用不合格而于次日解雇的书面通知，依法须提前多久通知？'],
['A17','Before probation ends, the employer’s representative decides to terminate a civil servant’s contract. What written notice procedure applies?','试用期结束前，用人方代表决定解除公务合同，应遵循什么书面通知程序？'],
['A18','A civil servant receives notice of failed probation without reasons. Which provision specifies the required content?','文职公务员收到未说明原因的试用不合格通知，哪一条款规定通知内容？'],
['A19','A municipal servant is told to print a candidate’s leaflets on an office printer. Select the prohibition and the rule for handling an unlawful instruction.','市政公务员被要求用办公打印机印制候选人传单。请选择禁止规定及处理违法指示的规则。'],
['A20','A manager asks a municipal servant to send referendum campaign material using official email. Select the prohibition and the procedure for an unlawful instruction.','上级要求市政公务员用公务邮箱发送公民投票宣传材料。请选择禁止规定及违法指示处理程序。'],
['A21','A manager confirms in writing an instruction to use official resources for a candidate’s campaign. Select the prohibition and the rule governing the servant’s next steps.','上级书面确认利用公务资源为候选人宣传的指示。请选择禁止规定及决定公务员下一步行动的规则。'],
['A22','Eight months after leaving a listed position, a former servant is offered employment by a company over which they exercised public management functions. Is commission consent required?','离开清单所列职务八个月后，前公务员受邀到曾由其履行部分管理职能的公司工作。是否需要委员会同意？'],
['A23','A year after leaving a listed position, a former servant enters a civil-law contract worth 150,000 roubles per month with a previously supervised organisation. Whose consent is required?','离开清单所列职务一年后，前公务员与曾受其管理的组织签订每月十五万卢布的民事合同，需要什么同意？'],
['A24','Eighteen months after leaving a listed position, a former servant is offered employment by an organisation over which they exercised public management functions. Which restriction must be checked?','离开清单所列职务一年半后，曾受其管理的组织向前公务员提供劳动合同岗位，应核查哪项限制？']
];
const families=[
['Законопроект и заключение','Bill and Government opinion','法案与政府意见','Статья 104 требует заключение Правительства для перечисленных финансовых законопроектов независимо от автора инициативы.','Article 104 requires a Government opinion for the listed financial bills regardless of who introduces them.','第104条要求所列财政类法案须有政府意见，与提出主体无关。'],
['Граница между регионами','Boundaries between regions','地区间边界','Статья 74 запрещает внутренние таможенные границы, пошлины, сборы и иные препятствия свободному перемещению.','Article 74 prohibits internal customs boundaries, duties, charges and other obstacles to free movement.','第74条禁止内部海关边界、关税、费用及其他妨碍自由流通的障碍。'],
['Денежное обращение','Issuing currency','货币发行','Статья 75 закрепляет эмиссию за Центральным банком и запрещает введение и эмиссию других денег.','Article 75 reserves issuance to the Central Bank and prohibits introducing or issuing other currencies.','第75条将货币发行权专属于中央银行，禁止设立和发行其他货币。'],
['Подарок на службе','Gifts in public service','公务中的礼物','Сопоставьте запрет вознаграждения за службу и правило об официальных подарках. Последние передаются по акту; частная поездка допустимым подарком не становится.','Compare the ban on rewards for official duties with the official-gift rule. Official gifts require formal handover; a private holiday is not made permissible by calling it a gift.','应结合履职报酬禁令和官方礼物规则。官方礼物须移交，将私人旅行称为礼物不能使其合法。'],
['Непосредственное подчинение','Direct subordination','直接隶属关系','Ограничение требует предусмотренного родства или свойства и непосредственной подчинённости либо подконтрольности. В задаче есть оба условия.','The restriction requires the specified family relationship and direct subordination or supervision. Both conditions are present.','限制要求规定的亲属关系及直接隶属或监督关系，本题同时具备两项条件。'],
['Результат испытания','Probation outcome','试用结果','Предупреждение должно быть письменным, не позднее чем за три дня и с указанием причин неудовлетворительного результата.','Notice must be written, given at least three days in advance and state the reasons for failed probation.','通知须为书面，至少提前三天，并说明试用不合格的原因。'],
['Неправомерное поручение','An unlawful instruction','违法指示','Нужны запрет служебных преимуществ для агитации и правило неправомерного поручения. После письменного подтверждения руководителя служащий обязан отказаться от исполнения.','Both the campaigning prohibition and unlawful-instruction rule are needed. Written confirmation by the manager requires refusal, not compliance.','需要宣传禁令及违法指示规则。上级书面确认后，公务员有义务拒绝执行。'],
['После увольнения','After leaving service','离职之后','Проверьте двухлетний срок, должность в перечне и прежние управленческие функции. Для гражданско-правового договора важен и месячный порог стоимости.','Check the two-year period, the listed position and former management functions. The civil-law contract also has a monthly value threshold.','应核查两年期限、职务清单及原管理职能，民事合同还涉及每月金额门槛。']
];
export const caseCopy=Object.fromEntries(caseRows.map(([id,en,zh])=>[id,{en:{prompt:en},zh:{prompt:zh}}]));
const typeTitles={
  "T01": {
    "en": "Youth policy strategy",
    "zh": "青年政策战略"
  },
  "T02": {
    "en": "Appointment at the Federal Agency for Tourism",
    "zh": "联邦旅游署人事任命"
  },
  "T03": {
    "en": "School certificates",
    "zh": "中学毕业证书"
  },
  "T04": {
    "en": "Amendments to district administration rules",
    "zh": "区行政机关工作规则修订"
  },
  "T05": {
    "en": "Commendation",
    "zh": "表彰"
  },
  "T06": {
    "en": "State supervision rules",
    "zh": "国家监督规定"
  },
  "T07": {
    "en": "Municipal conflict-of-interest commission",
    "zh": "市政利益冲突委员会"
  },
  "T08": {
    "en": "Spatial development strategy",
    "zh": "空间发展战略"
  }
};
export function localizeContent(bank,cases,locale){
 const lang=['en','zh'].includes(locale)?locale:'ru',ix=lang==='en'?1:lang==='zh'?2:0;
 const task=t=>({...t,...taskCopy[t.id]?.ru,...taskCopy[t.id]?.[lang],...(t.kind==='type'&&typeTitles[t.id]?.[lang]?{title:typeTitles[t.id][lang]}:{})});
 return {bank:{...bank,classroom:bank.classroom.map(task),extra:bank.extra.map(task)},cases:cases.map(c=>{const f=families.find(x=>x[0]===c.title);return {...c,...caseCopy[c.id]?.[lang],title:f?.[ix]||c.title,explanation:f?.[ix+3]||'',scanQuestions:c.scanQuestions.map(q=>({...q}))};})};
}
