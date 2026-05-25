#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pycharm_auto_deploy_supabase.py

Версия N_118. Исправления:
- Windows-команды npm/git запускаются по найденным полным путям;
- добавлено расширение PATH внутри процесса;
- рабочая папка по умолчанию: C:\Projects\ОПР\_Сайт;
- git add больше не захватывает _deploy_backups и _chatgpt_logs;
- лог автоматически сохраняется в _chatgpt_logs и маскирует секреты.

Версия установщика для PyCharm:
- принимает zip-архив обновления сайта;
- читает README и SQL-скрипты из архива;
- при необходимости автоматически выполняет SQL-скрипты в Supabase;
- применяет файлы к локальному проекту;
- делает npm install, npm run build, git commit, git push;
- после git push Vercel сам обновляет сайт.

Для drag-and-drop:
  pip install tkinterdnd2

Для автоматического выполнения SQL в Supabase:
  pip install psycopg2-binary

Важно:
  SQL выполняется через PostgreSQL connection string из Supabase.
  Service role key и anon/publishable key для этого не нужны.
"""

from __future__ import annotations

import datetime as dt
import fnmatch
import json
import locale
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import sys
import zipfile
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk

try:
    import psycopg2
    PSYCOPG2_AVAILABLE = True
except Exception:
    psycopg2 = None
    PSYCOPG2_AVAILABLE = False

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
    BaseWindow = TkinterDnD.Tk
except Exception:
    DND_FILES = None
    DND_AVAILABLE = False
    BaseWindow = tk.Tk


APP_VERSION = "N_118"
APP_TITLE = "Автодеплой сайта + Supabase SQL"
DEFAULT_PROJECT_DIR = r"C:\Projects\ОПР\_Сайт"
CONFIG_PATH = Path.home() / ".task_site_auto_deploy_supabase_config.json"

BLOCKED_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.preview",
}

BLOCKED_PATTERNS = [
    "*.pem",
    "*.key",
    "*service_role*",
    "*secret*",
]


def is_windows() -> bool:
    return os.name == "nt"


class Redactor:
    JWT_RE = re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+")
    PG_URI_RE = re.compile(r"(postgres(?:ql)?://[^:\s/@]+:)([^@\s]+)(@[^\s\"']+)", re.IGNORECASE)
    URL_PASSWORD_RE = re.compile(r"(://[^:/\s]+:)([^@/\s]+)(@)")
    KV_SECRET_RE = re.compile(
        r"((?:password|passwd|pwd|secret|token|key|service_role|anon_key|VITE_SUPABASE_ANON_KEY|VITE_SUPABASE_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]\s*)([^\s\"']+)",
        re.IGNORECASE,
    )

    @classmethod
    def redact(cls, text: str) -> str:
        if text is None:
            return ""
        value = str(text)
        value = cls.JWT_RE.sub("eyJ***REDACTED_JWT***", value)
        value = cls.PG_URI_RE.sub(r"\1***REDACTED_PASSWORD***\3", value)
        value = cls.URL_PASSWORD_RE.sub(r"\1***REDACTED_PASSWORD***\3", value)
        value = cls.KV_SECRET_RE.sub(r"\1***REDACTED***", value)
        return value


def detect_tool(tool: str) -> str | None:
    tool = tool.lower().strip()
    candidates: list[str] = []

    if tool == "npm":
        candidates.extend(["npm.cmd", "npm", r"C:\Program Files\nodejs\npm.cmd"])
    elif tool == "node":
        candidates.extend(["node.exe", "node", r"C:\Program Files\nodejs\node.exe"])
    elif tool == "git":
        candidates.extend(["git.exe", "git", r"C:\Program Files\Git\cmd\git.exe", r"C:\Program Files\Git\bin\git.exe"])
    elif tool == "psql":
        candidates.extend([
            "psql.exe",
            "psql",
            r"C:\Program Files\PostgreSQL\17\bin\psql.exe",
            r"C:\Program Files\PostgreSQL\16\bin\psql.exe",
            r"C:\Program Files\PostgreSQL\15\bin\psql.exe",
            r"C:\Program Files\PostgreSQL\14\bin\psql.exe",
        ])
    else:
        candidates.append(tool)

    for candidate in candidates:
        if os.path.isabs(candidate):
            if Path(candidate).exists():
                return candidate
        else:
            found = shutil.which(candidate)
            if found:
                return found
    return None


def command_name(name: str) -> str:
    found = detect_tool(name)
    if found:
        return found
    if is_windows() and name in {"npm", "npx"}:
        return f"{name}.cmd"
    return name


def run_env_with_tools() -> dict[str, str]:
    env = os.environ.copy()
    extra_dirs = [
        r"C:\Program Files\nodejs",
        r"C:\Program Files\Git\cmd",
        r"C:\Program Files\Git\bin",
    ]
    existing = env.get("PATH", "")
    for item in reversed(extra_dirs):
        if Path(item).exists() and item.lower() not in existing.lower():
            existing = item + os.pathsep + existing
    env["PATH"] = existing
    return env


def load_config() -> dict:
    default = {
        "archive_path": "",
        "project_dir": DEFAULT_PROJECT_DIR,
        "commit_message": "Update site from archive",
        "no_push": False,
        "skip_build": False,
        "run_sql": False,
        "db_url": "",
        "save_db_url": False,
    }

    if not CONFIG_PATH.exists():
        return default

    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {**default, **data}
    except Exception:
        return default


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


class DeployError(Exception):
    pass


class ArchiveInspector:
    def __init__(self, archive_path: Path) -> None:
        self.archive_path = archive_path

    def check_archive(self) -> None:
        if not self.archive_path.exists():
            raise DeployError(f"Архив не найден: {self.archive_path}")

        if self.archive_path.suffix.lower() != ".zip":
            raise DeployError("Пока поддерживаются только zip-архивы.")

        if not zipfile.is_zipfile(self.archive_path):
            raise DeployError("Файл не похож на корректный zip-архив.")

    def extract_archive(self, temp_root: Path) -> Path:
        extract_dir = temp_root / "archive"
        extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(self.archive_path, "r") as archive:
            archive.extractall(extract_dir)

        return extract_dir

    @staticmethod
    def find_payload_root(extract_dir: Path) -> Path:
        if (extract_dir / "src").exists():
            return extract_dir

        children = [path for path in extract_dir.iterdir() if path.is_dir()]
        if len(children) == 1 and (children[0] / "src").exists():
            return children[0]

        return extract_dir

    @staticmethod
    def read_instruction_files(extract_dir: Path) -> str:
        instruction_files = []

        for path in extract_dir.rglob("*"):
            if not path.is_file():
                continue

            lower = path.name.lower()
            if lower in {"readme.txt", "readme.md", "instructions.txt", "instruction.txt"}:
                instruction_files.append(path)

        if not instruction_files:
            return "Инструкции внутри архива не найдены. Будет использован стандартный сценарий."

        chunks = []

        for path in instruction_files:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = path.read_text(encoding="cp1251", errors="replace")

            chunks.append(f"--- {path.relative_to(extract_dir)} ---\n{text.strip()}")

        return "\n\n".join(chunks)

    @staticmethod
    def collect_sql_files(extract_dir: Path) -> list[Path]:
        sql_files = []

        for path in extract_dir.rglob("*.sql"):
            if not path.is_file():
                continue

            relative = path.relative_to(extract_dir).as_posix().lower()
            if relative.startswith("supabase_sql/") or "/supabase_sql/" in relative:
                sql_files.append(path)

        sql_files.sort(key=lambda item: item.name)
        return sql_files

    @staticmethod
    def looks_blocked(relative_path: Path) -> bool:
        name = relative_path.name

        if name in BLOCKED_NAMES:
            return True

        as_posix = relative_path.as_posix().lower()

        for pattern in BLOCKED_PATTERNS:
            lower_pattern = pattern.lower()
            if fnmatch.fnmatch(as_posix, lower_pattern) or fnmatch.fnmatch(name.lower(), lower_pattern):
                return True

        return False

    @classmethod
    def should_copy(cls, relative_path: Path) -> bool:
        lower_name = relative_path.name.lower()

        if lower_name in {"readme.txt", "readme.md", "instructions.txt", "instruction.txt"}:
            return False

        if "__macosx" in [part.lower() for part in relative_path.parts]:
            return False

        if relative_path.name == ".DS_Store":
            return False

        if cls.looks_blocked(relative_path):
            return False

        return True

    @classmethod
    def collect_files(cls, payload_root: Path) -> list[Path]:
        files = []

        for path in payload_root.rglob("*"):
            if not path.is_file():
                continue

            relative = path.relative_to(payload_root)

            if cls.should_copy(relative):
                files.append(path)

        return files


class Deployer:
    def __init__(
        self,
        archive_path: Path,
        project_dir: Path,
        commit_message: str,
        no_push: bool,
        skip_build: bool,
        run_sql: bool,
        db_url: str,
        selected_sql_names: set[str] | None,
        logger,
    ) -> None:
        self.archive_path = archive_path
        self.project_dir = project_dir
        self.commit_message = commit_message
        self.no_push = no_push
        self.skip_build = skip_build
        self.run_sql = run_sql
        self.db_url = db_url.strip()
        self.selected_sql_names = selected_sql_names
        self.log = logger
        self.inspector = ArchiveInspector(archive_path)

    def command_for(self, tool: str) -> str:
        found = detect_tool(tool)
        if found:
            return found
        fallback = command_name(tool)
        self.log(f"ПРЕДУПРЕЖДЕНИЕ: {tool} не найден заранее, пробую команду: {fallback}")
        return fallback

    def run_command(self, command: list[str], allow_fail: bool = False) -> subprocess.CompletedProcess:
        self.log("")
        safe_parts = []
        for item in command:
            text = str(item)
            safe_parts.append(f'"{text}"' if " " in text else text)
        self.log(">>> " + Redactor.redact(" ".join(safe_parts)))
        self.log(f"Рабочая папка: {self.project_dir}")

        try:
            encoding = locale.getpreferredencoding(False) or "utf-8"
            result = subprocess.run(
                command,
                cwd=str(self.project_dir),
                text=True,
                encoding=encoding,
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                shell=False,
                env=run_env_with_tools(),
            )
        except FileNotFoundError as error:
            tool_hint = ""
            if command:
                tool_hint = f"\nПроверка: команда '{command[0]}' не найдена именно внутри автодеплоя. В версии N_118 это обычно лечится указанием полного пути; если ошибка осталась, пришли лог."
            raise DeployError(f"Не найдена команда: {command[0]}. Подробности: {error}{tool_hint}") from error

        if result.stdout:
            for line in result.stdout.splitlines():
                self.log(Redactor.redact(line))

        self.log(f"Код завершения: {result.returncode}")

        if result.returncode != 0 and not allow_fail:
            raise DeployError(f"Команда завершилась с ошибкой {result.returncode}: {Redactor.redact(' '.join(command))}")

        return result

    def check_project_dir(self) -> None:
        if not self.project_dir.exists():
            raise DeployError(f"Папка проекта не найдена: {self.project_dir}")

        if not (self.project_dir / "package.json").exists():
            raise DeployError(f"В папке проекта нет package.json: {self.project_dir}")

        if not (self.project_dir / ".git").exists():
            raise DeployError(
                f"В папке проекта нет .git. Сначала надо подключить проект к GitHub: {self.project_dir}"
            )

    def ensure_gitignore(self) -> None:
        gitignore = self.project_dir / ".gitignore"
        required = [
            "node_modules/",
            "dist/",
            ".env",
            ".env.local",
            "_deploy_backups/",
            "_chatgpt_logs/",
            "*.log",
        ]
        existing_lines: list[str] = []
        if gitignore.exists():
            existing_lines = gitignore.read_text(encoding="utf-8", errors="replace").splitlines()
        existing = {line.strip() for line in existing_lines}
        missing = [line for line in required if line not in existing]
        if not missing:
            self.log(".gitignore уже содержит служебные исключения.")
            return
        with gitignore.open("a", encoding="utf-8") as f:
            if existing_lines and existing_lines[-1].strip():
                f.write("\n")
            f.write("\n# Local generated files, added by N_118 auto deploy\n")
            for line in missing:
                f.write(line + "\n")
        self.log(f"В .gitignore добавлены исключения: {', '.join(missing)}")

    def ensure_env_local(self) -> None:
        env_local = self.project_dir / ".env.local"

        if env_local.exists():
            self.log("Файл .env.local найден.")
            return

        self.log("")
        self.log("ПРЕДУПРЕЖДЕНИЕ: файл .env.local не найден.")
        self.log("Для Vite файл должен лежать в корне проекта:")
        self.log("  VITE_SUPABASE_URL=...")
        self.log("  VITE_SUPABASE_KEY=...")

    def backup_existing_files(self, payload_root: Path, files: list[Path]) -> Path | None:
        timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.project_dir / "_deploy_backups" / timestamp
        copied_any = False

        for source in files:
            relative = source.relative_to(payload_root)
            target = self.project_dir / relative

            if target.exists():
                backup_target = backup_dir / relative
                backup_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup_target)
                copied_any = True

        if copied_any:
            self.log("")
            self.log(f"Резервная копия заменяемых файлов создана: {backup_dir}")
            return backup_dir

        self.log("")
        self.log("Заменяемых существующих файлов не найдено, резервная копия не нужна.")
        return None

    def copy_payload(self, payload_root: Path, files: list[Path]) -> list[Path]:
        changed = []

        self.log("")
        self.log("Копирую файлы в проект:")

        for source in files:
            relative = source.relative_to(payload_root)
            target = self.project_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            changed.append(relative)
            self.log(f"  {relative}")

        if not changed:
            raise DeployError("В архиве не найдено файлов для копирования.")

        return changed

    def execute_sql_files(self, extract_dir: Path) -> None:
        if not self.run_sql:
            self.log("")
            self.log("Выполнение SQL отключено.")
            return

        if not PSYCOPG2_AVAILABLE:
            raise DeployError(
                "Не установлен пакет psycopg2-binary. Установи в PyCharm Terminal: pip install psycopg2-binary"
            )

        if not self.db_url:
            raise DeployError("Включено выполнение SQL, но не указан PostgreSQL connection string Supabase.")

        sql_files = self.inspector.collect_sql_files(extract_dir)

        if self.selected_sql_names is not None:
            sql_files = [path for path in sql_files if path.name in self.selected_sql_names]

        if not sql_files:
            self.log("")
            self.log("SQL-файлы в архиве не найдены или не выбраны.")
            return

        self.log("")
        self.log("=" * 80)
        self.log("ВЫПОЛНЕНИЕ SQL В SUPABASE")
        self.log("=" * 80)

        try:
            connection = psycopg2.connect(self.db_url)
            connection.autocommit = False
        except Exception as error:
            raise DeployError(f"Не удалось подключиться к Supabase PostgreSQL: {error}") from error

        try:
            with connection:
                with connection.cursor() as cursor:
                    for path in sql_files:
                        relative = path.relative_to(extract_dir)
                        self.log("")
                        self.log(f"SQL: {relative}")

                        try:
                            sql_text = path.read_text(encoding="utf-8")
                        except UnicodeDecodeError:
                            sql_text = path.read_text(encoding="cp1251", errors="replace")

                        if not sql_text.strip():
                            self.log("  Пропущен пустой SQL-файл.")
                            continue

                        cursor.execute(sql_text)
                        self.log("  Выполнено.")

            self.log("")
            self.log("Все выбранные SQL-скрипты выполнены.")
        except Exception as error:
            connection.rollback()
            raise DeployError(f"Ошибка выполнения SQL. Изменения SQL отменены. Подробности: {error}") from error
        finally:
            connection.close()

    def git_has_changes(self) -> bool:
        result = self.run_command([self.command_for("git"), "status", "--porcelain"])
        return bool(result.stdout.strip())

    def run_build(self) -> None:
        self.run_command([self.command_for("npm"), "run", "build"])

    def git_commit_and_push(self, changed_files: list[Path] | None = None) -> None:
        if not self.git_has_changes():
            self.log("")
            self.log("Git не видит изменений. Коммит не нужен.")
            return

        git = self.command_for("git")
        safe_paths: list[str] = []
        for rel in changed_files or []:
            rel_text = rel.as_posix()
            parts = set(rel.parts)
            if "_deploy_backups" in parts or "_chatgpt_logs" in parts or rel.name.lower() in BLOCKED_NAMES:
                continue
            safe_paths.append(rel_text)

        for extra in [".gitignore", "package-lock.json"]:
            if (self.project_dir / extra).exists():
                safe_paths.append(extra)

        # Deduplicate while preserving order.
        seen: set[str] = set()
        safe_paths = [p for p in safe_paths if not (p in seen or seen.add(p))]

        if not safe_paths:
            self.log("Нет безопасных файлов для git add. Показываю статус для диагностики.")
            self.run_command([git, "status", "--short"], allow_fail=True)
            return

        self.log("")
        self.log("Git add будет выполнен только для файлов из архива и служебного .gitignore/package-lock.json:")
        for item in safe_paths:
            self.log(f"  {item}")

        # Split to avoid command line length limits on Windows.
        chunk: list[str] = []
        chunk_len = 0
        for item in safe_paths:
            chunk.append(item)
            chunk_len += len(item) + 1
            if chunk_len > 6000:
                self.run_command([git, "add"] + chunk)
                chunk = []
                chunk_len = 0
        if chunk:
            self.run_command([git, "add"] + chunk)

        if not self.git_has_changes():
            self.log("")
            self.log("После git add изменений для коммита нет.")
            return

        self.run_command([git, "commit", "-m", self.commit_message])

        if self.no_push:
            self.log("")
            self.log("Режим проверки включён. git push не выполняю.")
            return

        self.run_command([git, "push"])

    def deploy(self) -> None:
        self.log("Проверяю проект и архив...")
        self.check_project_dir()
        self.inspector.check_archive()
        self.ensure_gitignore()
        self.ensure_env_local()

        with tempfile.TemporaryDirectory(prefix="site_deploy_") as temp_name:
            temp_root = Path(temp_name)
            extract_dir = self.inspector.extract_archive(temp_root)

            self.log("")
            self.log("=" * 80)
            self.log("ИНСТРУКЦИИ ИЗ АРХИВА")
            self.log("=" * 80)

            instructions = self.inspector.read_instruction_files(extract_dir)
            for line in instructions.splitlines():
                self.log(line)

            self.execute_sql_files(extract_dir)

            payload_root = self.inspector.find_payload_root(extract_dir)
            files = self.inspector.collect_files(payload_root)

            self.log("")
            self.log(f"Найдено файлов для применения: {len(files)}")

            self.backup_existing_files(payload_root, files)
            changed_files = self.copy_payload(payload_root, files)

        self.log("")
        self.log("Проверяю зависимости...")
        self.run_command([self.command_for("npm"), "install"])

        if self.skip_build:
            self.log("")
            self.log("Сборка пропущена по настройке.")
        else:
            self.log("")
            self.log("Запускаю сборку...")
            self.run_build()

        self.log("")
        self.log("Делаю git commit и git push...")
        self.git_commit_and_push(changed_files)

        self.log("")
        self.log("=" * 80)
        self.log("ГОТОВО")
        self.log("=" * 80)

        if self.no_push:
            self.log("Изменения применены локально. Push не выполнялся.")
        else:
            self.log("Изменения отправлены в GitHub. Если Vercel подключён, деплой начнётся автоматически.")


class App(BaseWindow):
    def __init__(self) -> None:
        super().__init__()

        self.title(APP_TITLE)
        self.geometry("1120x820")
        self.minsize(980, 720)

        self.log_queue: queue.Queue[str] = queue.Queue()
        self.worker_thread: threading.Thread | None = None
        self.sql_vars: dict[str, tk.BooleanVar] = {}
        self.log_file_path: Path | None = None

        config = load_config()

        self.archive_var = tk.StringVar(value=config.get("archive_path", ""))
        self.project_var = tk.StringVar(value=config.get("project_dir", DEFAULT_PROJECT_DIR))
        self.message_var = tk.StringVar(value=config.get("commit_message", "Update site from archive"))
        self.no_push_var = tk.BooleanVar(value=bool(config.get("no_push", False)))
        self.skip_build_var = tk.BooleanVar(value=bool(config.get("skip_build", False)))
        self.run_sql_var = tk.BooleanVar(value=bool(config.get("run_sql", False)))
        self.db_url_var = tk.StringVar(value=config.get("db_url", "") if config.get("save_db_url", False) else "")
        self.save_db_url_var = tk.BooleanVar(value=bool(config.get("save_db_url", False)))

        self.drop_label: tk.Label | None = None

        self.create_widgets()
        self.install_text_hotkeys()
        self.after(100, self.process_log_queue)
        self.refresh_sql_list_from_archive(silent=True)

    def create_widgets(self) -> None:
        root = ttk.Frame(self, padding=16)
        root.pack(fill=tk.BOTH, expand=True)

        title = ttk.Label(root, text=APP_TITLE, font=("Segoe UI", 18, "bold"))
        title.pack(anchor="w")

        subtitle = ttk.Label(
            root,
            text="Перетащи zip-архив. Установщик может выполнить SQL в Supabase, применить файлы и отправить изменения в GitHub/Vercel.",
        )
        subtitle.pack(anchor="w", pady=(4, 12))

        self.create_drop_zone(root)

        form = ttk.Frame(root)
        form.pack(fill=tk.X, pady=(12, 0))

        self.add_path_row(
            form,
            row=0,
            label="Zip-архив обновления",
            variable=self.archive_var,
            button_text="Выбрать архив",
            command=self.choose_archive,
        )

        self.add_path_row(
            form,
            row=1,
            label="Папка проекта",
            variable=self.project_var,
            button_text="Выбрать папку",
            command=self.choose_project_dir,
        )

        ttk.Label(form, text="Текст commit").grid(row=2, column=0, sticky="w", padx=(0, 10), pady=8)
        commit_entry = ttk.Entry(form, textvariable=self.message_var)
        commit_entry.grid(row=2, column=1, sticky="ew", pady=8, padx=(0, 10))
        form.columnconfigure(1, weight=1)

        options = ttk.Frame(root)
        options.pack(fill=tk.X, pady=(8, 10))

        ttk.Checkbutton(
            options,
            text="Проверочный режим: не делать git push",
            variable=self.no_push_var,
        ).pack(side=tk.LEFT, padx=(0, 18))

        ttk.Checkbutton(
            options,
            text="Пропустить npm run build",
            variable=self.skip_build_var,
        ).pack(side=tk.LEFT, padx=(0, 18))

        sql_frame = ttk.LabelFrame(root, text="Supabase SQL", padding=12)
        sql_frame.pack(fill=tk.X, pady=(0, 10))

        sql_top = ttk.Frame(sql_frame)
        sql_top.pack(fill=tk.X)

        ttk.Checkbutton(
            sql_top,
            text="Выполнить SQL-скрипты из архива в Supabase",
            variable=self.run_sql_var,
        ).pack(side=tk.LEFT, padx=(0, 18))

        ttk.Checkbutton(
            sql_top,
            text="Сохранить connection string в настройках этой программы",
            variable=self.save_db_url_var,
        ).pack(side=tk.LEFT)

        ttk.Label(sql_frame, text="PostgreSQL connection string Supabase").pack(anchor="w", pady=(10, 3))

        db_row = ttk.Frame(sql_frame)
        db_row.pack(fill=tk.X)

        db_entry = ttk.Entry(db_row, textvariable=self.db_url_var, show="*")
        db_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))

        ttk.Button(db_row, text="Показать/скрыть", command=lambda: self.toggle_password_visibility(db_entry)).pack(side=tk.LEFT)

        hint = ttk.Label(
            sql_frame,
            text="Брать в Supabase: Project Settings -> Database -> Connection string. Нужен пароль базы, который задавался при создании проекта.",
        )
        hint.pack(anchor="w", pady=(6, 8))

        sql_list_top = ttk.Frame(sql_frame)
        sql_list_top.pack(fill=tk.X)

        ttk.Label(sql_list_top, text="SQL-файлы в архиве").pack(side=tk.LEFT)
        ttk.Button(sql_list_top, text="Обновить список SQL", command=self.refresh_sql_list_from_archive).pack(side=tk.RIGHT)

        self.sql_list_container = ttk.Frame(sql_frame)
        self.sql_list_container.pack(fill=tk.X, pady=(6, 0))

        buttons = ttk.Frame(root)
        buttons.pack(fill=tk.X, pady=(0, 12))

        self.preview_button = ttk.Button(buttons, text="Проверить архив", command=self.preview_archive)
        self.preview_button.pack(side=tk.LEFT)

        self.deploy_button = ttk.Button(buttons, text="Выполнить автодеплой", command=self.start_deploy)
        self.deploy_button.pack(side=tk.LEFT, padx=(10, 0))

        self.clear_button = ttk.Button(buttons, text="Очистить лог", command=self.clear_log)
        self.clear_button.pack(side=tk.LEFT, padx=(10, 0))

        self.export_log_button = ttk.Button(buttons, text="Создать лог для ChatGPT", command=self.export_log_for_chatgpt)
        self.export_log_button.pack(side=tk.LEFT, padx=(10, 0))

        self.progress = ttk.Progressbar(root, mode="indeterminate")
        self.progress.pack(fill=tk.X, pady=(0, 10))

        log_label = ttk.Label(root, text="Лог выполнения")
        log_label.pack(anchor="w")

        log_frame = ttk.Frame(root)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

        self.log_text = tk.Text(
            log_frame,
            wrap="word",
            height=22,
            font=("Consolas", 10),
            bg="#111827",
            fg="#e5e7eb",
            insertbackground="#e5e7eb",
        )
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.configure(yscrollcommand=scrollbar.set)

        self.log(f"Готово к работе. Версия: {APP_VERSION}")
        self.log(f"Папка проекта по умолчанию: {DEFAULT_PROJECT_DIR}")
        self.log(f"npm найден: {detect_tool('npm') or 'не найден'}")
        self.log(f"git найден: {detect_tool('git') or 'не найден'}")

        if DND_AVAILABLE:
            self.log("Drag-and-drop включён: можно перетащить zip-архив в верхнее поле.")
        else:
            self.log("Drag-and-drop недоступен. Установи: pip install tkinterdnd2")

        if PSYCOPG2_AVAILABLE:
            self.log("psycopg2-binary найден: SQL можно выполнять автоматически.")
        else:
            self.log("psycopg2-binary не найден. Для SQL установи: pip install psycopg2-binary")

    def create_drop_zone(self, parent: ttk.Frame) -> None:
        drop_frame = tk.Frame(
            parent,
            bg="#eff6ff",
            highlightbackground="#2563eb",
            highlightthickness=2,
            bd=0,
        )
        drop_frame.pack(fill=tk.X, pady=(0, 4))

        text = "Перетащи сюда zip-архив обновления\nнапример: N_96_project_compact_one_sheet_schedule.zip"

        if not DND_AVAILABLE:
            text = "Drag-and-drop недоступен\nУстанови: pip install tkinterdnd2\nИли выбери архив кнопкой ниже"

        self.drop_label = tk.Label(
            drop_frame,
            text=text,
            bg="#eff6ff",
            fg="#1e3a8a",
            font=("Segoe UI", 13, "bold"),
            padx=20,
            pady=22,
            justify="center",
        )
        self.drop_label.pack(fill=tk.X)

        if DND_AVAILABLE:
            drop_frame.drop_target_register(DND_FILES)
            drop_frame.dnd_bind("<<Drop>>", self.handle_archive_drop)

            self.drop_label.drop_target_register(DND_FILES)
            self.drop_label.dnd_bind("<<Drop>>", self.handle_archive_drop)

    def toggle_password_visibility(self, entry: ttk.Entry) -> None:
        current = entry.cget("show")
        entry.configure(show="" if current == "*" else "*")

    def install_text_hotkeys(self) -> None:
        """
        Нормальная работа Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A в текстовых полях.

        На Windows при русской раскладке Tkinter иногда получает не c/v/x/a,
        а кириллические keysyms. Поэтому обработчик проверяет и keycode
        физических клавиш:
          A = 65
          C = 67
          V = 86
          X = 88
        """
        self.bind_all("<Control-KeyPress>", self.handle_control_text_shortcut, add="+")
        self.bind_all("<Control-Insert>", self.handle_copy_shortcut, add="+")
        self.bind_all("<Shift-Insert>", self.handle_paste_shortcut, add="+")

    def get_focused_text_widget(self):
        widget = self.focus_get()

        if isinstance(widget, (tk.Entry, tk.Text, ttk.Entry, ttk.Combobox)):
            return widget

        return None

    def handle_copy_shortcut(self, event=None):
        widget = self.get_focused_text_widget()
        if not widget:
            return None

        widget.event_generate("<<Copy>>")
        return "break"

    def handle_paste_shortcut(self, event=None):
        widget = self.get_focused_text_widget()
        if not widget:
            return None

        widget.event_generate("<<Paste>>")
        return "break"

    def handle_cut_shortcut(self, event=None):
        widget = self.get_focused_text_widget()
        if not widget:
            return None

        widget.event_generate("<<Cut>>")
        return "break"

    def handle_select_all_shortcut(self, event=None):
        widget = self.get_focused_text_widget()
        if not widget:
            return None

        if isinstance(widget, tk.Text):
            widget.tag_add("sel", "1.0", "end-1c")
            widget.mark_set("insert", "1.0")
            widget.see("insert")
        else:
            widget.selection_range(0, tk.END)
            widget.icursor(tk.END)

        return "break"

    def handle_control_text_shortcut(self, event):
        widget = self.get_focused_text_widget()
        if not widget:
            return None

        keysym = (event.keysym or "").lower()
        char = (event.char or "").lower()
        keycode = getattr(event, "keycode", None)

        copy_keys = {"c", "с", "cyrillic_es"}
        paste_keys = {"v", "м", "cyrillic_em"}
        cut_keys = {"x", "ч", "cyrillic_che"}
        select_all_keys = {"a", "ф", "cyrillic_ef"}

        if keycode == 67 or keysym in copy_keys or char in copy_keys:
            return self.handle_copy_shortcut(event)

        if keycode == 86 or keysym in paste_keys or char in paste_keys:
            return self.handle_paste_shortcut(event)

        if keycode == 88 or keysym in cut_keys or char in cut_keys:
            return self.handle_cut_shortcut(event)

        if keycode == 65 or keysym in select_all_keys or char in select_all_keys:
            return self.handle_select_all_shortcut(event)

        return None

    def add_path_row(self, parent, row: int, label: str, variable: tk.StringVar, button_text: str, command) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=8)

        entry = ttk.Entry(parent, textvariable=variable)
        entry.grid(row=row, column=1, sticky="ew", pady=8, padx=(0, 10))

        button = ttk.Button(parent, text=button_text, command=command)
        button.grid(row=row, column=2, sticky="e", pady=8)

    def handle_archive_drop(self, event) -> None:
        try:
            paths = self.tk.splitlist(event.data)
            if not paths:
                return

            dropped_path = Path(paths[0])

            if dropped_path.is_dir():
                messagebox.showwarning(APP_TITLE, "Нужен zip-архив, а не папка.")
                return

            if dropped_path.suffix.lower() != ".zip":
                messagebox.showwarning(APP_TITLE, "Нужен файл с расширением .zip.")
                return

            self.archive_var.set(str(dropped_path))
            self.save_current_config()
            self.update_drop_zone_text(dropped_path)
            self.refresh_sql_list_from_archive(silent=True)
            self.log("")
            self.log(f"Архив выбран через drag-and-drop: {dropped_path}")

        except Exception as error:
            self.log("")
            self.log(f"Ошибка drag-and-drop: {error}")
            messagebox.showerror(APP_TITLE, str(error))

    def update_drop_zone_text(self, archive_path: Path) -> None:
        if not self.drop_label:
            return

        self.drop_label.configure(
            text=f"Архив выбран:\n{archive_path}",
            bg="#ecfdf5",
            fg="#166534",
        )

    def choose_archive(self) -> None:
        filename = filedialog.askopenfilename(
            title="Выбери zip-архив обновления",
            filetypes=[("Zip archives", "*.zip"), ("All files", "*.*")],
        )

        if filename:
            self.archive_var.set(filename)
            self.save_current_config()
            self.update_drop_zone_text(Path(filename))
            self.refresh_sql_list_from_archive(silent=True)

    def choose_project_dir(self) -> None:
        dirname = filedialog.askdirectory(title="Выбери папку проекта")

        if dirname:
            self.project_var.set(dirname)
            self.save_current_config()

    def save_current_config(self) -> None:
        data = {
            "archive_path": self.archive_var.get(),
            "project_dir": self.project_var.get(),
            "commit_message": self.message_var.get(),
            "no_push": self.no_push_var.get(),
            "skip_build": self.skip_build_var.get(),
            "run_sql": self.run_sql_var.get(),
            "save_db_url": self.save_db_url_var.get(),
        }

        if self.save_db_url_var.get():
            data["db_url"] = self.db_url_var.get()
        else:
            data["db_url"] = ""

        save_config(data)

    def refresh_sql_list_from_archive(self, silent: bool = False) -> None:
        for child in self.sql_list_container.winfo_children():
            child.destroy()

        self.sql_vars.clear()

        archive_text = self.archive_var.get().strip()

        if not archive_text:
            ttk.Label(self.sql_list_container, text="Архив не выбран.").pack(anchor="w")
            return

        archive_path = Path(archive_text)
        inspector = ArchiveInspector(archive_path)

        try:
            inspector.check_archive()
            with tempfile.TemporaryDirectory(prefix="sql_preview_") as temp_name:
                extract_dir = inspector.extract_archive(Path(temp_name))
                sql_files = inspector.collect_sql_files(extract_dir)

                if not sql_files:
                    ttk.Label(self.sql_list_container, text="SQL-файлы в архиве не найдены.").pack(anchor="w")
                    return

                for path in sql_files:
                    variable = tk.BooleanVar(value=True)
                    self.sql_vars[path.name] = variable
                    ttk.Checkbutton(
                        self.sql_list_container,
                        text=str(path.relative_to(extract_dir)),
                        variable=variable,
                    ).pack(anchor="w")

        except Exception as error:
            ttk.Label(self.sql_list_container, text=f"Не удалось прочитать SQL: {error}").pack(anchor="w")
            if not silent:
                messagebox.showerror(APP_TITLE, str(error))

    def build_deployer(self) -> Deployer:
        archive_text = self.archive_var.get().strip()
        project_text = self.project_var.get().strip()
        commit_message = self.message_var.get().strip() or "Update site from archive"

        if not archive_text:
            raise DeployError("Не выбран zip-архив.")

        if not project_text:
            raise DeployError("Не выбрана папка проекта.")

        selected_sql_names = {
            name
            for name, variable in self.sql_vars.items()
            if variable.get()
        }

        return Deployer(
            archive_path=Path(archive_text),
            project_dir=Path(project_text),
            commit_message=commit_message,
            no_push=self.no_push_var.get(),
            skip_build=self.skip_build_var.get(),
            run_sql=self.run_sql_var.get(),
            db_url=self.db_url_var.get(),
            selected_sql_names=selected_sql_names,
            logger=self.thread_safe_log,
        )

    def preview_archive(self) -> None:
        try:
            self.save_current_config()
            archive_path = Path(self.archive_var.get().strip())
            inspector = ArchiveInspector(archive_path)
            inspector.check_archive()

            with tempfile.TemporaryDirectory(prefix="site_deploy_preview_") as temp_name:
                temp_root = Path(temp_name)
                extract_dir = inspector.extract_archive(temp_root)
                payload_root = inspector.find_payload_root(extract_dir)
                files = inspector.collect_files(payload_root)
                sql_files = inspector.collect_sql_files(extract_dir)
                instructions = inspector.read_instruction_files(extract_dir)

                file_lines = [str(path.relative_to(payload_root)) for path in files]
                sql_lines = [str(path.relative_to(extract_dir)) for path in sql_files]

                self.log("")
                self.log("ИНСТРУКЦИИ ИЗ АРХИВА")
                self.log("====================")
                for line in instructions.splitlines():
                    self.log(line)

                self.log("")
                self.log("SQL-ФАЙЛЫ")
                self.log("=========")
                if sql_lines:
                    for line in sql_lines:
                        self.log(line)
                else:
                    self.log("SQL-файлы не найдены.")

                self.log("")
                self.log("ФАЙЛЫ ДЛЯ ПРИМЕНЕНИЯ")
                self.log("====================")
                if file_lines:
                    for line in file_lines:
                        self.log(line)
                else:
                    self.log("Файлы для копирования не найдены.")

        except Exception as error:
            self.log("")
            self.log("ОШИБКА ПРОВЕРКИ:")
            self.log(str(error))
            messagebox.showerror(APP_TITLE, str(error))

    def start_deploy(self) -> None:
        if self.worker_thread and self.worker_thread.is_alive():
            messagebox.showwarning(APP_TITLE, "Операция уже выполняется.")
            return

        try:
            self.save_current_config()
            deployer = self.build_deployer()
        except Exception as error:
            messagebox.showerror(APP_TITLE, str(error))
            return

        if self.run_sql_var.get():
            if not self.sql_vars:
                answer = messagebox.askyesno(
                    APP_TITLE,
                    "SQL включён, но SQL-файлы не выбраны. Продолжить без SQL?",
                )
                if not answer:
                    return

            else:
                answer = messagebox.askyesno(
                    APP_TITLE,
                    "Будут выполнены выбранные SQL-скрипты в Supabase. Продолжить?",
                )
                if not answer:
                    return

        answer = messagebox.askyesno(
            APP_TITLE,
            "Применить архив к проекту и запустить сборку/commit/push?",
        )

        if not answer:
            return

        self.set_busy(True)

        self.worker_thread = threading.Thread(
            target=self.worker_deploy,
            args=(deployer,),
            daemon=True,
        )
        self.worker_thread.start()

    def worker_deploy(self, deployer: Deployer) -> None:
        try:
            deployer.deploy()
            self.log_queue.put("__DONE_OK__")
        except Exception as error:
            self.thread_safe_log("")
            self.thread_safe_log("=" * 80)
            self.thread_safe_log("ОШИБКА")
            self.thread_safe_log("=" * 80)
            self.thread_safe_log(str(error))
            self.log_queue.put("__DONE_ERROR__" + str(error))

    def set_busy(self, busy: bool) -> None:
        state = tk.DISABLED if busy else tk.NORMAL

        self.preview_button.configure(state=state)
        self.deploy_button.configure(state=state)
        self.clear_button.configure(state=state)
        self.export_log_button.configure(state=state)

        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    def thread_safe_log(self, message: str) -> None:
        self.log_queue.put(message)

    def ensure_log_file(self) -> Path:
        if self.log_file_path is None:
            project_text = self.project_var.get().strip() or DEFAULT_PROJECT_DIR
            logs_dir = Path(project_text) / "_chatgpt_logs"
            try:
                logs_dir.mkdir(parents=True, exist_ok=True)
            except Exception:
                logs_dir = Path(__file__).resolve().parent / "_chatgpt_logs"
                logs_dir.mkdir(parents=True, exist_ok=True)
            stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            self.log_file_path = logs_dir / f"{APP_VERSION}_auto_deploy_log_{stamp}.txt"
            header = [
                APP_TITLE,
                f"Version: {APP_VERSION}",
                f"Created: {dt.datetime.now().isoformat(timespec='seconds')}",
                "Secrets are redacted before writing this log.",
                "",
            ]
            self.log_file_path.write_text("\n".join(header), encoding="utf-8")
        return self.log_file_path

    def log(self, message: str) -> None:
        redacted = Redactor.redact(str(message))
        self.log_text.insert(tk.END, redacted + "\n")
        self.log_text.see(tk.END)
        try:
            path = self.ensure_log_file()
            with path.open("a", encoding="utf-8") as f:
                f.write(redacted + "\n")
        except Exception:
            pass
        self.update_idletasks()

    def export_log_for_chatgpt(self) -> None:
        try:
            source = self.ensure_log_file()
            stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
            target = source.with_name(f"{APP_VERSION}_log_for_chatgpt_{stamp}.txt")
            target.write_text(Redactor.redact(source.read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
            self.log(f"Лог для ChatGPT создан: {target}")
            if is_windows():
                os.startfile(str(target.parent))  # type: ignore[attr-defined]
        except Exception as error:
            messagebox.showerror(APP_TITLE, f"Не удалось создать лог: {error}")

    def clear_log(self) -> None:
        self.log_text.delete("1.0", tk.END)

    def process_log_queue(self) -> None:
        try:
            while True:
                message = self.log_queue.get_nowait()

                if message == "__DONE_OK__":
                    self.set_busy(False)
                    messagebox.showinfo(APP_TITLE, "Готово. Проверь Vercel Deployments.")
                    continue

                if message.startswith("__DONE_ERROR__"):
                    self.set_busy(False)
                    messagebox.showerror(APP_TITLE, message.replace("__DONE_ERROR__", "", 1))
                    continue

                self.log(message)
        except queue.Empty:
            pass

        self.after(100, self.process_log_queue)


if __name__ == "__main__":
    app = App()
    app.mainloop()
