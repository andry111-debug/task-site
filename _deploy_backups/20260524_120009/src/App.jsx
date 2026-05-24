import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseReady } from "./supabaseClient";
import "./App.css";

const ROLE_LABELS = {
  admin: "Админ",
  designer: "Проектанты",
  customer_service: "Служба заказчика",
  external: "Сторонние люди",
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Админ" },
  { value: "designer", label: "Проектанты" },
  { value: "customer_service", label: "Служба заказчика" },
  { value: "external", label: "Сторонние люди" },
];

const scheduleItems = [
  {
    code: "ПЗ",
    title: "Пояснительная записка",
    start: "2026-01-15",
    end: "2026-02-03",
    progress: 90,
  },
  {
    code: "ПЗУ",
    title: "Схема планировочной организации земельного участка",
    start: "2026-01-20",
    end: "2026-02-12",
    progress: 70,
  },
  {
    code: "АР",
    title: "Архитектурные решения",
    start: "2026-01-24",
    end: "2026-02-20",
    progress: 62,
  },
  {
    code: "КР",
    title: "Конструктивные и объемно-планировочные решения",
    start: "2026-02-01",
    end: "2026-03-08",
    progress: 46,
  },
  {
    code: "ИОС",
    title: "Инженерное оборудование, сети и инженерно-технические мероприятия",
    start: "2026-02-05",
    end: "2026-03-28",
    progress: 38,
  },
  {
    code: "ТХ",
    title: "Технологические решения",
    start: "2026-02-10",
    end: "2026-03-18",
    progress: 42,
  },
  {
    code: "ПОС",
    title: "Проект организации строительства",
    start: "2026-03-01",
    end: "2026-03-30",
    progress: 25,
  },
  {
    code: "ПОД",
    title: "Проект организации работ по сносу или демонтажу",
    start: "2026-03-05",
    end: "2026-03-22",
    progress: 18,
  },
  {
    code: "ООС",
    title: "Мероприятия по охране окружающей среды",
    start: "2026-03-10",
    end: "2026-04-08",
    progress: 20,
  },
  {
    code: "ПБ",
    title: "Мероприятия по обеспечению пожарной безопасности",
    start: "2026-03-14",
    end: "2026-04-12",
    progress: 16,
  },
  {
    code: "ОДИ",
    title: "Мероприятия по обеспечению доступа инвалидов",
    start: "2026-03-18",
    end: "2026-04-05",
    progress: 12,
  },
  {
    code: "БЭ",
    title: "Требования к обеспечению безопасной эксплуатации",
    start: "2026-03-20",
    end: "2026-04-18",
    progress: 10,
  },
  {
    code: "ЭЭ",
    title: "Мероприятия по обеспечению энергетической эффективности",
    start: "2026-03-24",
    end: "2026-04-22",
    progress: 8,
  },
  {
    code: "СМ",
    title: "Смета на строительство",
    start: "2026-04-01",
    end: "2026-04-28",
    progress: 5,
  },
  {
    code: "ИД",
    title: "Иная документация в случаях, предусмотренных законодательством",
    start: "2026-04-10",
    end: "2026-04-30",
    progress: 0,
  },
];

const pptPeriods = [
  {
    "label": "01.04.26-10.04.26",
    "start": "2026-04-01",
    "end": "2026-04-10"
  },
  {
    "label": "11.04.26-20.04.26",
    "start": "2026-04-11",
    "end": "2026-04-20"
  },
  {
    "label": "21.04.26-30.04.26",
    "start": "2026-04-21",
    "end": "2026-04-30"
  },
  {
    "label": "01.05.26-10.05.26",
    "start": "2026-05-01",
    "end": "2026-05-10"
  },
  {
    "label": "11.05.26-20.05.26",
    "start": "2026-05-11",
    "end": "2026-05-20"
  },
  {
    "label": "21.05.26-31.05.26",
    "start": "2026-05-21",
    "end": "2026-05-31"
  },
  {
    "label": "01.06.26-10.06.26",
    "start": "2026-06-01",
    "end": "2026-06-10"
  },
  {
    "label": "11.06.26-20.06.26",
    "start": "2026-06-11",
    "end": "2026-06-20"
  },
  {
    "label": "21.06.26-30.06.26",
    "start": "2026-06-21",
    "end": "2026-06-30"
  },
  {
    "label": "01.07.26-10.07.26",
    "start": "2026-07-01",
    "end": "2026-07-10"
  },
  {
    "label": "11.07.26-20.07.26",
    "start": "2026-07-11",
    "end": "2026-07-20"
  },
  {
    "label": "21.07.26-31.07.26",
    "start": "2026-07-21",
    "end": "2026-07-31"
  },
  {
    "label": "01.08.26-10.08.26",
    "start": "2026-08-01",
    "end": "2026-08-10"
  },
  {
    "label": "11.08.26-20.08.26",
    "start": "2026-08-11",
    "end": "2026-08-20"
  },
  {
    "label": "21.08.26-30.08.26",
    "start": "2026-08-21",
    "end": "2026-08-30"
  },
  {
    "label": "01.09.26-10.09.26",
    "start": "2026-09-01",
    "end": "2026-09-10"
  },
  {
    "label": "11.09.26-20.09.26",
    "start": "2026-09-11",
    "end": "2026-09-20"
  }
];

