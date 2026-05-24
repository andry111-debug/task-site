-- N_88: таблица для редактируемого графика ППТ
-- Выполнить в Supabase -> SQL Editor -> New query -> Run
-- После этого изменения графика ППТ будут сохраняться в Supabase, а не только в браузере.

create extension if not exists pgcrypto;

create table if not exists ppt_schedule (
    id integer primary key,
    data jsonb not null,
    updated_by text,
    updated_at timestamptz not null default now()
);

alter table ppt_schedule enable row level security;

drop policy if exists "public_all_ppt_schedule" on ppt_schedule;

create policy "public_all_ppt_schedule"
on ppt_schedule
for all
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant all on ppt_schedule to anon, authenticated;

insert into ppt_schedule (id, data, updated_by, updated_at)
values (
    1,
    $json$[
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
]$json$::jsonb,
    'initial',
    now()
)
on conflict (id)
do update set
    data = excluded.data,
    updated_by = excluded.updated_by,
    updated_at = now();
