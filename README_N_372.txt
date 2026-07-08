N_372 project site: norm-control result upload path fix

Normal controller result uploads are now saved to the internal norm-control exchange folder:
/Внутренняя технологии/Нормаконтролер/<здание>/<раздел>/ответ/

If the local GIP program has already published source files under:
/Внутренняя технологии/Нормаконтролер/<здание>/<раздел>/файлы/
then the site uses the same <здание>/<раздел> path and only changes the final folder to 'ответ'.

The technical-customer folder is no longer used for norm-control result uploads.
No SQL migration required.
