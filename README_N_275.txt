N_275_project_site_norm_controller_chunked_results_upload

Изменения:
- Исправлена загрузка файлов результатов нормоконтроля: теперь файлы отправляются через GIP API chunked upload (/incoming/upload-chunk и /incoming/finish-upload), а не одним base64-запросом через Vercel.
- Ошибка Vercel FUNCTION_PAYLOAD_TOO_LARGE при загрузке крупных файлов результатов нормоконтроля устранена.
- Карточка файла результата нормоконтроля создается в opr_site_section_files после успешной сборки файла на стороне GIP API и загрузки на Яндекс.Диск.
- Путь загрузки сохранен из N_274: /Для Технического заказчика/Стадия П/<проект>/<раздел>/нормаконтроль/<файл>.

SQL не требуется.
Переменные Vercel не менялись.
GIP API менять не требуется, если установлен N_169 или совместимая версия с /incoming/upload-chunk и /incoming/finish-upload.