const defaultPptItems = [
  {
    "code": "1",
    "title": "Получение ТУ",
    "duration": "",
    "note": "",
    "type": "group",
    "events": [
      {
        "periodIndex": 10,
        "text": "Внесение изменений в проект планировки территории"
      },
      {
        "periodIndex": 11,
        "text": "Согласование ППТ с МЧС, ГАИ, Администрацией"
      },
      {
        "periodIndex": 13,
        "text": "Подача ППТ с ПМТ  на утверждение"
      },
      {
        "periodIndex": 15,
        "text": "Подготовка материалов для инвесткомитета"
      },
      {
        "periodIndex": 16,
        "text": "ГОТОВНОСТЬ ПРОЕКТА"
      }
    ],
    "startIndex": 10,
    "endIndex": 16,
    "start": "2026-07-11",
    "end": "2026-09-20"
  },
  {
    "code": "1.1",
    "title": "Примыкание дорог",
    "duration": "45 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 4,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 4,
    "start": "2026-04-01",
    "end": "2026-05-20"
  },
  {
    "code": "1.2",
    "title": "Электроснабжение",
    "duration": "45 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 4,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 4,
    "start": "2026-04-01",
    "end": "2026-05-20"
  },
  {
    "code": "1.3",
    "title": "Водоснабжение",
    "duration": "20 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 2,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 2,
    "start": "2026-04-01",
    "end": "2026-04-30"
  },
  {
    "code": "1.4",
    "title": "Канализация",
    "duration": "20 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 2,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 2,
    "start": "2026-04-01",
    "end": "2026-04-30"
  },
  {
    "code": "1.5",
    "title": "Тепловые сети",
    "duration": "20 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 2,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 2,
    "start": "2026-04-01",
    "end": "2026-04-30"
  },
  {
    "code": "1.6",
    "title": "Сети связи",
    "duration": "20 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 2,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 2,
    "start": "2026-04-01",
    "end": "2026-04-30"
  },
  {
    "code": "1.7",
    "title": "Газоснабжение",
    "duration": "20 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "Получение ТУ"
      },
      {
        "periodIndex": 2,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 2,
    "start": "2026-04-01",
    "end": "2026-04-30"
  },
  {
    "code": "2",
    "title": "Досъемка трасс коммуникаций за пределами участка",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "2.1",
    "title": "Примыкание дорог",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 5,
        "text": "Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "2.2",
    "title": "Электроснабжение",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 5,
        "text": "Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "2.3",
    "title": "Водоснабжение",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 3,
        "text": "Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 5,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 5,
    "start": "2026-04-21",
    "end": "2026-05-31"
  },
  {
    "code": "2.4",
    "title": "Канализация",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены,Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 3,
    "start": "2026-04-21",
    "end": "2026-05-10"
  },
  {
    "code": "2.5",
    "title": "Тепловые сети",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены,Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 3,
    "start": "2026-04-21",
    "end": "2026-05-10"
  },
  {
    "code": "2.6",
    "title": "Сети связи",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены,Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 3,
    "start": "2026-04-21",
    "end": "2026-05-10"
  },
  {
    "code": "2.7",
    "title": "Газоснабжение",
    "duration": "15 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены,Досъемка трасс коммуникаций за пределами участка"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 3,
    "start": "2026-04-21",
    "end": "2026-05-10"
  },
  {
    "code": "3",
    "title": "Выявление пересечений с коммуникациями на участках досъемки",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "3.1",
    "title": "Примыкание дорог",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 7,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 9,
        "text": "готовность"
      }
    ],
    "startIndex": 7,
    "endIndex": 9,
    "start": "2026-06-11",
    "end": "2026-07-10"
  },
  {
    "code": "3.2",
    "title": "Электроснабжение",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 7,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 9,
        "text": "готовность"
      }
    ],
    "startIndex": 7,
    "endIndex": 9,
    "start": "2026-06-11",
    "end": "2026-07-10"
  },
  {
    "code": "3.3",
    "title": "Водоснабжение",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 6,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 8,
        "text": "готовность"
      }
    ],
    "startIndex": 6,
    "endIndex": 8,
    "start": "2026-06-01",
    "end": "2026-06-30"
  },
  {
    "code": "3.4",
    "title": "Канализация",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "3.5",
    "title": "Тепловые сети",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "3.6",
    "title": "Сети связи",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "3.7",
    "title": "Газоснабжение",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "Выявление пересечений с коммуникациями на участках досъемки"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 6,
    "start": "2026-05-11",
    "end": "2026-06-10"
  },
  {
    "code": "4",
    "title": "Выполнение инженерно-геологических изысканий",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "4.1",
    "title": "Предоставление данных из отчета",
    "duration": "45 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "выполнение изысканий"
      },
      {
        "periodIndex": 4,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 4,
    "start": "2026-04-01",
    "end": "2026-05-20"
  },
  {
    "code": "5",
    "title": "Выполнение инженерно-экологических изысканий.",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "5.1",
    "title": "Предоставление данных из отчета",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "выполнение изысканий"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 3,
    "start": "2026-04-01",
    "end": "2026-05-10"
  },
  {
    "code": "6",
    "title": "Выполнение инженерно-гидрометеорологических изысканий.",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "6.1",
    "title": "Предоставление данных из отчета",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "выполнение изысканий"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 3,
    "start": "2026-04-01",
    "end": "2026-05-10"
  },
  {
    "code": "5",
    "title": "Разработка СЗЗ",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "5.1",
    "title": "Проект санитарно защитной зоны",
    "duration": "45 дней",
    "note": "после выполнения ИЭИ",
    "type": "task",
    "events": [
      {
        "periodIndex": 3,
        "text": "отчет по ИЭИ получен"
      },
      {
        "periodIndex": 8,
        "text": "готовность"
      }
    ],
    "startIndex": 3,
    "endIndex": 8,
    "start": "2026-05-01",
    "end": "2026-06-30"
  },
  {
    "code": "6",
    "title": "Запрос в ГУ МЧС",
    "duration": "",
    "note": "О наличие в радиусе доступности пожарного расчета для ликвидации возможных ЧС, . исходных данных , необходимые для учета при разработке ППТ",
    "type": "group",
    "events": []
  },
  {
    "code": "6.1",
    "title": "Получение ответа на запрос",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "запрос отправлен и зарегистрирован"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 3,
    "start": "2026-04-01",
    "end": "2026-05-10"
  },
  {
    "code": "7",
    "title": "Запрос информации по водному объекту находящемуся на территории разработки ППТ",
    "duration": "",
    "note": "",
    "type": "group",
    "events": []
  },
  {
    "code": "7.1",
    "title": "Получение ответа на письмо",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "запрос отправлен и зарегистрирован"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 3,
    "start": "2026-04-01",
    "end": "2026-05-10"
  },
  {
    "code": "8",
    "title": "Внутриплощадочная раскладка сетей",
    "duration": "",
    "note": "после получения ТУ",
    "type": "group",
    "events": []
  },
  {
    "code": "8.1",
    "title": "Электроснабжение",
    "duration": "45 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 9,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 9,
    "start": "2026-05-11",
    "end": "2026-07-10"
  },
  {
    "code": "8.2",
    "title": "Водоснабжение",
    "duration": "45 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 7,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 7,
    "start": "2026-04-21",
    "end": "2026-06-20"
  },
  {
    "code": "8.3",
    "title": "Канализация",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 6,
    "start": "2026-04-21",
    "end": "2026-06-10"
  },
  {
    "code": "8.4",
    "title": "Тепловые сети",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 6,
    "start": "2026-04-21",
    "end": "2026-06-10"
  },
  {
    "code": "8.5",
    "title": "Сети связи",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 6,
    "start": "2026-04-21",
    "end": "2026-06-10"
  },
  {
    "code": "8.6",
    "title": "Газоснабжение",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 2,
        "text": "ТУ получены"
      },
      {
        "periodIndex": 6,
        "text": "готовность"
      }
    ],
    "startIndex": 2,
    "endIndex": 6,
    "start": "2026-04-21",
    "end": "2026-06-10"
  },
  {
    "code": "9",
    "title": "Запрос в Минтранс ДНР",
    "duration": "",
    "note": "о статусе и категории дорог и требований по организации примыкания, въезда, выезда",
    "type": "group",
    "events": []
  },
  {
    "code": "9.1",
    "title": "Получение ответа на письмо",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 0,
        "text": "запрос отправлен и зарегистрирован"
      },
      {
        "periodIndex": 3,
        "text": "готовность"
      }
    ],
    "startIndex": 0,
    "endIndex": 3,
    "start": "2026-04-01",
    "end": "2026-05-10"
  },
  {
    "code": "10",
    "title": "Направление для разработки ПМТ",
    "duration": "",
    "note": "после получения изысканий",
    "type": "group",
    "events": []
  },
  {
    "code": "10.1",
    "title": "Схемы использования территории в период подготовки проекта планировки территории. М 1:1000",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "изыскания получены"
      },
      {
        "periodIndex": 7,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 7,
    "start": "2026-05-11",
    "end": "2026-06-20"
  },
  {
    "code": "10.2",
    "title": "Схемы границ зон с особыми условиями использования территории. М 1:1000",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "изыскания получены"
      },
      {
        "periodIndex": 7,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 7,
    "start": "2026-05-11",
    "end": "2026-06-20"
  },
  {
    "code": "10.3",
    "title": "Планировочного и (или) объемно-пространственного решения застройки территории. М 1:1000",
    "duration": "30 дней",
    "note": "",
    "type": "task",
    "events": [
      {
        "periodIndex": 4,
        "text": "изыскания получены"
      },
      {
        "periodIndex": 7,
        "text": "готовность"
      }
    ],
    "startIndex": 4,
    "endIndex": 7,
    "start": "2026-05-11",
    "end": "2026-06-20"
  }
];

