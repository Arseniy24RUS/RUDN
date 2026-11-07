#!/usr/bin/env python3
"""Targeted source-evidence and generated-index regression tests for seminar 5."""
import gzip
import copy
import base64
import tempfile
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "site/apps/career"
spec = importlib.util.spec_from_file_location("adaptive_index", ROOT / "scripts/build-adaptive-career-index.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
TAXONOMY = json.loads((APP / "data/adaptive-taxonomy.json").read_bytes())


class SourceEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extractor = builder.Extractor(TAXONOMY)

    def extract(self, title="", department="", duties=None, requirements=None):
        return self.extractor.extract(title, department, duties or [], requirements or [])

    def test_generic_grade_does_not_claim_function_or_department(self):
        for title in ["Специалист-эксперт", "Главный специалист", "Консультант",
                      "Начальник отдела", "Старшая группа должностей"]:
            self.assertEqual(self.extract(title)[0], {}, title)

    def test_titles_and_departments_never_supply_functional_features(self):
        for title, department in [("Главный специалист", "Отдел государственных закупок"),
                                  ("Программист", "ИТ-отдел"),
                                  ("Государственный налоговый инспектор", "Налоговая инспекция")]:
            features, level, evidence = self.extract(title, department)
            self.assertEqual(features, {})
            self.assertIsNone(level)
            self.assertEqual(evidence, [])

    def test_constitution_office_literacy_and_municipal_education_are_not_specialisms(self):
        requirements = [{"category": "knowledge", "sourceText": "Знание Конституции Российской Федерации"},
                        {"category": "skills", "sourceText": "Уверенный пользователь ПК"}]
        features, _, _ = self.extract("Главный специалист муниципального образования", requirements=requirements)
        self.assertEqual(features, {})

    def test_source_repetition_cannot_inflate_weight(self):
        once = self.extract(duties=["Подготовка закупочной документации."])[0]
        repeated = self.extract(duties=["Подготовка закупочной документации."] * 20)[0]
        self.assertEqual(once, repeated)
        self.assertEqual(once["procurement"], 1.0)

    def test_specific_subtask_implies_parent_but_not_siblings(self):
        synthetic = {"facets": [{"id": "parent", "patterns": ["собирать кубики"],
                                  "questions": [{"id": "narrow", "broad": False,
                                                 "patterns": ["строить мост"]}]}]}
        features, _, evidence = builder.Extractor(synthetic).extract("", "", ["Строить мост"], [])
        self.assertEqual(features, {"narrow": 1.0, "parent": 1.0})
        self.assertEqual(next(item for item in evidence if item["featureId"] == "parent")["viaSubtask"], "narrow")

    def test_negated_and_delegated_programming_is_not_developer_work(self):
        duty = "проекты по цифровой трансформации (не программист, программисты другие будут делать, тут нужна от сотрудника помощь в выстраивания процессов сбора информации)"
        features, _, _ = self.extract("Референт", duties=[duty])
        self.assertNotIn("digital_systems_5", features)
        self.assertEqual(builder.duty_rows([{"sourceText": duty}]), [duty])

    def test_routine_security_compliance_and_user_software_do_not_make_it_role(self):
        duties = ["Соблюдать требования информационной безопасности и защиты персональных данных.",
                  "Работать с информационными системами и базами данных."]
        features, _, _ = self.extract("Главный специалист", duties=duties)
        self.assertFalse(any(key.startswith("information_security") for key in features))
        self.assertFalse(any(key.startswith("digital_systems") for key in features))

    def test_real_it_duties_remain_it_even_in_a_non_it_authority(self):
        duty = "обеспечение сопровождения и обновления программного обеспечения Государственной информационной системы; обеспечение информационной безопасности ГИС; принятие мер по устранению причин инцидентов информационной безопасности"
        features, level, _ = self.extract("Консультант", duties=[duty])
        self.assertEqual(level, "duties")
        self.assertEqual(features["digital_systems"], 1.0)
        self.assertEqual(features["information_security"], 1.0)

    def test_requirements_do_not_masquerade_as_duties(self):
        features, level, _ = self.extract("Консультант", requirements=[
            {"category": "knowledge", "sourceText": "Знание методов криптографической защиты информации"}])
        self.assertEqual(level, "knowledge")
        self.assertEqual(features["information_security"], .45)

    def test_tax_and_court_tasks_depend_on_published_function(self):
        tax = self.extract("Главный специалист", duties=["Проведение налоговой проверки"])[0]
        self.assertIn("tax_revenue", tax)
        self.assertIn("tax_revenue_2", tax)
        secretary = self.extract("Секретарь судебного заседания", duties=["Регистрация входящей корреспонденции"])[0]
        self.assertIn("records_archives", secretary)
        self.assertNotIn("litigation", secretary)

    def test_clause_boundaries_cannot_bridge_law_and_computer_literacy(self):
        synthetic = {"facets": [{"id": "fake", "patterns": ["разработка.{0,80}программного обеспечения"], "questions": []}]}
        value = "Разработка документов; уверенный пользователь программного обеспечения"
        self.assertEqual(builder.Extractor(synthetic).extract("", "", [value], [])[0], {})
        features, _, evidence = self.extract(duties=["Знать Конституцию РФ; Подготовка закупочной документации."])
        self.assertIn("procurement", features)
        for item in evidence:
            self.assertEqual(item["sourceText"], "Знать Конституцию РФ; Подготовка закупочной документации."[item["sourceSegmentStart"]:item["sourceSegmentEnd"]])
            self.assertNotIn("Конституцию", item["sourceText"])

    def test_additional_qualifications_need_an_explicit_work_action(self):
        features, _, _ = self.extract(requirements=[{"category": "functional-other", "sourceText": "Высшее образование, информационная безопасность"}])
        self.assertEqual(features, {})
        features, _, _ = self.extract(requirements=[{"category": "functional-other", "sourceText": "Подготовка закупочной документации"}])
        self.assertIn("procurement", features)
        self.assertEqual(self.extract(requirements=[{"category": "functional-other", "sourceText":
            "Оценка уровня владения кандидатами на замещение вакантных должностей знаниями и умениями"}])[0], {})

    def test_source_wrapped_lines_do_not_separate_action_from_object(self):
        source = "1) Подготовка закупочной\nдокументации;\n2) Знать Конституцию РФ."
        features, level, evidence = self.extract(duties=[source])
        self.assertIn("procurement", features)
        self.assertEqual(level, "duties")
        for item in evidence:
            self.assertEqual(source[item["sourceTextStart"]:item["sourceTextEnd"]], item["sourceText"])
            self.assertIn("закупочной\nдокументации", item["sourceText"])
            self.assertNotIn("Конституцию", item["sourceText"])

    def test_qualification_sections_inside_duties_keep_their_real_category(self):
        source = "Должен знать: методы криптографической защиты информации; Должен уметь: разработка программного обеспечения"
        features, level, evidence = self.extract(duties=[source])
        self.assertEqual(level, "skills")
        self.assertEqual(features["information_security"], .45)
        self.assertEqual(features["digital_systems"], .85)
        self.assertTrue(all(item["field"] in ("skills", "knowledge") for item in evidence))

    def test_general_functional_knowledge_is_not_actual_work(self):
        sources = ["функциональных знаний при нормативном правовом регулировании и выработке государственной политики: понятия нормы права",
                   "понятия процедуры рассмотрения обращений граждан",
                   "знания в области информационно-коммуникационных технологий, включая знание основ информационной безопасности и защиты информации",
                   "знание общих принципов функционирования системы электронного документооборота",
                   "умение готовить служебные письма, включая ответы на обращения государственных органов, граждан и организаций в установленный срок"]
        for source in sources:
            self.assertEqual(self.extract(requirements=[{"category": "knowledge", "sourceText": source}])[0], {}, source)

    def test_safe_prefilter_preserves_exact_regex_result_on_source_fragments(self):
        source = json.loads((ROOT / "source-audit/adaptive-career/enriched-frequent-source-texts.json").read_bytes())
        for category in source.values():
            for entry in category:
                for _, _, segment in builder.source_segments(entry["text"]):
                    self.assertEqual(self.extractor.matches(segment), self.extractor.matches(segment, prefilter=False))
        patterns = ["(?:налог|таможн)[а-я ]+проверк", "(?:список)?налог", "(?:abc)?[0-9]+", "(?:налог|[0-9]+)проверка",
                    "(?=налог)налог", "(?!налог)проверка", "(?:налог){0,1}проверка", "(?:таможн|налог(?:ов)?)ая"]
        synthetic = builder.Extractor({"facets": [{"id": str(i), "patterns": [pattern], "questions": []}
                                                  for i, pattern in enumerate(patterns)]})
        for value in ["налоговая проверка", "таможенная проверка", "123", "abc123", "123проверка", "налог", "проверка"]:
            self.assertEqual(synthetic.matches(value), synthetic.matches(value, prefilter=False), value)

    def test_excerpt_offsets_preserve_entities_and_original_wording(self):
        source = "  &lt;b&gt;Подготовка&lt;/b&gt;\nзакупочной&nbsp;документации. "
        cleaned, positions = builder.normalized_spans(source)
        self.assertEqual(cleaned, builder.norm(source))
        self.assertEqual(len(cleaned), len(positions))
        for value in [source, "  Подготовка\nзакупочной\t документации.  ", "Straße &amp; ёлка"]:
            normalized, spans = builder.normalized_spans(value)
            locate = builder.normalized_locator(value)
            for start in range(len(normalized)):
                for end in [start + 1, len(normalized)]:
                    self.assertEqual(locate(start, end), (spans[start][0], spans[end - 1][1]))
        features, _, evidence = self.extract(duties=[source])
        self.assertIn("procurement", features)
        for item in evidence:
            self.assertEqual(source[item["sourceTextStart"]:item["sourceTextEnd"]], item["sourceText"])

    def test_domain_precedence_only_removes_the_same_overlapping_action(self):
        taxonomy = {"facets": [
            {"id": "inspection", "patterns": ["проведение проверок"], "questions": [
                {"id": "inspection_2", "patterns": ["проведение проверок"], "broad": False}]},
            {"id": "tax_revenue", "patterns": ["проведение проверок налогов"], "questions": [
                {"id": "tax_revenue_2", "patterns": ["проведение проверок налогов"], "broad": False}]}]}
        extractor = builder.Extractor(taxonomy)
        features, _, _ = extractor.extract("", "", ["Проведение проверок налогов"], [])
        self.assertIn("tax_revenue_2", features)
        self.assertNotIn("inspection", features)
        features, _, _ = extractor.extract("", "", ["Проведение проверок налогов; проведение проверок пожарной безопасности"], [])
        self.assertIn("tax_revenue_2", features)
        self.assertIn("inspection_2", features)

    def test_pure_legislative_titles_are_not_employee_work(self):
        examples = ['N 59-ФЗ "О порядке рассмотрения обращений граждан Российской Федерации"',
                    'Федеральный закон от 13.07.2015 № 218-ФЗ «О государственной регистрации недвижимости»',
                    'Приказ Министерства труда от 19.05.2021 № 320н «Об утверждении формы, порядка ведения и хранения трудовых книжек»',
                    'Постановление Правительства от 31.03.2018 № 397 «Об утверждении единой методики проведения конкурсов на замещение вакантных должностей»',
                    'Соблюдение положений закона от 02.05.2006 г. №59-ФЗ «О порядке рассмотрения обращений граждан Российской Федерации».',
                    'понятий, процедуры рассмотрения обращений граждан']
        for value in examples:
            self.assertEqual(self.extract(requirements=[{"category": "knowledge", "sourceText": value}])[0], {}, value)
            if '59-ФЗ' in value:
                self.assertEqual(self.extract(duties=[value])[0], {}, value)
        features = self.extract(requirements=[{"category": "knowledge", "sourceText": "Порядок проведения налоговой проверки"}])[0]
        self.assertIn("tax_revenue_2", features)
        self.assertIn("legal_drafting_2", self.extract(duties=["Подготовка проектов нормативных правовых актов"])[0])
        crossed = 'Приказ от 20.05.2021 № 1 «О порядке ведения реестра; исправлении реестровой ошибки»; Методы криптографической защиты информации'
        features = self.extract(requirements=[{"category": "knowledge", "sourceText": crossed}])[0]
        self.assertNotIn("registration_records_5", features)
        self.assertIn("information_security_5", features)
        oversight = '3) вносить предложения по осуществлению функций контроля и надзора в сфере адвокатуры, нотариата, государственной регистрации актов гражданского состояния'
        self.assertNotIn("registration_records_4", self.extract(duties=[oversight])[0])

    def test_applicant_instructions_and_passive_software_do_not_supply_hr_or_it_work(self):
        examples = ["Конкурс заключается в оценке профессионального уровня кандидатов на замещение вакантных должностей гражданской службы.",
                    "При проведении конкурса проводится индивидуальное собеседование в форме свободной беседы с кандидатом.",
                    "Проведение индивидуального собеседования с кандидатом в ходе заседания конкурсной комиссии является обязательным.",
                    "В целях самопроверки рекомендуется пройти тестирование в Единой информационной системе управления кадровым составом.",
                    "Примерный комплекс тестовых вопросов размещен в разделе «Тесты для самопроверки» в федеральной государственной информационной системе.",
                    "Для оценки знаний и умений по вопросам профессиональной служебной деятельности по группе должностей, по которой формируется кадровый резерв."]
        for value in examples:
            for category in ["knowledge", "skills", "functional-other"]:
                self.assertEqual(self.extract(requirements=[{"category": category, "sourceText": value}])[0], {}, value)
        passive = "использовать программный комплекс по профилактике коррупции (компьютерная программа, разработанная на базе специального программного обеспечения «Справки БК+»)."
        features = self.extract(requirements=[{"category": "skills", "sourceText": passive}])[0]
        self.assertNotIn("digital_systems_5", features)
        self.assertNotIn("digital_systems", features)

    def test_road_maintenance_is_not_a_vehicle_fleet(self):
        road = "участвует в осуществлении контроля за ремонтом и содержанием автомобильных дорог, расположенных на территории района"
        self.assertNotIn("facility_operations_4", self.extract(duties=[road])[0])
        self.assertIn("facility_operations_4", self.extract(duties=["Организация технического обслуживания служебных автомобилей"])[0])

    def test_action_stems_start_at_words_and_considering_is_not_accounting(self):
        negative = ["Запрашивает сведения из реестра государственного имущества",
                    "Получает сведения из реестра лицензий",
                    "С учетом сведений реестра государственного имущества подготавливает ответ заявителю"]
        for source in negative:
            self.assertEqual(self.extract(duties=[source])[0], {}, source)
        positive = [("Ведение реестра государственного имущества", "property_land_2"),
                    ("Осуществляет учет государственного имущества", "property_land_2"),
                    ("Ведение реестра лицензий", "licensing_permits_5")]
        for source, feature in positive:
            self.assertIn(feature, self.extract(duties=[source])[0], source)

    def test_passive_first_action_is_not_a_performed_employee_function(self):
        negative = ["Использует сведения о проведенных камеральных проверках",
                    "Подготовка судебного требования по предоставленным в аренду земельным участкам",
                    "Использование разработанного программного обеспечения",
                    "Подготавливает документы для проведения выездных проверок налогоплательщиков"]
        for source in negative:
            features = self.extract(duties=[source])[0]
            for feature in ("tax_revenue_2", "property_land_3", "digital_systems_5"):
                self.assertNotIn(feature, features, source)
        positive = [("Проведение камеральных налоговых проверок представленных деклараций", "tax_revenue_2"),
                    ("Проводить выездные проверки налогоплательщиков", "tax_revenue_2"),
                    ("Предоставление земельных участков", "property_land_3"),
                    ("Разработка программного обеспечения", "digital_systems_5")]
        for source, feature in positive:
            self.assertIn(feature, self.extract(duties=[source])[0], source)

    def test_external_actor_and_request_recipient_are_not_the_worker(self):
        negative = [("Участие в сделках в органе, осуществляющем государственную регистрацию прав", "registration_records_2"),
                    ("Направляет запросы в органы по учету государственного имущества", "property_land_2"),
                    ("Ведение переписки по вопросам бесплатного предоставления земельных участков", "property_land_3"),
                    ("Проверки своевременного составления протоколов судебных заседаний", "court_support_3")]
        for source, feature in negative:
            self.assertNotIn(feature, self.extract(duties=[source])[0], source)
        positive = [("Осуществление государственной регистрации прав на недвижимость", "registration_records_2"),
                    ("Учет государственного имущества", "property_land_2"),
                    ("Составление протокола судебного заседания", "court_support_3")]
        for source, feature in positive:
            self.assertIn(feature, self.extract(duties=[source])[0], source)

    def test_personal_rights_and_lawyer_files_do_not_become_other_departments(self):
        self.assertFalse(any(key.startswith("integrity_compliance") for key in
                             self.extract(duties=["14) проведение по его заявлению служебной проверки"])[0]))
        self.assertNotIn("court_support_4", self.extract(duties=[
            "формирует и ведет материалы по судебным делам, в которых участвовал в качестве представителя"])[0])

    def test_explicit_transfers_to_public_budgets_are_not_organisation_grants(self):
        examples = ["Предоставление субсидий из федерального бюджета бюджету Пензенской области",
                    "Контроль использования муниципальными образованиями средств областного бюджета, включая проверку отчетов о целевом использовании субсидий"]
        for value in examples:
            self.assertFalse(any(key.startswith("grant_administration") for key in self.extract(duties=[value])[0]), value)

    def test_actual_source_context_regressions(self):
        fixtures = json.loads((ROOT / "source-audit/adaptive-career/classification-fixtures.json").read_bytes())
        for case in fixtures["cases"]:
            with self.subTest(case=case["caseId"], source=case["sourceVacancyId"]):
                value = case.get("inputText", case["sourceText"])
                if case.get("sourceTokenSHA256"):
                    self.assertEqual(builder.sha(value.encode("utf-8")), case["sourceTokenSHA256"])
                category = "functional-other" if case["sourceField"] == "additionalRequirements" else case["evidenceCategory"]
                features = (self.extract(duties=[value])[0] if category == "duties" else
                            self.extract(requirements=[{"category": category, "sourceText": value}])[0])
                for feature in case["forbiddenFeatures"]:
                    self.assertNotIn(feature, features)
                for feature in case.get("requiredFeatures", []):
                    self.assertIn(feature, features)

    def test_direct_legal_claims_do_not_match_risks_or_searches(self):
        for source in ("Подготовка исков и заявлений в арбитражный суд",
                       "Подача исков", "Подготовка проекта иска"):
            self.assertIn("litigation_2", self.extract(duties=[source])[0], source)
        for source in ("Подготовка анализа рисков", "Составление поисковых запросов",
                       "Подготовка поисков архивных документов"):
            self.assertNotIn("litigation_2", self.extract(duties=[source])[0], source)

    def test_responsibility_is_explicit_and_assistants_do_not_become_heads(self):
        examples = {
            "Главный специалист": "specialist",
            "Главный государственный инспектор": "specialist",
            "Государственный налоговый инспектор": "specialist",
            "Помощник руководителя": "specialist",
            "Советник министра": "specialist",
            "Секретарь руководителя": "specialist",
            "Начальник отдела — главный инспектор": "leadership",
            "Главный инспектор — начальник отдела": "leadership",
            "Главный специалист отдела – заместитель начальника инспекции": "leadership",
            "Главный инспектор-начальник отдела": "leadership",
            "Главный бухгалтер": "leadership",
            "Первый заместитель министра": "leadership",
            "Заместитель директора департамента": "leadership",
            "Руководитель управления": "leadership",
            "Директор департамента": "leadership",
            "Экономист": "specialist",
            "Казначей": "specialist",
            "Бухгалтер": "specialist",
            "Ведущий программист": "specialist",
            "Системный администратор": "specialist",
            "Ведущий инженер": "specialist",
            "Аналитик": "specialist",
            "Юрисконсульт": "specialist",
            "Судебный пристав-исполнитель": "specialist",
            "Архивариус": "specialist",
            "Работник": "unspecified",
            "": "unspecified",
        }
        for title, expected in examples.items():
            self.assertEqual(builder.responsibility_level(title), expected, title)

    def test_environmental_abbreviation_has_word_boundaries(self):
        self.assertNotIn("environmental_management_2", self.extract("Новосибирский район")[0])
        self.assertIn("environmental_management_2", self.extract(duties=["Проведение ОВОС"])[0])

    def test_policy_programmes_are_not_computer_programs(self):
        for duty in ["Разработка региональных программ", "Разработка ведомственных программ",
                     "Разработка целевых программ"]:
            features, _, _ = self.extract(duties=[duty])
            self.assertIn("project_delivery", features, duty)
            self.assertNotIn("digital_systems_5", features, duty)
            self.assertNotIn("digital_systems", features, duty)
        for duty in ["Разработка программного обеспечения", "Разработка программного кода",
                     "Разработка компьютерных программ", "Разработка скриптов"]:
            features, _, _ = self.extract(duties=[duty])
            self.assertIn("digital_systems_5", features, duty)
            self.assertIn("digital_systems", features, duty)

    def test_unknown_geography_is_never_national_or_default_moscow(self):
        regions = builder.region_lookup(json.loads((APP / "data/territories.json").read_bytes()))
        self.assertEqual(builder.source_region("г. Москва", regions), "ru-77")
        self.assertEqual(builder.source_region("Кемеровская область", regions), "ru-42")
        self.assertEqual(builder.source_region("Республика Мордовия", regions), "ru-13")
        self.assertIsNone(builder.source_region("<За пределами РФ>", regions))
        self.assertIsNone(builder.source_region("", regions))

    def test_source_active_flag_is_not_live_recruitment(self):
        self.assertEqual(builder.source_status(False, "Открыта", "2026-12-31", "2026-11-06"), "unconfirmed")
        self.assertEqual(builder.source_status(False, "Открыта", "2025-12-31", "2026-11-06"), "archived")
        self.assertEqual(builder.source_status(True, "Открыта", "2026-12-31", "2026-11-06"), "archived")


class EnrichedSourceBindingTests(unittest.TestCase):
    def setUp(self):
        self.binding = {"baseTreeSHA": "a" * 64, "basePage": "pages/ab/" + "c" * 24 + "/p0000-" + "d" * 16 + ".json.gz",
                        "basePageSHA256": "d" * 64, "employerId": "exact-employer", "uuids": ["id-1", "id-2"]}
        self.pack = {"schemaVersion": 1, **{k: v for k, v in self.binding.items() if k != "uuids"},
                     "tokenEncoding": "page-strings-v1", "strings": ["Знать бюджетное законодательство"],
                     "records": {"id-1": {"knowledge": [{"sourceField": "knowledgeRequirements", "sourcePointer": "/publicFields/knowledgeRequirements/0/name", "sourceNamespace": "publicFields", "textIndex": 0}]}, "id-2": {}}}

    def test_exact_page_employer_hash_and_uuid_binding(self):
        builder.validate_detail_pack(self.pack, self.binding)
        for key in ["baseTreeSHA", "basePage", "basePageSHA256", "employerId"]:
            broken = copy.deepcopy(self.pack); broken[key] += "x"
            with self.assertRaises(ValueError): builder.validate_detail_pack(broken, self.binding)
        broken = copy.deepcopy(self.pack); broken["records"]["other-id"] = broken["records"].pop("id-2")
        with self.assertRaises(ValueError): builder.validate_detail_pack(broken, self.binding)

    def test_dictionary_resolution_keeps_source_text_and_locator(self):
        detail = builder.hydrate_detail_record(self.pack, "id-1")
        token = detail["knowledge"][0]
        self.assertEqual(token["text"], self.pack["strings"][0])
        self.assertEqual(token["sourcePointer"], "/publicFields/knowledgeRequirements/0/name")
        self.assertNotIn("textIndex", token)
        self.assertEqual(detail["duties"], [])
        broken = copy.deepcopy(self.pack); broken["strings"] = []
        with self.assertRaises(ValueError): builder.hydrate_detail_record(broken, "id-1")

    def test_partial_shards_cannot_omit_or_duplicate_ids(self):
        part = {"path": self.binding["basePage"][:-8] + ".part0000.json.gz", "bytes": 100,
                "sha256": "e" * 64, "uncompressedSHA256": "f" * 64, "uncompressedBytes": 1000,
                "uuids": ["id-1", "id-2"]}
        pack = {key: val for key, val in self.pack.items() if key not in ["records", "strings"]}
        pack.update(recordCount=2, shards=[part]); builder.validate_detail_pack(pack, self.binding)
        broken = copy.deepcopy(pack); broken["shards"][0]["uuids"] = ["id-1", "id-1"]
        with self.assertRaises(ValueError): builder.validate_detail_pack(broken, self.binding)
        broken = copy.deepcopy(pack); broken["shards"][0]["path"] = "../other.json.gz"
        with self.assertRaises(ValueError): builder.validate_detail_pack(broken, self.binding)



class PackedPayloadTests(unittest.TestCase):
    def test_dictionary_roundtrip_preserves_uuid_and_shares_profiles(self):
        features = {"procurement": 1.0, "procurement_2": 1.0}
        profile = builder.sha(builder.encode(features))
        rows = []
        for index in range(2):
            row = builder.base_candidate(str(index), "Главный специалист", "Отдел закупок", "employer", "Работодатель",
                                         "ru-77", "Москва", features, "duties", "archived", True,
                                         f"https://example.org/position/{index}", "source/path", "bank")
            row.update(profileId=profile, detailPath="data/adaptive-index/details/d0000.json.gz")
            rows.append(row)
        payload = builder.packed_payload(rows, "fixture")
        self.assertEqual(payload["columns"], builder.PACKED_COLUMNS)
        self.assertEqual(len(payload["dictionaries"]["profiles"]), 1)
        self.assertEqual(len(payload["dictionaries"]["employers"]), 1)
        decoded = builder.unpack_payload(payload)
        self.assertEqual(decoded, rows)
        self.assertIs(decoded[0]["features"], decoded[1]["features"])
        self.assertNotEqual(decoded[0]["id"], decoded[1]["id"])


class GeneratedIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((APP / "data/adaptive-index/manifest.json").read_bytes())
        payload = json.loads(gzip.decompress((APP / cls.manifest["all"]["path"]).read_bytes()))
        cls.rows = builder.unpack_payload(payload)
        cls.by_id = {row["id"]: row for row in cls.rows}
        cls.subtasks = {q["id"] for f in TAXONOMY["facets"] for q in f["questions"] if not q.get("broad")}
        cls.allowed_features = {f["id"] for f in TAXONOMY["facets"]} | cls.subtasks
        cls.patterns = {f["id"]: set(f["patterns"]) for f in TAXONOMY["facets"]}
        cls.parents = {}
        for facet in TAXONOMY["facets"]:
            for question in facet["questions"]:
                if not question.get("broad"):
                    cls.patterns[question["id"]] = set(question["patterns"])
                    cls.parents[question["id"]] = facet["id"]

    def detail_rows(self):
        for descriptor in self.manifest["details"]:
            payload = json.loads(gzip.decompress((APP / descriptor["path"]).read_bytes()))
            for detail in payload["rows"]:
                yield descriptor, detail

    def test_every_payload_is_byte_checked_and_has_same_source_fingerprint(self):
        self.assertEqual(self.manifest["schemaVersion"], 2)
        self.assertRegex(self.manifest["version"], r"^functional-2\.0\.0-[a-f0-9]{12}$")
        for descriptor in [self.manifest["all"], *self.manifest["nationalParts"], *self.manifest["shards"], *self.manifest["details"]]:
            compressed = (APP / descriptor["path"]).read_bytes()
            raw = gzip.decompress(compressed)
            self.assertEqual(len(compressed), descriptor["bytes"])
            self.assertEqual(builder.sha(compressed), descriptor["sha256"])
            self.assertEqual(len(raw), descriptor["uncompressedBytes"])
            self.assertEqual(builder.sha(raw), descriptor["uncompressedSHA256"])
            payload = json.loads(raw)
            self.assertEqual(payload["schemaVersion"], 2)
            self.assertEqual(payload["version"], self.manifest["version"])
            self.assertEqual(len(payload["rows"]), descriptor["count"])

    def test_whole_source_bank_and_union_reconcile_without_collapsing_uuid(self):
        counts = self.manifest["counts"]
        self.assertEqual(counts["sourceBank"], 457627)
        self.assertEqual(counts["portalMergedByUUID"], 1610)
        self.assertEqual(counts["uniqueSources"], counts["sourceBank"] + counts["rich"] + counts["portal"]
                         - counts["portalMergedByUUID"] - counts["richExactSourceDuplicates"])
        self.assertEqual(counts["uniqueSources"], counts["rankableSources"] + sum(self.manifest["coverage"]["excluded"].values()))
        self.assertEqual(counts["rankableSources"], len(self.rows))
        self.assertEqual(counts["rows"], len(self.rows))
        self.assertEqual(counts["collapsedRepeatedAnnouncements"], 0)
        self.assertEqual(len(self.by_id), len(self.rows))
        self.assertTrue(all(row["sourceRecordCount"] == 1 for row in self.rows))
        self.assertEqual(counts["uniqueProfiles"], len({row["profileId"] for row in self.rows}))
        coverage = self.manifest["coverage"]
        self.assertEqual(sum(coverage["bankScopeCounts"].values()), counts["sourceBank"])
        self.assertEqual(coverage["sourceCategoryRows"]["duties"], 421135)
        self.assertEqual(coverage["sourceCategoryRows"]["knowledge"], 221230)
        self.assertEqual(coverage["sourceCategoryRows"]["skills"], 221979)
        self.assertEqual(coverage["sourceDetailSnapshot"]["files"], 15958)
        self.assertEqual(coverage["sourceDetailSnapshot"]["gzipBytes"], 580029763)
        self.assertEqual(coverage["eligibleBankFunctionalEvidence"]["withSpecificSubtask"], coverage["rankableSourceKinds"]["bank"])
        self.assertLessEqual(coverage["bankFunctionalEvidence"]["withSpecificSubtask"], coverage["bankFunctionalEvidence"]["withAnyFeature"])

    def test_regional_shards_contain_only_their_exact_geography(self):
        seen = set()
        for descriptor in self.manifest["shards"]:
            rows = builder.unpack_payload(json.loads(gzip.decompress((APP / descriptor["path"]).read_bytes())))
            self.assertTrue(all(row["regionId"] == descriptor["regionId"] for row in rows))
            for row in rows:
                self.assertNotIn(row["id"], seen)
                self.assertEqual(row, self.by_id[row["id"]])
                seen.add(row["id"])
        self.assertEqual(seen, set(self.by_id))

    def test_national_parts_exactly_partition_the_all_candidate_index(self):
        seen = set()
        for descriptor in self.manifest["nationalParts"]:
            self.assertLessEqual(descriptor["count"], 50000)
            self.assertLessEqual(descriptor["uncompressedBytes"], 32 * 1024 * 1024)
            rows = builder.unpack_payload(json.loads(gzip.decompress((APP / descriptor["path"]).read_bytes())))
            for row in rows:
                self.assertNotIn(row["id"], seen)
                self.assertEqual(row, self.by_id[row["id"]])
                seen.add(row["id"])
        self.assertEqual(seen, set(self.by_id))

    def test_all_candidates_have_specific_source_content_and_exact_role_level(self):
        profiles = {}
        for row in self.rows:
            self.assertTrue(set(row["features"]) & self.subtasks, row["id"])
            self.assertTrue(set(row["features"]).issubset(self.allowed_features))
            self.assertEqual(row["responsibilityLevel"], builder.responsibility_level(row["title"]))
            self.assertIn(row["evidenceLevel"], ("duties", "skills", "knowledge", "requirements", "functional"))
            self.assertIn(row["status"], ("profile", "archived", "unconfirmed"))
            if row["profileId"] not in profiles:
                self.assertEqual(row["profileId"], builder.sha(builder.encode(row["features"])))
                profiles[row["profileId"]] = row["features"]
            self.assertIs(row["features"], profiles[row["profileId"]])

    def test_every_candidate_has_bound_exact_evidence_for_every_feature(self):
        seen = set()
        hosting = json.loads((ROOT / "source-audit/career-vacancies/details-hosting.json").read_bytes())
        for descriptor, detail in self.detail_rows():
            self.assertNotIn(detail["id"], seen)
            seen.add(detail["id"])
            row = self.by_id[detail["id"]]
            self.assertEqual(detail["sourceURL"], row["sourceURL"])
            self.assertEqual(row["detailPath"], descriptor["path"])
            self.assertEqual(detail["sourceRecordCount"], 1)
            self.assertEqual({item["featureId"] for item in detail["evidence"]}, set(row["features"]))
            for evidence in detail["evidence"]:
                feature = evidence.get("viaSubtask", evidence["featureId"])
                self.assertIn(evidence["pattern"], self.patterns[feature])
                if "viaSubtask" in evidence:
                    self.assertEqual(self.parents[feature], evidence["featureId"])
                self.assertIn(evidence["category"], ("duties", "skills", "knowledge"))
                self.assertTrue(evidence["sourcePointer"].startswith("/"))
                self.assertTrue(evidence["sourceField"])
                self.assertEqual(evidence["sourceTextEnd"] - evidence["sourceTextStart"], len(evidence["sourceText"]))
                self.assertLessEqual(evidence["sourceTextStart"], evidence["matchStart"])
                self.assertLessEqual(evidence["matchEnd"], evidence["sourceTextEnd"])
                self.assertIsNotNone(re.search(evidence["pattern"], builder.norm(evidence["sourceText"]), re.IGNORECASE), row["id"])
            if row["sourceType"] == "bank":
                self.assertEqual(detail["sourceScope"], "individual-role")
                reference = detail["sourceReference"]
                self.assertEqual(reference["detailsTreeSHA"], hosting["treeSHA"])
                self.assertEqual(reference["baseTreeSHA"], hosting["baseTreeSHA"])
                self.assertEqual(reference["employerId"], row["employerId"])
                self.assertEqual(reference["recordJSONPointer"], "/records/" + row["id"])
                self.assertEqual(detail["sourceDetailURL"], hosting["collectionRoot"] + reference["detailPage"][:-8] + ".b64")
                for evidence in detail["evidence"]:
                    self.assertTrue(evidence["snapshotPointer"].startswith("/records/" + row["id"] + "/"))
        self.assertEqual(seen, set(self.by_id))

    def test_rich_evidence_substrings_are_verifiable_without_external_details(self):
        sources = {}
        for _, detail in self.detail_rows():
            row = self.by_id[detail["id"]]
            if row["sourceType"] != "position":
                continue
            path = row["sourcePath"]
            if path not in sources:
                sources[path] = json.loads((APP / path).read_bytes())
            for evidence in detail["evidence"]:
                value = sources[path]
                for key in evidence["sourcePointer"].lstrip("/").split("/"):
                    value = value[int(key)] if isinstance(value, list) else value[key.replace("~1", "/").replace("~0", "~")]
                self.assertEqual(value[evidence["sourceTextStart"]:evidence["sourceTextEnd"]], evidence["sourceText"])

    def test_full_source_member_audit_reconciles_every_source_disposition(self):
        payload = json.loads(gzip.decompress((ROOT / "source-audit/adaptive-career/source-members.json.gz").read_bytes()))
        self.assertEqual(payload["version"], self.manifest["version"])
        bank_type = payload["sourceTypes"].index("bank")
        bank_rows = [row for row in payload["rows"] if row[1] == bank_type]
        self.assertEqual(len(bank_rows), 457627)
        self.assertEqual(len({row[0] for row in bank_rows}), 457627)
        rank_index = payload["dispositions"].index("ranked-source")
        ranked = {row[0] for row in payload["rows"] if row[6] == rank_index}
        self.assertEqual(ranked, set(self.by_id))
        self.assertTrue(all(row[8] is not None for row in bank_rows))


if __name__ == "__main__":
    unittest.main(verbosity=2)