function createEmptyAccount() {
  return {
    name: "",
    login: "",
    pin_code: "",
    role: "designer",
  };
}

function dateToTime(value) {
  return new Date(`${value}T00:00:00`).getTime();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function getScheduleBounds(items) {
  const starts = items.map((item) => dateToTime(item.start));
  const ends = items.map((item) => dateToTime(item.end));
  return {
    min: Math.min(...starts),
    max: Math.max(...ends),
  };
}

function getBarStyle(item, bounds) {
  const total = bounds.max - bounds.min;
  const start = dateToTime(item.start) - bounds.min;
  const end = dateToTime(item.end) - bounds.min;
  const left = total ? (start / total) * 100 : 0;
  const width = total ? Math.max(((end - start) / total) * 100, 3) : 100;

  return {
    left: `${left}%`,
    width: `${width}%`,
  };
}

function getPptBarStyle(item, bounds) {
  if (!item.start || !item.end) {
    return { left: "0%", width: "0%" };
  }

  const total = bounds.max - bounds.min;
  const start = dateToTime(item.start) - bounds.min;
  const end = dateToTime(item.end) - bounds.min;
  const left = total ? (start / total) * 100 : 0;
  const width = total ? Math.max(((end - start) / total) * 100, 2.5) : 100;

  return {
    left: `${left}%`,
    width: `${width}%`,
  };
}

function shortenEventText(text) {
  if (!text) return "";
  return text.length > 46 ? `${text.slice(0, 46)}...` : text;
}


function clonePptItems(items) {
  return items.map((item) => ({
    ...item,
    events: (item.events || []).map((event) => ({ ...event })),
  }));
}

function normalizePptItem(item) {
  const events = (item.events || [])
    .map((event) => ({
      periodIndex: Number(event.periodIndex),
      text: String(event.text || "").trim(),
    }))
    .filter(
      (event) =>
        Number.isInteger(event.periodIndex) &&
        event.periodIndex >= 0 &&
        event.periodIndex < pptPeriods.length &&
        event.text
    )
    .sort((a, b) => a.periodIndex - b.periodIndex);

  const periodIndexes = events.map((event) => event.periodIndex);
  const startIndex = periodIndexes.length ? Math.min(...periodIndexes) : null;
  const endIndex = periodIndexes.length ? Math.max(...periodIndexes) : null;

  return {
    ...item,
    code: String(item.code || "").trim(),
    title: String(item.title || "").trim(),
    duration: String(item.duration || "").trim(),
    note: String(item.note || "").trim(),
    type: item.type === "group" ? "group" : "task",
    events,
    startIndex,
    endIndex,
    start: startIndex !== null ? pptPeriods[startIndex].start : null,
    end: endIndex !== null ? pptPeriods[endIndex].end : null,
  };
}

function getLocalPptItems() {
  try {
    const saved = window.localStorage.getItem("pptScheduleItems");
    if (!saved) return clonePptItems(defaultPptItems);
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizePptItem) : clonePptItems(defaultPptItems);
  } catch {
    return clonePptItems(defaultPptItems);
  }
}

function saveLocalPptItems(items) {
  window.localStorage.setItem("pptScheduleItems", JSON.stringify(items));
}

function removeLocalPptItems() {
  window.localStorage.removeItem("pptScheduleItems");
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("1111");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [activeTab, setActiveTab] = useState("schedule");
  const [accountForm, setAccountForm] = useState(createEmptyAccount());
  const [passwordChanges, setPasswordChanges] = useState({});
  const [pptItems, setPptItems] = useState(() => getLocalPptItems());
  const [pptDraftItems, setPptDraftItems] = useState(() => getLocalPptItems());
  const [isPptEditing, setIsPptEditing] = useState(false);
  const [pptMessage, setPptMessage] = useState("");

  const scheduleBounds = useMemo(() => getScheduleBounds(scheduleItems), []);

  const summary = useMemo(() => {
    const total = scheduleItems.length;
    const average = Math.round(
      scheduleItems.reduce((sum, item) => sum + item.progress, 0) / total
    );
    const completed = scheduleItems.filter((item) => item.progress >= 100).length;

    return {
      total,
      average,
      completed,
    };
  }, []);


  const pptBounds = useMemo(() => {
    return {
      min: dateToTime(pptPeriods[0].start),
      max: dateToTime(pptPeriods[pptPeriods.length - 1].end),
    };
  }, []);

  const pptSummary = useMemo(() => {
    const taskRows = pptItems.filter((item) => item.type !== "group");
    const rowsWithEvents = taskRows.filter((item) => item.events.length > 0);
    const eventCount = pptItems.reduce((sum, item) => sum + item.events.length, 0);

    return {
      taskRows: taskRows.length,
      rowsWithEvents: rowsWithEvents.length,
      eventCount,
    };
  }, [pptItems]);

  const isAdmin = currentUser?.role === "admin";
  const canEditPpt = currentUser?.role === "admin" || currentUser?.role === "designer";

  async function loadPptSchedule() {
    const localItems = getLocalPptItems();

    if (!isSupabaseReady || !supabase) {
      setPptItems(localItems);
      setPptDraftItems(clonePptItems(localItems));
      return;
    }

    try {
      const { data, error } = await supabase
        .from("ppt_schedule")
        .select("data")
        .eq("id", 1)
        .maybeSingle();

      if (error) throw error;

      if (data?.data && Array.isArray(data.data)) {
        const normalized = data.data.map(normalizePptItem);
        setPptItems(normalized);
        setPptDraftItems(clonePptItems(normalized));
        saveLocalPptItems(normalized);
      } else {
        setPptItems(localItems);
        setPptDraftItems(clonePptItems(localItems));
      }
    } catch {
      setPptItems(localItems);
      setPptDraftItems(clonePptItems(localItems));
    }
  }

  async function loadAccounts() {
    if (!isSupabaseReady) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;

      setAccounts(data || []);
    } catch (error) {
      setNotice(`Ошибка загрузки учетных записей: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounts();
    loadPptSchedule();
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setNotice("");

    if (!isSupabaseReady) {
      setLoginError("Supabase не подключён. Проверь .env.local.");
      return;
    }

    const cleanedLogin = login.trim();
    const cleanedPassword = password.trim();

    if (!cleanedLogin || !cleanedPassword) {
      setLoginError("Введите логин и пароль.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("login", cleanedLogin)
        .eq("pin_code", cleanedPassword)
        .eq("active", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setLoginError("Неверный логин или пароль.");
        return;
      }

      setCurrentUser(data);
      setActiveTab("schedule");
      await loadAccounts();
    } catch (error) {
      setLoginError(`Ошибка входа: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setCurrentUser(null);
    setActiveTab("schedule");
    setLogin("admin");
    setPassword("1111");
    setLoginError("");
    setNotice("");
  }

  async function addAccount(event) {
    event.preventDefault();
    setNotice("");

    const payload = {
      name: accountForm.name.trim(),
      login: accountForm.login.trim(),
      pin_code: accountForm.pin_code.trim(),
      role: accountForm.role,
      active: true,
    };

    if (!payload.name || !payload.login || !payload.pin_code) {
      setNotice("Заполните имя, логин и пароль.");
      return;
    }

    try {
      const { error } = await supabase.from("employees").insert(payload);

      if (error) throw error;

      setAccountForm(createEmptyAccount());
      setNotice("Учетная запись добавлена.");
      await loadAccounts();
    } catch (error) {
      setNotice(`Ошибка добавления учетной записи: ${error.message}`);
    }
  }

  async function updateAccount(account, patch) {
    setNotice("");

    try {
      const { error } = await supabase
        .from("employees")
        .update(patch)
        .eq("id", account.id);

      if (error) throw error;

      setNotice("Учетная запись обновлена.");
      await loadAccounts();
    } catch (error) {
      setNotice(`Ошибка обновления учетной записи: ${error.message}`);
    }
  }

  async function changeAccountPassword(account) {
    const newPassword = (passwordChanges[account.id] || "").trim();

    if (!newPassword) {
      setNotice("Введите новый пароль.");
      return;
    }

    await updateAccount(account, { pin_code: newPassword });
    setPasswordChanges((current) => ({
      ...current,
      [account.id]: "",
    }));
  }

  function startPptEditing() {
    setPptDraftItems(clonePptItems(pptItems));
    setIsPptEditing(true);
    setPptMessage("");
  }

  function cancelPptEditing() {
    setPptDraftItems(clonePptItems(pptItems));
    setIsPptEditing(false);
    setPptMessage("");
  }

  function updatePptDraftItem(index, field, value) {
    setPptDraftItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function updatePptDraftEvent(itemIndex, eventIndex, field, value) {
    setPptDraftItems((current) =>
      current.map((item, currentItemIndex) => {
        if (currentItemIndex !== itemIndex) return item;

        const events = (item.events || []).map((event, currentEventIndex) => {
          if (currentEventIndex !== eventIndex) return event;

          return {
            ...event,
            [field]: field === "periodIndex" ? Number(value) : value,
          };
        });

        return {
          ...item,
          events,
        };
      })
    );
  }

  function addPptDraftEvent(itemIndex) {
    setPptDraftItems((current) =>
      current.map((item, currentItemIndex) => {
        if (currentItemIndex !== itemIndex) return item;

        return {
          ...item,
          events: [
            ...(item.events || []),
            {
              periodIndex: 0,
              text: "Новая отметка",
            },
          ],
        };
      })
    );
  }

  function deletePptDraftEvent(itemIndex, eventIndex) {
    setPptDraftItems((current) =>
      current.map((item, currentItemIndex) => {
        if (currentItemIndex !== itemIndex) return item;

        return {
          ...item,
          events: (item.events || []).filter((_, currentEventIndex) => currentEventIndex !== eventIndex),
        };
      })
    );
  }

  async function savePptEditing() {
    const normalized = pptDraftItems.map(normalizePptItem);
    setPptItems(normalized);
    setPptDraftItems(clonePptItems(normalized));
    saveLocalPptItems(normalized);
    setIsPptEditing(false);

    if (isSupabaseReady && supabase) {
      try {
        const { error } = await supabase
          .from("ppt_schedule")
          .upsert(
            {
              id: 1,
              data: normalized,
              updated_by: currentUser?.login || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (error) throw error;

        setPptMessage("График ППТ сохранён в базе Supabase.");
        return;
      } catch {
        setPptMessage("График ППТ сохранён в этом браузере. Для общего сохранения выполни SQL из архива и повтори сохранение.");
        return;
      }
    }

    setPptMessage("График ППТ сохранён в этом браузере.");
  }

  async function resetPptEditing() {
    const confirmed = window.confirm("Вернуть исходный график ППТ из приложенной таблицы?");
    if (!confirmed) return;

    const restored = clonePptItems(defaultPptItems);
    setPptItems(restored);
    setPptDraftItems(clonePptItems(restored));
    removeLocalPptItems();
    setIsPptEditing(false);

    if (isSupabaseReady && supabase) {
      try {
        await supabase
          .from("ppt_schedule")
          .upsert(
            {
              id: 1,
              data: restored,
              updated_by: currentUser?.login || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
      } catch {
        // Если таблица не создана, восстановление останется локальным.
      }
    }

    setPptMessage("Исходный график ППТ восстановлен.");
  }

  function renderLoginPage() {
    return (
      <main className="loginOnlyPage">
        <form className="loginCard" onSubmit={handleLogin}>
          <h1>Вход</h1>

          {!isSupabaseReady && (
            <div className="warningBox">
              Supabase не подключён. Проверьте переменные VITE_SUPABASE_URL и VITE_SUPABASE_KEY.
            </div>
          )}

          <label>
            Логин
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              placeholder="Введите логин"
            />
          </label>

          <label>
            Пароль
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
            />
          </label>

          {loginError && <div className="errorBox">{loginError}</div>}

          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
      </main>
    );
  }

  function renderSchedulePage() {
    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">График проектирования</p>
            <h2>Сводный график по разделам проектной документации</h2>
          </div>
          <div className="roleBadge">{ROLE_LABELS[currentUser?.role] || currentUser?.role}</div>
        </div>

        <div className="summaryGrid">
          <div className="summaryCard">
            <span>Разделов</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="summaryCard">
            <span>Средняя готовность</span>
            <strong>{summary.average}%</strong>
          </div>
          <div className="summaryCard">
            <span>Завершено</span>
            <strong>{summary.completed}</strong>
          </div>
        </div>

        <div className="chartCard">
          <div className="chartHeader">
            <div>
              <h3>Гистограмма сроков</h3>
              <p>Пока заполнено тестовыми сроками. После загрузки реального перечня заменим разделы и даты.</p>
            </div>
            <div className="dateRange">
              {formatDate(scheduleItems[0].start)} — {formatDate(scheduleItems[scheduleItems.length - 1].end)}
            </div>
          </div>

          <div className="timelineScale">
            <span>Январь</span>
            <span>Февраль</span>
            <span>Март</span>
            <span>Апрель</span>
          </div>

          <div className="ganttList">
            {scheduleItems.map((item) => (
              <article className="ganttRow" key={item.code}>
                <div className="taskMeta">
                  <strong>{item.code}</strong>
                  <span>{item.title}</span>
                </div>

                <div className="barArea">
                  <div className="barTrack">
                    <div className="bar" style={getBarStyle(item, scheduleBounds)}>
                      <span>{item.progress}%</span>
                    </div>
                  </div>
                  <div className="rowDates">
                    <span>{formatDate(item.start)}</span>
                    <span>{formatDate(item.end)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function renderPptPage() {
    const visiblePptItems = isPptEditing ? pptDraftItems : pptItems;

    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">График ППТ</p>
            <h2>График подготовки документации ППТ</h2>
          </div>
          <div className="roleBadge">По приложенной таблице</div>
        </div>

        {pptMessage && <div className="noticeBox">{pptMessage}</div>}

        {canEditPpt && (
          <div className="pptToolbar">
            {!isPptEditing ? (
              <>
                <button className="primaryButton" onClick={startPptEditing}>
                  Редактировать график ППТ
                </button>
                <button className="secondaryButton" onClick={loadPptSchedule}>
                  Обновить из базы
                </button>
              </>
            ) : (
              <>
                <button className="primaryButton" onClick={savePptEditing}>
                  Сохранить
                </button>
                <button className="secondaryButton" onClick={cancelPptEditing}>
                  Отменить
                </button>
                <button className="dangerButton" onClick={resetPptEditing}>
                  Вернуть исходный график
                </button>
              </>
            )}
          </div>
        )}

        {isPptEditing && (
          <div className="pptEditorCard">
            <div>
              <h3>Редактирование графика ППТ</h3>
              <p>
                Можно менять код, наименование, срок, примечание и контрольные отметки.
                Для общей работы нескольких пользователей выполни SQL-файл из архива.
              </p>
            </div>

            <div className="pptEditorList">
              {pptDraftItems.map((item, itemIndex) => (
                <article className={item.type === "group" ? "pptEditorRow group" : "pptEditorRow"} key={`${item.code}-${itemIndex}`}>
                  <div className="pptEditorFields">
                    <label>
                      Код
                      <input
                        value={item.code}
                        onChange={(event) => updatePptDraftItem(itemIndex, "code", event.target.value)}
                      />
                    </label>

                    <label>
                      Наименование
                      <input
                        value={item.title}
                        onChange={(event) => updatePptDraftItem(itemIndex, "title", event.target.value)}
                      />
                    </label>

                    {item.type !== "group" && (
                      <>
                        <label>
                          Срок
                          <input
                            value={item.duration || ""}
                            onChange={(event) => updatePptDraftItem(itemIndex, "duration", event.target.value)}
                          />
                        </label>

                        <label>
                          Примечание
                          <input
                            value={item.note || ""}
                            onChange={(event) => updatePptDraftItem(itemIndex, "note", event.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {item.type !== "group" && (
                    <div className="pptEventEditor">
                      <div className="pptEventEditorHeader">
                        <strong>Контрольные отметки</strong>
                        <button className="smallButton" onClick={() => addPptDraftEvent(itemIndex)}>
                          Добавить отметку
                        </button>
                      </div>

                      {(item.events || []).length === 0 && (
                        <div className="mutedText">Отметок нет.</div>
                      )}

                      {(item.events || []).map((event, eventIndex) => (
                        <div className="pptEventEditorRow" key={`${itemIndex}-${eventIndex}`}>
                          <select
                            value={event.periodIndex}
                            onChange={(changeEvent) =>
                              updatePptDraftEvent(itemIndex, eventIndex, "periodIndex", changeEvent.target.value)
                            }
                          >
                            {pptPeriods.map((period, periodIndex) => (
                              <option value={periodIndex} key={period.label}>
                                {period.label}
                              </option>
                            ))}
                          </select>

                          <input
                            value={event.text}
                            onChange={(changeEvent) =>
                              updatePptDraftEvent(itemIndex, eventIndex, "text", changeEvent.target.value)
                            }
                            placeholder="Текст отметки"
                          />

                          <button
                            className="dangerButton"
                            onClick={() => deletePptDraftEvent(itemIndex, eventIndex)}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="chartCard pptChartCard">
          <div className="chartHeader">
            <div>
              <h3>Гистограмма ППТ</h3>
              <p>Данные перенесены из приложенной таблицы. Шкала построена по декадам с апреля по сентябрь 2026 года.</p>
            </div>
            <div className="dateRange">
              {formatDate(pptPeriods[0].start)} — {formatDate(pptPeriods[pptPeriods.length - 1].end)}
            </div>
          </div>

          <div className="pptScale">
            {pptPeriods.map((period) => (
              <span key={period.label}>{period.label}</span>
            ))}
          </div>

          <div className="pptList">
            {visiblePptItems.map((item, index) => {
              if (item.type === "group") {
                return (
                  <article className="pptGroupRow" key={`${item.code}-${index}`}>
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                  </article>
                );
              }

              return (
                <article className="pptRow" key={`${item.code}-${index}`}>
                  <div className="pptTaskMeta">
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                    {item.duration && <small>Срок: {item.duration}</small>}
                    {item.note && <em>{item.note}</em>}
                  </div>

                  <div className="pptBarArea">
                    <div className="pptBarTrack">
                      {item.events.length > 0 && (
                        <div className="pptBar" style={getPptBarStyle(item, pptBounds)}>
                          <span>{formatDate(item.start)} — {formatDate(item.end)}</span>
                        </div>
                      )}
                    </div>

                    {item.events.length > 0 ? (
                      <div className="pptEventList">
                        {item.events.map((event, eventIndex) => (
                          <span key={`${item.code}-${event.periodIndex}-${eventIndex}`}>
                            {pptPeriods[event.periodIndex]?.label}: {shortenEventText(event.text)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="pptEventList mutedText">Нет отметок в графике</div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function renderAccountManagement() {
    if (!isAdmin) {
      return null;
    }

    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Администрирование</p>
            <h2>Управление учетными записями</h2>
          </div>
          <button className="secondaryButton" onClick={loadAccounts} disabled={loading}>
            Обновить
          </button>
        </div>

        {notice && <div className="noticeBox">{notice}</div>}

        <div className="adminGrid">
          <div className="adminCard">
            <h3>Добавить учетную запись</h3>

            <form className="formStack" onSubmit={addAccount}>
              <label>
                Имя
                <input
                  value={accountForm.name}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, name: event.target.value })
                  }
                  placeholder="Например: Иван Петров"
                />
              </label>

              <label>
                Логин
                <input
                  value={accountForm.login}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, login: event.target.value })
                  }
                  placeholder="Например: ivan"
                />
              </label>

              <label>
                Пароль
                <input
                  value={accountForm.pin_code}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, pin_code: event.target.value })
                  }
                  placeholder="Например: 2222"
                />
              </label>

              <label>
                Роль
                <select
                  value={accountForm.role}
                  onChange={(event) =>
                    setAccountForm({ ...accountForm, role: event.target.value })
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="primaryButton" type="submit">
                Добавить
              </button>
            </form>
          </div>

          <div className="adminCard wideCard">
            <h3>Список учетных записей</h3>

            <div className="accountList">
              {accounts.map((account) => (
                <article className="accountRow" key={account.id}>
                  <div className="accountMain">
                    <strong>{account.name}</strong>
                    <span>Логин: {account.login}</span>
                    <small>{ROLE_LABELS[account.role] || account.role}</small>
                  </div>

                  <div className="accountControls">
                    <select
                      value={account.role}
                      onChange={(event) =>
                        updateAccount(account, { role: event.target.value })
                      }
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>

                    <input
                      value={passwordChanges[account.id] || ""}
                      onChange={(event) =>
                        setPasswordChanges((current) => ({
                          ...current,
                          [account.id]: event.target.value,
                        }))
                      }
                      placeholder="Новый пароль"
                    />

                    <button
                      className="smallButton"
                      onClick={() => changeAccountPassword(account)}
                    >
                      Сменить пароль
                    </button>

                    <button
                      className={account.active ? "dangerButton" : "smallButton"}
                      onClick={() => updateAccount(account, { active: !account.active })}
                    >
                      {account.active ? "Отключить" : "Включить"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!currentUser) {
    return renderLoginPage();
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>График проектирования</h1>
        </div>

        <div className="userPanel">
          <div>
            <strong>{currentUser.name}</strong>
            <span>{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
          </div>
          <button className="ghostButton" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={activeTab === "schedule" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("schedule")}
        >
          График проектирования
        </button>

        <button
          className={activeTab === "ppt" ? "tabButton active" : "tabButton"}
          onClick={() => setActiveTab("ppt")}
        >
          График ППТ
        </button>

        {isAdmin && (
          <button
            className={activeTab === "accounts" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("accounts")}
          >
            Администрирование
          </button>
        )}
      </nav>

      {activeTab === "schedule" && renderSchedulePage()}
      {activeTab === "ppt" && renderPptPage()}
      {activeTab === "accounts" && renderAccountManagement()}
    </main>
  );
}

export default App;
