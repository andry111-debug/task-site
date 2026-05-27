import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseReady } from "./supabaseClient";
import JSZip from "jszip";
import "./App.css";

const ROLE_LABELS = {
  admin: "Админ",
  architect: "Архитектор",
  designer: "Проектанты",
  project_manager: "Руководитель проекта",
  customer_service: "Служба заказчика",
  external: "Сторонние люди",
  employee: "Проектанты",
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Админ" },
  { value: "architect", label: "Архитектор" },
  { value: "designer", label: "Проектанты" },
  { value: "project_manager", label: "Руководитель проекта" },
  { value: "customer_service", label: "Служба заказчика" },
  { value: "external", label: "Сторонние люди" },
];


const ARCHITECT_STAGE_OPTIONS = [
  { value: "П", label: "Стадия П" },
  { value: "Р", label: "Стадия Р" },
];

const ARCHITECT_FILE_CATEGORIES = [
  { value: "project_file", label: "Файлы проекта", shortLabel: "Файлы" },
  { value: "tz", label: "Техническое задание", shortLabel: "ТЗ" },
  { value: "source", label: "Исходники", shortLabel: "Исходники" },
  { value: "remark", label: "Замечания", shortLabel: "Замечания" },
];


const APP_VERSION = "N_207";
const APP_DEPLOY_NAME = "N_160_project_site_via_gip_api";
const GIP_API_BASE_URL = String(import.meta.env.VITE_GIP_API_BASE_URL || "/api").trim().replace(/\/+$/g, "") || "/api";
const GIP_API_KEY = import.meta.env.VITE_GIP_API_KEY || "";
const YANDEX_SERVICE_ROOT = import.meta.env.VITE_YANDEX_SERVICE_ROOT || "/Программные файлы/OPR-site";
// Local Windows paths from the GIP program usually start after the Yandex.Disk sync root.
// For this project that sync root corresponds to /Для Технического заказчика on Yandex.Disk.
const YANDEX_DISK_ROOT = import.meta.env.VITE_YANDEX_DISK_ROOT || "/Для Технического заказчика";
const YANDEX_GIP_ROOT = import.meta.env.VITE_YANDEX_GIP_ROOT || "/Папка ГИПа";
const YANDEX_INCOMING_FOLDER = import.meta.env.VITE_YANDEX_INCOMING_FOLDER || "_Входящие_с_сайта";
const MAX_INCOMING_UPLOAD_BYTES = Number(import.meta.env.VITE_MAX_INCOMING_UPLOAD_BYTES || 150 * 1024 * 1024);
const INCOMING_UPLOAD_CHUNK_BYTES = Number(import.meta.env.VITE_INCOMING_UPLOAD_CHUNK_BYTES || 2 * 1024 * 1024);
const YANDEX_LOCAL_ROOTS = String(
  import.meta.env.VITE_YANDEX_LOCAL_ROOTS ||
    import.meta.env.VITE_YANDEX_LOCAL_ROOT ||
    "C:/Projects/ОПР;C:/Projects/OPR"
)
  .split(/[;|\n]+/)
  .map((item) => normalizePathSeparators(item).replace(/\/+$/g, ""))
  .filter(Boolean);

function normalizePathSeparators(value) {
  return String(value || "").trim().replace(/\\+/g, "/").replace(/\/+/g, "/");
}

function trimSlashes(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function joinDiskPath(...parts) {
  const cleaned = parts
    .map((part) => trimSlashes(normalizePathSeparators(part)))
    .filter(Boolean);
  return cleaned.length ? `/${cleaned.join("/")}` : "";
}

function safeDiskPart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
}

function safeStorageKeyPart(value) {
  // Must match the local program safe_filename(): keep letters/numbers, dash, underscore and dot; replace everything else with underscore.
  return String(value || "")
    .trim()
    .replace(/[^\p{L}\p{N}\-_.]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
}

function makeSectionStorageKey(section) {
  return `GP_${safeStorageKeyPart(section?.building_gp_no || "")}_${safeStorageKeyPart(section?.building_name || "")}__${safeStorageKeyPart(normalizeStage(section?.stage || "П"))}_${safeStorageKeyPart(section?.section_code || "")}`;
}

function toYandexDiskPathWithRoot(rawPath, diskRoot = YANDEX_DISK_ROOT) {
  const normalizedRaw = normalizePathSeparators(rawPath);
  if (!normalizedRaw) return "";

  // Some paths arrive from Windows as /C:/... after joining strings in the browser.
  // Yandex.Disk REST API expects disk paths, not local Windows paths.
  const normalized = normalizedRaw.replace(/^\/([A-Za-z]:\/)/, "$1");
  const lower = normalized.toLowerCase();

  // If the path already contains a known Yandex.Disk root folder, keep everything from that folder.
  const markers = ["Для Технического заказчика", "Папка ГИПа", "Внутренняя Технологии", "Программные файлы"];
  for (const marker of markers) {
    const index = lower.indexOf(marker.toLowerCase());
    if (index >= 0) {
      return `/${normalized.slice(index).replace(/^\/+/, "")}`;
    }
  }

  // Map local synchronized Yandex.Disk roots to the selected disk root.
  // For common folders this is /Для Технического заказчика; for GIP folders this is /Папка ГИПа.
  for (const localRoot of YANDEX_LOCAL_ROOTS) {
    const root = normalizePathSeparators(localRoot).replace(/\/+$/g, "");
    if (!root) continue;
    const rootLower = root.toLowerCase();
    if (lower === rootLower || lower.startsWith(`${rootLower}/`)) {
      const rest = normalized.slice(root.length).replace(/^\/+/, "");
      return joinDiskPath(diskRoot, rest);
    }
  }

  // Last-resort Windows fallback: strip the drive and common project root.
  // This prevents requests like /C:/Projects/... from reaching Yandex.Disk.
  if (/^[A-Za-z]:\//.test(normalized)) {
    const withoutDrive = normalized.replace(/^[A-Za-z]:\//, "");
    const projectMarkers = ["Projects/ОПР", "Projects/OPR", "Проекты/ОПР"];
    const fallbackLower = withoutDrive.toLowerCase();
    for (const marker of projectMarkers) {
      const markerLower = marker.toLowerCase();
      if (fallbackLower === markerLower || fallbackLower.startsWith(`${markerLower}/`)) {
        const rest = withoutDrive.slice(marker.length).replace(/^\/+/, "");
        return joinDiskPath(diskRoot, rest);
      }
    }
    return joinDiskPath(diskRoot, withoutDrive);
  }

  if (normalized.startsWith("/")) return normalized;
  return joinDiskPath(diskRoot, normalized);
}

function toYandexDiskPath(rawPath) {
  return toYandexDiskPathWithRoot(rawPath, YANDEX_DISK_ROOT);
}

function toYandexGipDiskPath(rawPath) {
  return toYandexDiskPathWithRoot(rawPath, YANDEX_GIP_ROOT);
}

function makeSiteQueuePath(section, folderName) {
  const buildingPart = `${safeDiskPart(section?.building_gp_no || "-")}_${safeDiskPart(section?.building_name || "building")}`;
  return joinDiskPath(
    YANDEX_SERVICE_ROOT,
    "upload_queue",
    folderName,
    buildingPart,
    normalizeStage(section?.stage || "П"),
    safeDiskPart(section?.section_code || "section")
  );
}

function isYandexNotFoundMessage(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("не удалось найти запрошенный ресурс") ||
    text.includes("resource not found") ||
    text.includes("not found") ||
    text.includes("disknotfound") ||
    text.includes("404")
  );
}

function getMissingCatalogText(catalog) {
  if (catalog?.value === "source") {
    return "Папка исходников не найдена на Яндекс.Диске в корне /Папка ГИПа. Это нормально, если структура ГИПа еще не создана или исходники по этому разделу не добавлялись.";
  }
  if (catalog?.value === "remark") {
    return "Папка замечаний не найдена на Яндекс.Диске в корне /Папка ГИПа. Это нормально, если структура ГИПа еще не создана или замечания по этому разделу не добавлялись.";
  }
  return "Папка не найдена на Яндекс.Диске. Проверьте точное имя каталога и синхронизацию Яндекс.Диска.";
}

function pickExplicitYandexPath(section, fieldName, fallbackPath) {
  const explicit = normalizePathSeparators(section?.[fieldName] || "");
  if (explicit) return explicit;
  return fallbackPath || "";
}

function getYandexCatalogsForSection(section) {
  // N_139: prefer explicit path-map fields exported by the local GIP program.
  // The website should not infer the GIP structure from the technical-customer folder names.
  const commonFolder = toYandexDiskPath(section?.common_storage_folder || "");
  const gipFolder = toYandexGipDiskPath(section?.gip_storage_folder || "");
  const sectionStorageKey = makeSectionStorageKey(section);

  const fallbackProjectPath = commonFolder;
  const fallbackTzPath = commonFolder ? joinDiskPath(commonFolder, "ТЗ") : "";
  const fallbackSourcesPath = gipFolder ? joinDiskPath(gipFolder, "исходники", sectionStorageKey) : "";
  const fallbackRemarksPath = gipFolder ? joinDiskPath(gipFolder, "замечания", sectionStorageKey) : "";

  const projectPath = pickExplicitYandexPath(section, "project_files_yandex_path", fallbackProjectPath);
  const tzPath = pickExplicitYandexPath(section, "technical_task_yandex_path", fallbackTzPath);
  const sourcesPath = pickExplicitYandexPath(section, "sources_yandex_path", fallbackSourcesPath);
  const remarksPath = pickExplicitYandexPath(section, "remarks_yandex_path", fallbackRemarksPath);

  return [
    {
      value: "project_file",
      label: "Файлы проекта",
      path: projectPath,
      source: section?.project_files_yandex_path ? "project_files_yandex_path" : "common_storage_folder",
      description: "Основная папка раздела. В N_139 сайт использует готовый путь из таблицы соответствий локальной программы.",
    },
    {
      value: "tz",
      label: "ТЗ",
      path: tzPath,
      source: section?.technical_task_yandex_path ? "technical_task_yandex_path" : "common_storage_folder/ТЗ",
      description: "Подпапка ТЗ. В N_139 сайт использует готовый путь из таблицы соответствий локальной программы.",
    },
    {
      value: "source",
      label: "Исходники",
      path: sourcesPath,
      source: section?.sources_yandex_path ? "sources_yandex_path / таблица соответствий" : "fallback: gip_storage_folder/исходники/<ключ раздела>",
      description: "Папка исходников из структуры ГИПа. Путь задается локальной программой, чтобы не зависеть от различий в названиях папок.",
    },
    {
      value: "remark",
      label: "Замечания",
      path: remarksPath,
      source: section?.remarks_yandex_path ? "remarks_yandex_path / таблица соответствий" : "fallback: gip_storage_folder/замечания/<ключ раздела>",
      description: "Папка замечаний из структуры ГИПа. Путь задается локальной программой, чтобы не зависеть от различий в названиях папок.",
    },
  ];
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function normalizeStage(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  if (upper === "П" || upper === "P" || upper.includes("СТАДИЯ П")) return "П";
  if (upper === "Р" || upper === "R" || upper.includes("СТАДИЯ Р")) return "Р";
  return raw || "П";
}

function normalizeDocumentType(value) {
  const raw = String(value || "").trim();
  if (raw === "technical_task") return "tz";
  if (raw === "answer") return "remark";
  if (raw === "project" || raw === "project_files") return "project_file";
  return raw;
}

function getArchitectFileCategory(file) {
  const explicitType = normalizeDocumentType(file?.document_type || "");
  if (ARCHITECT_FILE_CATEGORIES.some((item) => item.value === explicitType)) return explicitType;
  const groupType = normalizeDocumentType(file?.document_group || "");
  if (ARCHITECT_FILE_CATEGORIES.some((item) => item.value === groupType)) return groupType;
  const comment = String(file?.comment || "");
  const match = comment.match(/^\[file_category:([^\]]+)\]/);
  const value = normalizeDocumentType(match?.[1] || "project_file");
  return ARCHITECT_FILE_CATEGORIES.some((item) => item.value === value) ? value : "project_file";
}

function getArchitectFileComment(file) {
  return String(file?.comment || "").replace(/^\[file_category:[^\]]+\]\s*/, "");
}

function getArchitectFileYandexPath(file) {
  return file?.yandex_disk_path || file?.yandex_path || "";
}

function getArchitectFileDate(file) {
  return file?.registered_at || file?.modified_at || file?.created_at || "";
}

function formatActionDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getFileCategoryLabel(value) {
  const normalized = normalizeDocumentType(value || "");
  return ARCHITECT_FILE_CATEGORIES.find((item) => item.value === normalized)?.label || normalized || "—";
}

function normalizeIncomingStatus(value, decision) {
  const status = String(value || "").trim().toLowerCase();
  const gipDecision = String(decision || "").trim().toLowerCase();
  if (status === "cancelled" || gipDecision.includes("cancel")) return "cancelled";
  return status || "pending";
}

function getIncomingStatusLabel(value, decision) {
  const status = normalizeIncomingStatus(value, decision);
  if (status === "pending") return "ожидает ГИПа";
  if (status === "viewed") return "просмотрено ГИПом";
  if (status === "processing") return "в обработке у ГИПа";
  if (status === "approved" || status === "done") return "принято ГИПом";
  if (status === "rejected") return "отклонено ГИПом";
  if (status === "cancelled") return "отменено пользователем";
  if (status === "error") return "ошибка обработки";
  return status || "—";
}

function isIncomingFinalStatus(value, decision) {
  const status = normalizeIncomingStatus(value, decision);
  return ["approved", "done", "rejected", "cancelled", "error"].includes(status);
}

function isIncomingCancelable(row) {
  if (!row || row.active === false) return false;
  const status = normalizeIncomingStatus(row.status, row.gip_decision);
  return status === "pending" || status === "viewed";
}

function getHistoryActionLabel(actionType) {
  const action = String(actionType || "").trim();
  if (action === "download_file") return "Скачивание файла";
  if (action === "download_archive") return "Скачивание архива";
  if (action === "upload_to_gip") return "Загрузка ГИПу";
  if (action === "cancel_upload") return "Отмена загрузки ГИПу";
  return action || "Действие";
}

function sanitizeZipPart(value) {
  return String(value || "file")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+$/, "file") || "file";
}

function makeUniqueZipName(usedNames, requestedName) {
  const safeName = sanitizeZipPart(requestedName || "file");
  if (!usedNames.has(safeName)) {
    usedNames.add(safeName);
    return safeName;
  }

  const dotIndex = safeName.lastIndexOf(".");
  const stem = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const suffix = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  let counter = 2;
  while (usedNames.has(`${stem}_${counter}${suffix}`)) counter += 1;
  const uniqueName = `${stem}_${counter}${suffix}`;
  usedNames.add(uniqueName);
  return uniqueName;
}

function safeUploadFileName(value) {
  const cleaned = String(value || "file")
    .trim()
    .replace(/[^\p{L}\p{N}_.-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "file";
}

function randomUploadId() {
  const randomPart = Math.random().toString(16).slice(2);
  return `upload_${Date.now()}_${randomPart}`;
}

function getFileExtension(name) {
  const text = String(name || "").toLowerCase();
  const index = text.lastIndexOf(".");
  return index >= 0 ? text.slice(index) : "";
}

function isBlockedUploadFile(name) {
  const blocked = new Set([".exe", ".bat", ".cmd", ".com", ".scr", ".vbs", ".js", ".ps1", ".msi", ".jar"]);
  return blocked.has(getFileExtension(name));
}

async function fileArrayBuffer(file) {
  return file.arrayBuffer();
}

async function fileSha256(file) {
  if (!window.crypto?.subtle) return "";
  const buffer = await fileArrayBuffer(file);
  const hash = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function makeIncomingDiskPath(section, uploadId, fileName) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return joinDiskPath(YANDEX_GIP_ROOT, YANDEX_INCOMING_FOLDER, year, month, uploadId, fileName);
}

const ACCESS_ELEMENTS = [
  { key: "schedule", label: "График проектирования" },
  { key: "compact", label: "График ППТ" },
  { key: "ppt", label: "Расширенный график ППТ" },
  { key: "buildings", label: "Страницы зданий" },
  { key: "project_manager_dashboard", label: "Кабинет руководителя проекта" },
  { key: "accounts", label: "Управление учетными записями" },
];

const ROLE_DEFAULT_ACCESS = {
  admin: ["schedule", "compact", "ppt", "buildings", "project_manager_dashboard", "accounts"],
  architect: ["schedule", "compact", "ppt", "buildings"],
  designer: ["schedule", "compact", "ppt", "buildings"],
  project_manager: ["project_manager_dashboard", "schedule", "compact", "ppt", "buildings"],
  customer_service: ["schedule", "compact", "ppt", "buildings"],
  external: ["schedule", "compact", "buildings"],
  employee: ["schedule", "compact", "ppt", "buildings"],
};

function normalizeAccessElements(value, role = "designer") {
  const allowedKeys = ACCESS_ELEMENTS.map((item) => item.key);
  const fallback = ROLE_DEFAULT_ACCESS[normalizeAccountRole(role)] || ["schedule"];

  if (!value) return fallback;

  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value.split(",").map((item) => item.trim());
    }
  }

  if (!Array.isArray(parsed)) return fallback;

  const cleaned = parsed.filter((item) => allowedKeys.includes(item));
  const normalizedRole = normalizeAccountRole(role);
  if (normalizedRole === "project_manager") {
    const merged = [...new Set([...(cleaned.length ? cleaned : []), ...ROLE_DEFAULT_ACCESS.project_manager])];
    return merged.filter((item) => allowedKeys.includes(item));
  }
  return cleaned.length ? cleaned : fallback;
}

function hasAccess(user, elementKey) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return normalizeAccessElements(user.allowed_elements, user.role).includes(elementKey);
}

function normalizeAccountRole(role) {
  const raw = String(role || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "employee") return "designer";
  if (normalized === "architect" || normalized === "arhitect" || normalized === "архитектор") return "architect";
  if (normalized === "projectant" || normalized === "proektant") return "designer";
  if (normalized === "project_manager" || normalized === "project-manager" || normalized === "pm" || normalized === "руководитель проекта") return "project_manager";
  if (normalized === "customer" || normalized === "client" || normalized === "zakazchik") return "customer_service";
  if (normalized === "other" || normalized === "guest" || normalized === "external_people") return "external";
  if (["admin", "architect", "designer", "project_manager", "customer_service", "external"].includes(normalized)) return normalized;
  return "designer";
}

function formatAccountSaveError(error) {
  const message = error?.message || String(error || "Неизвестная ошибка");
  if (message.includes("employees_role_check")) {
    return "В Supabase не обновлено ограничение employees_role_check. Выполните SQL-файл supabase_sql/N_185_employees_project_manager_role_check.sql и повторите действие.";
  }
  return message;
}

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

const compactMonths = [
  { label: "Апрель", start: "2026-04-01", end: "2026-04-30" },
  { label: "Май", start: "2026-05-01", end: "2026-05-31" },
  { label: "Июнь", start: "2026-06-01", end: "2026-06-30" },
  { label: "Июль", start: "2026-07-01", end: "2026-07-31" },
  { label: "Август", start: "2026-08-01", end: "2026-08-31" },
  { label: "Сентябрь", start: "2026-09-01", end: "2026-09-30" },
];

const buildingPages = [
  { id: "cross-dock-office", number: "01", title: "Кросс-док с офисной частью", sourcePage: 1, area: "2 254,16 м²" },
  { id: "cross-dock-typical", number: "02", title: "Кросс-док типовой", sourcePage: 2, area: "2 176,06 м²" },
  { id: "freezer-warehouse", number: "03", title: "Морозильный склад", sourcePage: 3, area: "около 10 964 м²" },
  { id: "doc-pavilion-fish-meat", number: "04", title: "Док-павильон (рыба-мясо)", sourcePage: 4, area: "около 8 516 м²" },
  { id: "doc-pavilion-flowers-grocery", number: "05", title: "Док-павильон (цветы-бакалея)", sourcePage: 5, area: "около 8 411 м²" },
  { id: "multitemp-warehouse", number: "06", title: "Мультитемпературный склад", sourcePage: 6, area: "240,66 м² на модуль" },
  { id: "light-industrial", number: "07", title: "Производственно-складской терминал типа Light Industrial", sourcePage: 7, area: "около 15 137 м²" },
  { id: "fast-trade-pavilion", number: "08", title: "Быстровозводимый торговый павильон", sourcePage: 8, area: "49,41 м² на павильон" },
  { id: "office-admin-block", number: "09", title: "Офисный блок с администрацией", sourcePage: 9, area: "около 2 395 м²" },
  { id: "construction-market-pavilion", number: "10", title: "Торговый павильон строительного рынка", sourcePage: 10, area: "1 640,26 м²" },
  { id: "food-retail-market", number: "11", title: "Продовольственный розничный рынок", sourcePage: 11, area: "1 461,06 м²" },
  { id: "trade-pavilion", number: "12", title: "Торговый павильон", sourcePage: 12, area: "1 423,35 м²" },
  { id: "food-court-terrace", number: "13", title: "Фуд-корт с открытой террасой", sourcePage: 13, area: "3 061,56 м²" },
  { id: "cold-warehouse-wood-metal", number: "14", title: "Холодный склад строительного рынка (дерево-металл)", sourcePage: 14, area: "2 049,90 м²" },
  { id: "cold-trade-pavilion", number: "15", title: "Холодный торговый павильон строительного рынка", sourcePage: 15, area: "845,78 м²" },
  { id: "motel-80", number: "16", title: "Мотель на 80 номеров контейнерно-модульный", sourcePage: 16, area: "1 852,76 м²" },
  { id: "hostel-228", number: "17", title: "Хостел для сотрудников на 228 мест контейнерно-модульный", sourcePage: 17, area: "1 070,19 м²" },
  { id: "canteen-60", number: "18", title: "Столовая для персонала на 60 мест контейнерно-модульная", sourcePage: 18, area: "454,22 м²" },
  { id: "garage-aho", number: "19", title: "Гараж/АХО", sourcePage: 19, area: "около 1 170 м²" },
  { id: "toilet-shower", number: "20", title: "Здание туалет-душевые", sourcePage: 20, area: "86,88 м²" },
  { id: "bus-platform", number: "21", title: "Пассажирский автобусный перрон с навесом", sourcePage: 21, area: "площадь не указана" },
];

const buildingAssets = {
  "cross-dock-office": {
    "view": "/building-assets/cross-dock-office/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/cross-dock-office/plan-1.jpg",
        "explication": "/building-assets/cross-dock-office/explication-1.jpg"
      },
      {
        "title": "План 2 этажа, офисная часть",
        "plan": "/building-assets/cross-dock-office/plan-2.jpg",
        "explication": "/building-assets/cross-dock-office/explication-2.jpg"
      },
      {
        "title": "План 3 этажа, венткамера",
        "plan": "/building-assets/cross-dock-office/plan-3.jpg",
        "explication": "/building-assets/cross-dock-office/explication-3.jpg"
      }
    ]
  },
  "cross-dock-typical": {
    "view": "/building-assets/cross-dock-typical/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/cross-dock-typical/plan-1.jpg",
        "explication": "/building-assets/cross-dock-typical/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/cross-dock-typical/plan-2.jpg",
        "explication": "/building-assets/cross-dock-typical/explication-2.jpg"
      }
    ]
  },
  "freezer-warehouse": {
    "view": "/building-assets/freezer-warehouse/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/freezer-warehouse/plan-1.jpg",
        "explication": "/building-assets/freezer-warehouse/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/freezer-warehouse/plan-2.jpg",
        "explication": "/building-assets/freezer-warehouse/explication-2.jpg"
      }
    ]
  },
  "doc-pavilion-fish-meat": {
    "view": "/building-assets/doc-pavilion-fish-meat/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/doc-pavilion-fish-meat/plan-1.jpg",
        "explication": "/building-assets/doc-pavilion-fish-meat/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/doc-pavilion-fish-meat/plan-2.jpg",
        "explication": "/building-assets/doc-pavilion-fish-meat/explication-2.jpg"
      },
      {
        "title": "План технического подвала",
        "plan": "/building-assets/doc-pavilion-fish-meat/plan-3.jpg",
        "explication": "/building-assets/doc-pavilion-fish-meat/explication-3.jpg"
      }
    ]
  },
  "doc-pavilion-flowers-grocery": {
    "view": "/building-assets/doc-pavilion-flowers-grocery/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/doc-pavilion-flowers-grocery/plan-1.jpg",
        "explication": "/building-assets/doc-pavilion-flowers-grocery/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/doc-pavilion-flowers-grocery/plan-2.jpg",
        "explication": "/building-assets/doc-pavilion-flowers-grocery/explication-2.jpg"
      },
      {
        "title": "План 3 этажа, венткамера",
        "plan": "/building-assets/doc-pavilion-flowers-grocery/plan-3.jpg",
        "explication": "/building-assets/doc-pavilion-flowers-grocery/explication-3.jpg"
      },
      {
        "title": "План технического подвала",
        "plan": "/building-assets/doc-pavilion-flowers-grocery/plan-4.jpg",
        "explication": "/building-assets/doc-pavilion-flowers-grocery/explication-4.jpg"
      }
    ]
  },
  "multitemp-warehouse": {
    "view": "/building-assets/multitemp-warehouse/view.jpg",
    "floors": [
      {
        "title": "План типового модуля",
        "plan": "/building-assets/multitemp-warehouse/plan-1.jpg",
        "explication": "/building-assets/multitemp-warehouse/explication-1.jpg"
      },
      {
        "title": "Вариант компоновки на 20 модулей",
        "plan": "/building-assets/multitemp-warehouse/plan-2.jpg",
        "explication": "/building-assets/multitemp-warehouse/explication-2.jpg"
      }
    ]
  },
  "light-industrial": {
    "view": "/building-assets/light-industrial/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/light-industrial/plan-1.jpg",
        "explication": "/building-assets/light-industrial/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/light-industrial/plan-2.jpg",
        "explication": "/building-assets/light-industrial/explication-2.jpg"
      },
      {
        "title": "План 3-4 этажа",
        "plan": "/building-assets/light-industrial/plan-3.jpg",
        "explication": "/building-assets/light-industrial/explication-3.jpg"
      }
    ]
  },
  "fast-trade-pavilion": {
    "view": "/building-assets/fast-trade-pavilion/view.jpg",
    "floors": [
      {
        "title": "План быстровозводимого павильона",
        "plan": "/building-assets/fast-trade-pavilion/plan-1.jpg",
        "explication": "/building-assets/fast-trade-pavilion/explication-1.jpg"
      },
      {
        "title": "Вариант компоновки 2-х павильонов",
        "plan": "/building-assets/fast-trade-pavilion/plan-2.jpg",
        "explication": "/building-assets/fast-trade-pavilion/explication-2.jpg"
      },
      {
        "title": "Вариант компоновки 3-х павильонов",
        "plan": "/building-assets/fast-trade-pavilion/plan-3.jpg",
        "explication": "/building-assets/fast-trade-pavilion/explication-3.jpg"
      }
    ]
  },
  "office-admin-block": {
    "view": "/building-assets/office-admin-block/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/office-admin-block/plan-1.jpg",
        "explication": "/building-assets/office-admin-block/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/office-admin-block/plan-2.jpg",
        "explication": "/building-assets/office-admin-block/explication-2.jpg"
      }
    ]
  },
  "construction-market-pavilion": {
    "view": "/building-assets/construction-market-pavilion/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/construction-market-pavilion/plan-1.jpg",
        "explication": "/building-assets/construction-market-pavilion/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/construction-market-pavilion/plan-2.jpg",
        "explication": "/building-assets/construction-market-pavilion/explication-2.jpg"
      }
    ]
  },
  "food-retail-market": {
    "view": "/building-assets/food-retail-market/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/food-retail-market/plan-1.jpg",
        "explication": "/building-assets/food-retail-market/explication-1.jpg"
      }
    ]
  },
  "trade-pavilion": {
    "view": "/building-assets/trade-pavilion/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/trade-pavilion/plan-1.jpg",
        "explication": "/building-assets/trade-pavilion/explication-1.jpg"
      }
    ]
  },
  "food-court-terrace": {
    "view": "/building-assets/food-court-terrace/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/food-court-terrace/plan-1.jpg",
        "explication": "/building-assets/food-court-terrace/explication-1.jpg"
      }
    ]
  },
  "cold-warehouse-wood-metal": {
    "view": "/building-assets/cold-warehouse-wood-metal/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/cold-warehouse-wood-metal/plan-1.jpg",
        "explication": "/building-assets/cold-warehouse-wood-metal/explication-1.jpg"
      }
    ]
  },
  "cold-trade-pavilion": {
    "view": "/building-assets/cold-trade-pavilion/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/cold-trade-pavilion/plan-1.jpg",
        "explication": "/building-assets/cold-trade-pavilion/explication-1.jpg"
      }
    ]
  },
  "motel-80": {
    "view": "/building-assets/motel-80/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/motel-80/plan-1.jpg",
        "explication": "/building-assets/motel-80/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/motel-80/plan-2.jpg",
        "explication": "/building-assets/motel-80/explication-2.jpg"
      }
    ]
  },
  "hostel-228": {
    "view": "/building-assets/hostel-228/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/hostel-228/plan-1.jpg",
        "explication": "/building-assets/hostel-228/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/hostel-228/plan-2.jpg",
        "explication": "/building-assets/hostel-228/explication-2.jpg"
      }
    ]
  },
  "canteen-60": {
    "view": "/building-assets/canteen-60/view.jpg",
    "floors": [
      {
        "title": "План столовой",
        "plan": "/building-assets/canteen-60/plan-1.jpg",
        "explication": "/building-assets/canteen-60/explication-1.jpg"
      }
    ]
  },
  "garage-aho": {
    "view": "/building-assets/garage-aho/view.jpg",
    "floors": [
      {
        "title": "План 1 этажа",
        "plan": "/building-assets/garage-aho/plan-1.jpg",
        "explication": "/building-assets/garage-aho/explication-1.jpg"
      },
      {
        "title": "План 2 этажа",
        "plan": "/building-assets/garage-aho/plan-2.jpg",
        "explication": "/building-assets/garage-aho/explication-2.jpg"
      }
    ]
  },
  "toilet-shower": {
    "view": "/building-assets/toilet-shower/view.jpg",
    "floors": [
      {
        "title": "План здания туалет-душевые",
        "plan": "/building-assets/toilet-shower/plan-1.jpg",
        "explication": "/building-assets/toilet-shower/explication-1.jpg"
      }
    ]
  },
  "bus-platform": {
    "view": "/building-assets/bus-platform/view.jpg",
    "floors": [
      {
        "title": "План пассажирского автобусного перрона",
        "plan": "/building-assets/bus-platform/plan-1.jpg",
        "explication": "/building-assets/bus-platform/explication-1.jpg"
      },
      {
        "title": "Навес и схема размещения",
        "plan": "/building-assets/bus-platform/plan-2.jpg",
        "explication": "/building-assets/bus-platform/explication-2.jpg"
      }
    ]
  }
};

const buildingDetails = {
  "cross-dock-office": {
    "description": "Кросс-док с офисной частью предназначен для сортировки, предпродажной подготовки, оптово-розничной торговли и краткосрочного хранения продукции плодоовощной группы при регулируемом температурном режиме +10…+14 °C. Здание рассчитано на 40 док-шелтеров и 40 автомобилей, имеет санитарно-бытовые помещения, хозяйственные помещения для уборочной техники и административные помещения.",
    "floors": [
      "1 этаж: разгрузочные, погрузочные, сортировочные, складские и санитарно-бытовые зоны.",
      "2 этаж: административно-бухгалтерские помещения.",
      "3 этаж: вентиляционная камера."
    ],
    "explication": [
      "Разгрузочные зоны",
      "Погрузочные зоны",
      "Сортировочные зоны",
      "Складские зоны",
      "Санитарно-бытовые помещения",
      "Хозяйственные помещения",
      "Административные помещения",
      "Вентиляционная камера"
    ]
  },
  "cross-dock-typical": {
    "description": "Типовой кросс-док предназначен для сортировки, предпродажной подготовки, оптово-розничной торговли и краткосрочного хранения продукции плодоовощной группы при температурном режиме +10…+14 °C. Здание рассчитано на 40 док-шелтеров и 40 автомобилей.",
    "floors": [
      "1 этаж: разгрузочные, погрузочные, сортировочные, складские и санитарно-бытовые зоны.",
      "2 этаж: вентиляционная камера в центральной части здания."
    ],
    "explication": [
      "Разгрузочные зоны",
      "Погрузочные зоны",
      "Сортировочные зоны",
      "Складские зоны",
      "Уборные для персонала и посетителей",
      "Хозяйственное помещение",
      "Вентиляционная камера"
    ]
  },
  "freezer-warehouse": {
    "description": "Морозильный склад предназначен для хранения продукции при низких температурах с постоянным температурным режимом около -28 °C. Используется для хранения замороженных продуктов, включая мясо, рыбу, полуфабрикаты, овощи и фрукты. Разгрузка осуществляется через 12 док-шелтеров в транзитную галерею.",
    "floors": [
      "1 этаж: морозильные и транзитные зоны, зона персонала, разгрузка через док-шелтеры.",
      "2 этаж: административная зона и офисы управления складом."
    ],
    "explication": [
      "Морозильная зона",
      "Транзитная галерея",
      "Док-шелтеры",
      "Зона персонала",
      "Помещения отдыха и переодевания",
      "Административная зона",
      "Офисы менеджеров склада"
    ]
  },
  "doc-pavilion-fish-meat": {
    "description": "Док-павильон для мяса и рыбы предназначен для сортировки, предпродажной подготовки, оптово-розничной торговли и краткосрочного хранения замороженной продукции. Предусмотрены морозильные камеры с температурным режимом -25…-29 °C и центральная покупательская галерея с температурным режимом +18…+22 °C.",
    "floors": [
      "1 этаж: торговые блоки, морозильные камеры, зоны подготовки продукции, центральная галерея.",
      "2 этаж: балкон со складскими помещениями арендаторов.",
      "Технический уровень: технические полуподвальные коридоры и инженерные зоны."
    ],
    "explication": [
      "Центральная галерея",
      "Морозильные камеры",
      "Зоны подготовки продукции",
      "Выставочные части торговых блоков",
      "Складские помещения арендаторов",
      "Хозяйственные помещения",
      "Технические коридоры",
      "Вентиляционная камера"
    ]
  },
  "doc-pavilion-flowers-grocery": {
    "description": "Док-павильон для цветов, зелени, бакалеи и кондитерских изделий предназначен для оптово-розничной торговли, предпродажной подготовки и краткосрочного хранения продукции с различными температурными режимами. Предусмотрены холодильные камеры 0…+5 °C и центральная галерея +18…+22 °C.",
    "floors": [
      "1 этаж: торговые точки кондитерских изделий, цветов, зелени и бакалеи с холодильниками и разгрузочными коридорами.",
      "2 этаж: торговые лавки и вспомогательные помещения вокруг центральной двусветной галереи.",
      "3 этаж: вентиляционная камера.",
      "Подвал: технические помещения."
    ],
    "explication": [
      "Торговые точки кондитерских изделий",
      "Торговые точки цветов и зелени",
      "Торговые точки бакалеи",
      "Холодильные камеры",
      "Сухие склады",
      "Разгрузочные коридоры",
      "Центральная галерея",
      "Подъемники",
      "Технический подвал",
      "Вентиляционная камера"
    ]
  },
  "multitemp-warehouse": {
    "description": "Мультитемпературный склад предназначен для оптовой торговли, хранения, предпродажной подготовки и сортировки товаров, требующих различных условий хранения. Склад включает специализированные складские помещения с регулируемыми температурными режимами от 0 до +18 °C.",
    "floors": [
      "1 этаж: специализированные складские секции, погрузочно-разгрузочные зоны, офисы и санитарные узлы при секциях."
    ],
    "explication": [
      "Складские секции",
      "Температурные зоны",
      "Погрузочно-разгрузочные зоны",
      "Офисы секций",
      "Санитарные узлы",
      "Технические зоны"
    ]
  },
  "light-industrial": {
    "description": "Производственно-складской терминал класса Light Industrial представляет собой четырехуровневый складской комплекс смешанного назначения. Предназначен для систем хранения и размещения мини-производств, включая пекарни, фасовочные и разделочные производства.",
    "floors": [
      "1 этаж: складские помещения, зоны погрузки и разгрузки, технические помещения.",
      "2 этаж: дополнительные складские помещения, архив, зона подготовки заказов, грузовые лифты.",
      "3 этаж: мини-производства, включая пекарню и фасовочные зоны, санитарные помещения и склад сырья.",
      "4 этаж: разделочное производство, лаборатория качества, склад готовой продукции, комната отдыха."
    ],
    "explication": [
      "Основные складские помещения",
      "Зоны погрузки и разгрузки",
      "Технические помещения",
      "Архив и документация",
      "Зона подготовки заказов",
      "Грузовые лифты",
      "Производственные помещения",
      "Санитарные зоны",
      "Склад сырья",
      "Лаборатория качества",
      "Склад готовой продукции"
    ]
  },
  "fast-trade-pavilion": {
    "description": "Быстровозводимый торговый павильон представляет собой здание из сэндвич-панелей, предназначенное для торговли сопутствующими товарами и организации пунктов общественного питания. Внутреннее пространство делится на блок-магазины различной площади.",
    "floors": [
      "1 этаж: блоки магазинов, торговые помещения и общие зоны."
    ],
    "explication": [
      "Малые магазины",
      "Средние магазины",
      "Крупные магазины",
      "Пункты общественного питания",
      "Общая зона",
      "Помещения арендаторов"
    ]
  },
  "office-admin-block": {
    "description": "Администрация рынка представляет собой офисный блок, предназначенный для офисной работы, проведения деловых встреч, размещения контролирующих органов, лаборатории контроля качества и единой диспетчерской.",
    "floors": [
      "1 этаж: вестибюль, рецепция, офисные помещения, санитарные узлы, технические помещения, конференцзал, бытовые помещения, помещения контролирующих органов, лаборатория и диспетчерская.",
      "2 этаж: офисы дирекции, зона отдыха сотрудников, санитарные узлы, комнаты переговоров и технические помещения."
    ],
    "explication": [
      "Вестибюль и рецепция",
      "Офисные помещения",
      "Санитарные узлы",
      "Технические помещения",
      "Конференцзал",
      "Бытовые помещения",
      "Лаборатория контроля качества",
      "Единая диспетчерская",
      "Офисы дирекции",
      "Комнаты переговоров"
    ]
  },
  "construction-market-pavilion": {
    "description": "Торговые павильоны строительного рынка предназначены для розничной торговли и хранения строительных материалов. Павильон представляет собой двухэтажное здание, разбитое на торговые секции с возможностью перепланировки.",
    "floors": [
      "1 этаж: торговые секции и зоны хранения строительных материалов.",
      "2 этаж: дополнительные торговые или складские секции."
    ],
    "explication": [
      "Торговые секции",
      "Складские зоны",
      "Зоны хранения строительных материалов",
      "Помещения арендаторов",
      "Проходы и вспомогательные зоны"
    ]
  },
  "food-retail-market": {
    "description": "Продовольственный рынок предназначен для торговли продуктами питания и включает рынок с камерами хранения продукции и зоны предпродажной подготовки. Пропускная способность рынка составляет ориентировочно 1200 посетителей в день.",
    "floors": [
      "1 этаж: торговый зал, камеры хранения продукции, зоны предпродажной подготовки."
    ],
    "explication": [
      "Торговый зал",
      "Камеры хранения продукции",
      "Зоны предпродажной подготовки",
      "Места торговли свежими продуктами",
      "Места торговли мясом и рыбой",
      "Места торговли молочной продукцией",
      "Места торговли бакалеей",
      "Места торговли хлебобулочными изделиями",
      "Места торговли напитками"
    ]
  },
  "trade-pavilion": {
    "description": "Торговый павильон предназначен для сдачи помещений в аренду под бизнес, ориентированный на оказание услуг населению и розничную торговлю.",
    "floors": [
      "1 этаж: помещения арендаторов для услуг и торговли."
    ],
    "explication": [
      "Детские зоны отдыха и развлечений",
      "Парикмахерские",
      "Прачечные",
      "МФЦ",
      "Розничные магазины",
      "Помещения арендаторов"
    ]
  },
  "food-court-terrace": {
    "description": "Фуд-корт предназначен для организации общественного питания. Предусмотрены зона фуд-корта, зоны приготовления пищи, уличная веранда и ресторанная зона.",
    "floors": [
      "1 этаж: зона фуд-корта, зоны приготовления пищи, ресторан, уличная веранда."
    ],
    "explication": [
      "Зона фуд-корта",
      "Зоны приготовления пищи",
      "Ресторанная зона",
      "Уличная веранда",
      "Посадочные места",
      "Вспомогательные помещения"
    ]
  },
  "cold-warehouse-wood-metal": {
    "description": "Холодный склад строительного рынка предназначен для торговли и хранения металла и дерева.",
    "floors": [
      "1 этаж: складская зона для металла и дерева, зоны торговли и погрузки."
    ],
    "explication": [
      "Склад металла",
      "Склад дерева",
      "Торговая зона",
      "Погрузочно-разгрузочная зона",
      "Проходы и вспомогательные зоны"
    ]
  },
  "cold-trade-pavilion": {
    "description": "Холодный склад строительного рынка предназначен для торговли и хранения крупногабаритных строительных материалов.",
    "floors": [
      "1 этаж: складская зона крупногабаритных строительных материалов.",
      "2 этаж: дополнительные складские или торговые зоны."
    ],
    "explication": [
      "Склад крупногабаритных материалов",
      "Торговая зона",
      "Погрузочно-разгрузочная зона",
      "Вспомогательные помещения"
    ]
  },
  "motel-80": {
    "description": "Гостиница для водителей предназначена для кратковременного и длительного пребывания гостей. Рассчитана на размещение водителей в номерах с необходимыми удобствами.",
    "floors": [
      "1 этаж: входная группа, административные и жилые помещения.",
      "2 этаж: жилые номера и вспомогательные помещения."
    ],
    "explication": [
      "Номера для проживания",
      "Административные помещения",
      "Санитарные узлы",
      "Вспомогательные помещения",
      "Зоны обслуживания"
    ]
  },
  "hostel-228": {
    "description": "Хостел предназначен для работников продовольственного рынка на 228 мест с размещением по 4–10 человек в комнате. Здание включает жилые помещения, санитарные зоны, душевые, технические и вспомогательные помещения.",
    "floors": [
      "1 этаж: жилые комнаты, санитарные блоки, душевые, технические и вспомогательные помещения.",
      "2 этаж: жилые комнаты, санитарные блоки, душевые, кладовые и постирочные."
    ],
    "explication": [
      "Жилые комнаты",
      "Санитарные блоки",
      "Душевые",
      "Технические помещения",
      "Кладовые",
      "Постирочные",
      "Вспомогательные помещения"
    ]
  },
  "canteen-60": {
    "description": "Столовая для персонала предназначена для организации питания сотрудников. В составе предусматриваются помещения приготовления пищи, обслуживания посетителей и вспомогательные помещения.",
    "floors": [
      "1 этаж: обеденный зал, кухня, помещения персонала и вспомогательные зоны."
    ],
    "explication": [
      "Обеденный зал",
      "Кухня",
      "Зона раздачи",
      "Кладовые",
      "Помещения персонала",
      "Санитарные помещения",
      "Вспомогательные помещения"
    ]
  },
  "garage-aho": {
    "description": "Гараж/АХО предназначен для отстоя технического автопарка, ремонта, хранения ЗИП и выполнения административно-хозяйственных функций. Предусмотрены зона ремонта, подъемники, сварочно-слесарное оборудование, административно-хозяйственные и складские помещения, а также автомойка.",
    "floors": [
      "1 этаж: гараж, ремонтная зона, автомойка, технические помещения, часть хозяйственных помещений.",
      "2 этаж: административно-хозяйственные помещения, офисы и складские зоны."
    ],
    "explication": [
      "Гараж",
      "Ремонтные ямы",
      "Подъемники",
      "Сварочно-слесарная зона",
      "Автомойка",
      "Офисы АХО",
      "Складские помещения",
      "Комнаты персонала",
      "Технические помещения"
    ]
  },
  "toilet-shower": {
    "description": "Здание туалет-душевые относится к санитарно-бытовым объектам комплекса и предназначено для обслуживания посетителей и персонала.",
    "floors": [
      "1 этаж: санитарные помещения, душевые, технические и вспомогательные зоны."
    ],
    "explication": [
      "Туалеты",
      "Душевые",
      "Умывальные зоны",
      "Технические помещения",
      "Вспомогательные помещения"
    ]
  },
  "bus-platform": {
    "description": "Автобусная остановка/перрон предназначена для обслуживания пассажиров. На остановке предусмотрены автобусные платформы с навесами и павильоны розничной торговли.",
    "floors": [
      "Планировочный уровень: автобусные платформы, навесы, зоны ожидания и павильоны розничной торговли."
    ],
    "explication": [
      "Автобусные платформы",
      "Навесы",
      "Зоны ожидания",
      "Павильоны розничной торговли",
      "Пешеходные зоны"
    ]
  }
};

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
    allowed_elements: ROLE_DEFAULT_ACCESS.designer,
  };
}

const projectManagerSections = [
  {
    key: "info",
    title: "Общая информация",
    description: "Здания комплекса: назначение, площади, описание и основные картинки.",
    metric: `${buildingPages.length} зданий`,
  },
  {
    key: "graphs",
    title: "Графики",
    description: "Выбор графиков: проектирование, ППТ и РНС.",
    metric: "3 графика",
  },
  {
    key: "meetings",
    title: "Совещания",
    description: "Последние протоколы, актуальная повестка и задачи по ответственным.",
    metric: "оперативный блок",
  },
  {
    key: "finance",
    title: "Финансирование",
    description: "Потребность в финансировании на ближайшие 3 месяца.",
    metric: "3 месяца",
  },
];

const projectManagerMeetings = {
  protocols: [
    {
      date: "20.05.2026",
      title: "Протокол совещания по статусу проектирования",
      status: "последний",
      summary: "Зафиксированы критичные разделы, сроки передачи исходных данных и порядок закрытия замечаний.",
    },
    {
      date: "13.05.2026",
      title: "Протокол по ППТ и внешним согласованиям",
      status: "рабочий",
      summary: "Обсуждены материалы для ППТ, запросы в органы и подготовка дорожной карты по РНС.",
    },
    {
      date: "06.05.2026",
      title: "Протокол по зданиям и разделам стадии П",
      status: "архив",
      summary: "Согласованы приоритетные здания, перечень первоочередных разделов и формат обмена файлами.",
    },
  ],
  agenda: [
    "Проверить готовность разделов по зданиям с ближайшими контрольными сроками.",
    "Сверить перечень исходных данных для ППТ и РНС.",
    "Подтвердить статус замечаний и ответственных за закрытие.",
    "Уточнить потребность в финансировании на ближайший трехмесячный период.",
  ],
  tasks: [
    { owner: "ГИП", task: "Собрать сводку по критичным разделам и загрузкам с сайта", due: "до ближайшего совещания", status: "в работе" },
    { owner: "Архитектор", task: "Актуализировать карточки зданий и изображения", due: "текущая неделя", status: "в работе" },
    { owner: "ППТ", task: "Подготовить статус согласований и запросов", due: "текущая неделя", status: "контроль" },
    { owner: "Финансовый блок", task: "Проверить план потребности на 3 месяца", due: "до следующего отчета", status: "ожидает данных" },
  ],
};

const projectManagerFinancePlan = [
  { month: "Июнь 2026", amount: 42, label: "42 млн ₽", note: "проектирование и первоочередные согласования" },
  { month: "Июль 2026", amount: 58, label: "58 млн ₽", note: "ППТ, РНС и инженерные исходные данные" },
  { month: "Август 2026", amount: 64, label: "64 млн ₽", note: "закрытие замечаний и подготовка следующего пакета" },
];

const projectManagerRnsItems = [
  { code: "РНС-1", title: "Сбор исходных данных для разрешения на строительство", start: "2026-06-01", end: "2026-06-18", progress: 35 },
  { code: "РНС-2", title: "Подготовка комплектности проектной документации", start: "2026-06-12", end: "2026-07-10", progress: 20 },
  { code: "РНС-3", title: "Проверка замечаний и корректировка материалов", start: "2026-07-05", end: "2026-07-28", progress: 10 },
  { code: "РНС-4", title: "Подача пакета на получение РНС", start: "2026-08-01", end: "2026-08-14", progress: 0 },
];


function dateToTime(value) {
  return new Date(`${value}T00:00:00`).getTime();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function getTodayTime() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isDeadlinePassed(endDate) {
  if (!endDate) return false;
  return dateToTime(endDate) < getTodayTime();
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

function getPptOverdueLabelStyle(item, bounds) {
  const barStyle = getPptBarStyle(item, bounds);
  const leftValue = parseFloat(barStyle.left || "0");
  const widthValue = parseFloat(barStyle.width || "0");
  const labelLeft = Math.min(leftValue + widthValue + 0.8, 87);

  return {
    left: `${labelLeft}%`,
  };
}

function getCompactBarStyle(item, bounds) {
  if (!item.start || !item.end) {
    return { left: "0%", width: "0%" };
  }

  const total = bounds.max - bounds.min;
  const start = dateToTime(item.start) - bounds.min;
  const end = dateToTime(item.end) - bounds.min;
  const left = total ? (start / total) * 100 : 0;
  const width = total ? Math.max(((end - start) / total) * 100, 1.4) : 100;

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
  const [scheduleRows, setScheduleRows] = useState(scheduleItems);
  const [pptItems, setPptItems] = useState(() => getLocalPptItems());
  const [pptDraftItems, setPptDraftItems] = useState(() => getLocalPptItems());
  const [isPptEditing, setIsPptEditing] = useState(false);
  const [pptMessage, setPptMessage] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState(buildingPages[0]?.id || "");
  const [imageViewer, setImageViewer] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [extendValue, setExtendValue] = useState("");
  const [interfaceChoice, setInterfaceChoice] = useState(null);
  const [siteSections, setSiteSections] = useState([]);
  const [siteFiles, setSiteFiles] = useState([]);
  const [siteDirectoryLoading, setSiteDirectoryLoading] = useState(false);
  const [siteDirectoryError, setSiteDirectoryError] = useState("");
  const [selectedSiteBuildingKey, setSelectedSiteBuildingKey] = useState("");
  const [siteBuildingSearch, setSiteBuildingSearch] = useState("");
  const [architectStage, setArchitectStage] = useState("П");
  const [selectedSiteSectionId, setSelectedSiteSectionId] = useState("");
  const [siteSectionModalId, setSiteSectionModalId] = useState("");
  const [fileCategory, setFileCategory] = useState("project_file");
  const [fileComment, setFileComment] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileYandexPath, setFileYandexPath] = useState("");
  const [selectedUploadFiles, setSelectedUploadFiles] = useState([]);
  const [incomingUploadSubmitting, setIncomingUploadSubmitting] = useState(false);
  const [incomingUploadError, setIncomingUploadError] = useState("");
  const [incomingUploadNotice, setIncomingUploadNotice] = useState("");
  const [yandexCatalogState, setYandexCatalogState] = useState({});
  const [showYandexCatalogTester, setShowYandexCatalogTester] = useState(false);
  const [archiveDownloadState, setArchiveDownloadState] = useState({});
  const [projectManagerView, setProjectManagerView] = useState("home");
  const [projectManagerGraphType, setProjectManagerGraphType] = useState("design");
  const [gapaHistoryOpen, setGapaHistoryOpen] = useState(false);
  const [gapaHistoryTab, setGapaHistoryTab] = useState("full");
  const [gapaHistoryRows, setGapaHistoryRows] = useState([]);
  const [gapaPendingRows, setGapaPendingRows] = useState([]);
  const [gapaHistoryLoading, setGapaHistoryLoading] = useState(false);
  const [gapaHistoryError, setGapaHistoryError] = useState("");
  const [gapaCancelLoadingId, setGapaCancelLoadingId] = useState("");
  const siteSectionsTable = import.meta.env.VITE_SITE_SECTIONS_TABLE || "opr_site_sections";
  const siteFilesTable = import.meta.env.VITE_SITE_FILES_TABLE || "opr_site_section_files";
  const siteIncomingTable = import.meta.env.VITE_SITE_INCOMING_TABLE || "opr_site_incoming_files";
  const siteActionHistoryTable = import.meta.env.VITE_SITE_ACTION_HISTORY_TABLE || "opr_site_action_history";
  const siteFilesBucket = import.meta.env.VITE_SITE_FILES_BUCKET || "";

  const scheduleBounds = useMemo(() => getScheduleBounds(scheduleRows), [scheduleRows]);

  const summary = useMemo(() => {
    const total = scheduleRows.length || 1;
    const average = Math.round(
      scheduleRows.reduce((sum, item) => sum + item.progress, 0) / total
    );
    const completed = scheduleRows.filter((item) => item.progress >= 100).length;

    return {
      total,
      average,
      completed,
    };
  }, [scheduleRows]);


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

  const siteBuildings = useMemo(() => {
    const map = new Map();
    siteSections.forEach((section) => {
      const key = section.building_key || `${section.building_gp_no || ""} — ${section.building_name || ""}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          gpNo: section.building_gp_no || "",
          name: section.building_name || "",
          title: key,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => String(a.title).localeCompare(String(b.title), "ru"));
  }, [siteSections]);


  const filteredSiteBuildings = useMemo(() => {
    const query = siteBuildingSearch.trim().toLowerCase();
    if (!query) return siteBuildings;

    return siteBuildings.filter((building) => {
      const haystack = [building.gpNo, building.name, building.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [siteBuildings, siteBuildingSearch]);

  const selectedSiteBuildingAllSections = useMemo(() => {
    if (!selectedSiteBuildingKey) return [];
    return siteSections
      .filter((section) => {
        const key = section.building_key || `${section.building_gp_no || ""} — ${section.building_name || ""}`;
        return key === selectedSiteBuildingKey;
      })
      .sort((a, b) => {
        const stageOrder = { "П": 1, "Р": 2 };
        const stageCompare = (stageOrder[normalizeStage(a.stage)] || 99) - (stageOrder[normalizeStage(b.stage)] || 99);
        if (stageCompare !== 0) return stageCompare;
        return String(a.section_code || "").localeCompare(String(b.section_code || ""), "ru");
      });
  }, [siteSections, selectedSiteBuildingKey]);

  const architectStageCounts = useMemo(() => {
    return selectedSiteBuildingAllSections.reduce((acc, section) => {
      const stage = normalizeStage(section.stage);
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
  }, [selectedSiteBuildingAllSections]);

  const selectedSiteBuildingSections = useMemo(() => {
    return selectedSiteBuildingAllSections.filter((section) => normalizeStage(section.stage) === architectStage);
  }, [selectedSiteBuildingAllSections, architectStage]);

  const selectedSiteSection = useMemo(() => {
    return siteSections.find((section) => section.id === selectedSiteSectionId) || null;
  }, [siteSections, selectedSiteSectionId]);

  const modalSiteSection = useMemo(() => {
    return siteSections.find((section) => section.id === siteSectionModalId) || null;
  }, [siteSections, siteSectionModalId]);

  useEffect(() => {
    setShowYandexCatalogTester(false);
  }, [siteSectionModalId]);

  const selectedSiteSectionFiles = useMemo(() => {
    if (!selectedSiteSection) return [];
    return siteFiles
      .filter((file) => (file.section_id === selectedSiteSection.id || file.site_section_id === selectedSiteSection.id) && file.active !== false)
      .sort((a, b) => String(b.registered_at || b.created_at || "").localeCompare(String(a.registered_at || a.created_at || "")));
  }, [siteFiles, selectedSiteSection]);

  const modalSiteSectionFiles = useMemo(() => {
    if (!modalSiteSection) return [];
    return siteFiles
      .filter((file) => (file.section_id === modalSiteSection.id || file.site_section_id === modalSiteSection.id) && file.active !== false)
      .sort((a, b) => String(b.registered_at || b.created_at || "").localeCompare(String(a.registered_at || a.created_at || "")));
  }, [siteFiles, modalSiteSection]);

  function siteSectionHasProjectFile(section) {
    if (!section) return false;
    if (String(section.common_latest_version_name || "").trim()) return true;
    const sectionId = section.id;
    return siteFiles.some((file) => {
      if (file.active === false) return false;
      if (file.section_id !== sectionId && file.site_section_id !== sectionId) return false;
      if (getArchitectFileCategory(file) !== "project_file") return false;
      return Boolean(String(file.file_name || file.original_name || file.file_url || getArchitectFileYandexPath(file) || "").trim());
    });
  }

  const isAdmin = currentUser?.role === "admin";
  const canEditPpt = currentUser?.role === "admin" || currentUser?.role === "designer" || currentUser?.role === "architect";

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

      setAccounts((data || []).map((account) => {
        const role = normalizeAccountRole(account.role);
        return {
          ...account,
          role,
          allowed_elements: normalizeAccessElements(account.allowed_elements, role),
        };
      }));
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


  useEffect(() => {
    if (currentUser?.role === "architect" && interfaceChoice === "specialized") {
      loadSiteDirectory();
    }
    if (currentUser?.role === "project_manager") {
      loadSiteDirectory();
    }
  }, [currentUser, interfaceChoice]);

  useEffect(() => {
    if (!selectedSiteBuildingKey && siteBuildings.length > 0) {
      setSelectedSiteBuildingKey(siteBuildings[0].key);
    }
  }, [siteBuildings, selectedSiteBuildingKey]);

  useEffect(() => {
    if (selectedSiteBuildingSections.length > 0) {
      const exists = selectedSiteBuildingSections.some((section) => section.id === selectedSiteSectionId);
      if (!exists) {
        setSelectedSiteSectionId(selectedSiteBuildingSections[0].id);
      }
    } else {
      setSelectedSiteSectionId("");
    }
  }, [selectedSiteBuildingSections, selectedSiteSectionId]);

  async function loadSiteDirectory() {
    if (!isSupabaseReady || !supabase) {
      setSiteDirectoryError("GIP API не подключён. Проверьте .env.local.");
      return;
    }

    setSiteDirectoryLoading(true);
    setSiteDirectoryError("");

    try {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from(siteSectionsTable)
        .select("*")
        .eq("active", true)
        .order("building_gp_no", { ascending: true })
        .order("stage", { ascending: true })
        .order("section_code", { ascending: true });

      if (sectionsError) throw sectionsError;

      const { data: filesData, error: filesError } = await supabase
        .from(siteFilesTable)
        .select("*")
        .order("created_at", { ascending: false });

      if (filesError) throw filesError;

      setSiteSections(sectionsData || []);
      setSiteFiles(filesData || []);
    } catch (error) {
      setSiteDirectoryError(`Ошибка загрузки справочника сайта: ${error.message}`);
    } finally {
      setSiteDirectoryLoading(false);
    }
  }

  function makeHistorySectionText(row) {
    const parts = [];
    if (row?.building_gp_no || row?.building_name) parts.push(`${row?.building_gp_no || "—"} — ${row?.building_name || "Здание не указано"}`);
    if (row?.stage || row?.section_code) parts.push(`стадия ${normalizeStage(row?.stage || "") || "—"} / ${row?.section_code || "—"}`);
    if (row?.section_title) parts.push(row.section_title);
    return parts.join(" / ") || "—";
  }

  function mapActionHistoryRow(row) {
    return {
      id: `action:${row.id || Math.random()}`,
      source: "action",
      eventAt: row.event_at || row.created_at || "",
      actor: row.actor_name || row.actor_login || "—",
      action: row.action_title || getHistoryActionLabel(row.action_type),
      fileName: row.file_name || "—",
      category: getFileCategoryLabel(row.target_area),
      sectionText: makeHistorySectionText(row),
      status: row.status || "—",
      basis: row.comment || row.decision || "—",
      details: row.yandex_path || row.file_url || "",
    };
  }

  function mapIncomingUploadHistoryRow(row) {
    return {
      id: `incoming-upload:${row.id}`,
      source: "incoming",
      eventAt: row.uploaded_at || row.created_at || "",
      actor: row.uploaded_by || row.uploaded_by_email || "—",
      action: "Загрузка файла ГИПу",
      fileName: row.original_filename || row.stored_filename || "—",
      category: getFileCategoryLabel(row.target_area),
      sectionText: makeHistorySectionText(row),
      status: getIncomingStatusLabel(row.status, row.gip_decision),
      basis: row.user_comment || "—",
      details: row.final_yandex_path || row.yandex_temp_path || "",
    };
  }

  function mapIncomingDecisionHistoryRow(row) {
    const status = normalizeIncomingStatus(row.status, row.gip_decision);
    const isRejected = status === "rejected";
    const isCancelled = status === "cancelled";
    const isError = status === "error";
    return {
      id: `incoming-decision:${row.id}`,
      source: "incoming",
      eventAt: row.processed_at || row.updated_at || row.created_at || row.uploaded_at || "",
      actor: isCancelled ? (row.uploaded_by || row.uploaded_by_email || "пользователь сайта") : (row.processing_by || "ГИП"),
      action: isCancelled ? "Отмена загрузки ГИПу" : isRejected ? "Отклонение ГИПом" : isError ? "Ошибка обработки ГИПом" : "Принятие ГИПом",
      fileName: row.original_filename || row.stored_filename || "—",
      category: getFileCategoryLabel(row.target_area),
      sectionText: makeHistorySectionText(row),
      status: getIncomingStatusLabel(row.status, row.gip_decision),
      basis: row.gip_comment || row.error_message || row.gip_decision || "—",
      details: row.final_yandex_path || row.yandex_temp_path || "",
    };
  }

  function buildHistoryFromIncomingRows(incomingRows, actionRows) {
    const rows = [];
    const visibleIncoming = (incomingRows || []).filter((row) => row && row.active !== false || normalizeIncomingStatus(row?.status, row?.gip_decision) === "cancelled");

    visibleIncoming.forEach((row) => {
      rows.push(mapIncomingUploadHistoryRow(row));
      if (isIncomingFinalStatus(row.status, row.gip_decision)) {
        rows.push(mapIncomingDecisionHistoryRow(row));
      }
    });

    (actionRows || [])
      .filter((row) => !["upload_to_gip", "cancel_upload"].includes(String(row.action_type || "")))
      .forEach((row) => rows.push(mapActionHistoryRow(row)));

    return rows.sort((a, b) => String(b.eventAt || "").localeCompare(String(a.eventAt || "")));
  }

  async function logSiteAction(actionType, payload = {}) {
    if (!isSupabaseReady || !supabase) return;
    try {
      await supabase.from(siteActionHistoryTable).insert({
        project_key: payload.project_key || payload.projectKey || "opr_donetsk",
        action_type: actionType,
        action_title: payload.action_title || getHistoryActionLabel(actionType),
        actor_name: currentUser?.name || currentUser?.login || "",
        actor_login: currentUser?.login || "",
        actor_role: currentUser?.role || "",
        site_section_id: payload.site_section_id || payload.section_id || "",
        incoming_file_id: payload.incoming_file_id || "",
        document_card_id: payload.document_card_id || payload.file_id || "",
        building_gp_no: payload.building_gp_no || "",
        building_name: payload.building_name || "",
        stage: payload.stage || "",
        section_code: payload.section_code || "",
        section_title: payload.section_title || "",
        target_area: payload.target_area || "",
        file_name: payload.file_name || "",
        file_size: payload.file_size || null,
        yandex_path: payload.yandex_path || "",
        file_url: payload.file_url || "",
        status: payload.status || "",
        decision: payload.decision || "",
        comment: payload.comment || "",
        details: payload.details || {},
        active: true,
      });
    } catch {
      // Журнал действий не должен блокировать скачивание или загрузку файла.
    }
  }

  async function loadGapaActionHistory() {
    if (!isSupabaseReady || !supabase) {
      setGapaHistoryError("GIP API не подключён. Историю действий загрузить нельзя.");
      return;
    }

    setGapaHistoryLoading(true);
    setGapaHistoryError("");

    try {
      const { data: incomingData, error: incomingError } = await supabase
        .from(siteIncomingTable)
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (incomingError) throw incomingError;

      let actionData = [];
      const { data, error } = await supabase
        .from(siteActionHistoryTable)
        .select("*")
        .order("event_at", { ascending: false });
      if (error) {
        setGapaHistoryError("Таблица истории действий ещё не создана. Выполните SQL из supabase_sql/N_207_gapa_action_history.sql. Пока показана история из очереди входящих файлов.");
      } else {
        actionData = data || [];
      }

      const incomingRows = incomingData || [];
      const pendingRows = incomingRows
        .filter((row) => row?.active !== false && !isIncomingFinalStatus(row.status, row.gip_decision))
        .sort((a, b) => String(b.uploaded_at || b.created_at || "").localeCompare(String(a.uploaded_at || a.created_at || "")));

      setGapaPendingRows(pendingRows);
      setGapaHistoryRows(buildHistoryFromIncomingRows(incomingRows, actionData));
    } catch (error) {
      setGapaHistoryError(`Ошибка загрузки истории действий: ${error.message}`);
    } finally {
      setGapaHistoryLoading(false);
    }
  }

  async function openGapaActionHistory() {
    setGapaHistoryOpen(true);
    await loadGapaActionHistory();
  }

  async function cancelIncomingUpload(row) {
    if (!row?.id || !isIncomingCancelable(row)) return;
    const confirmed = window.confirm(`Отменить загрузку ГИПу?\n\nФайл: ${row.original_filename || row.stored_filename || "—"}\nРаздел: ${row.section_code || "—"}\n\nЗаявка будет снята из активной очереди ГИПа.`);
    if (!confirmed) return;

    setGapaCancelLoadingId(row.id);
    setGapaHistoryError("");
    const nowIso = new Date().toISOString();
    const basePayload = {
      active: false,
      status: "cancelled",
      gip_decision: "cancelled_by_uploader",
      gip_comment: "отменено загрузившим пользователем",
      processed_at: nowIso,
      processing_by: currentUser?.name || currentUser?.login || "пользователь сайта",
    };

    try {
      let updateResult = await supabase
        .from(siteIncomingTable)
        .update(basePayload)
        .eq("id", row.id);

      if (updateResult.error) {
        const message = String(updateResult.error.message || updateResult.error || "");
        if (message.includes("status") || message.includes("check")) {
          updateResult = await supabase
            .from(siteIncomingTable)
            .update({ ...basePayload, status: "rejected" })
            .eq("id", row.id);
        }
      }

      if (updateResult.error) throw updateResult.error;

      await logSiteAction("cancel_upload", {
        incoming_file_id: row.id,
        site_section_id: row.site_section_id,
        building_gp_no: row.building_gp_no,
        building_name: row.building_name,
        stage: row.stage,
        section_code: row.section_code,
        section_title: row.section_title,
        target_area: row.target_area,
        file_name: row.original_filename || row.stored_filename,
        file_size: row.file_size,
        yandex_path: row.yandex_temp_path,
        status: "cancelled",
        decision: "cancelled_by_uploader",
        comment: "отменено загрузившим пользователем",
      });

      await loadGapaActionHistory();
    } catch (error) {
      setGapaHistoryError(`Не удалось отменить загрузку: ${error.message}`);
    } finally {
      setGapaCancelLoadingId("");
    }
  }

  function yandexCatalogKey(section, catalog) {
    return `${section?.id || "section"}:${catalog?.value || "catalog"}`;
  }

  function getGipApiHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (GIP_API_KEY) headers["x-gip-api-key"] = GIP_API_KEY;
    return headers;
  }

  function getGipApiUrl(path) {
    return `${GIP_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function extractGipApiMessage(data, fallback) {
    return data?.error?.message || data?.error || data?.message || data?.description || data?.raw || fallback;
  }

  async function invokeGipJson(path, payload) {
    const response = await fetch(getGipApiUrl(path), {
      method: "POST",
      headers: getGipApiHeaders(),
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(String(extractGipApiMessage(data, `GIP API HTTP ${response.status}`)));
    }

    if (data?.error) {
      throw new Error(String(extractGipApiMessage(data, "GIP API error")));
    }

    return data || {};
  }

  async function invokeYandexReadonly(payload) {
    return invokeGipJson("/yandex", payload);
  }

  async function uploadIncomingFileInChunks(file, options) {
    const chunkSize = Math.max(256 * 1024, Number(INCOMING_UPLOAD_CHUNK_BYTES || 2 * 1024 * 1024));
    const totalChunks = Math.ceil(file.size / chunkSize);

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunkBuffer = await file.slice(start, end).arrayBuffer();
      const chunkBase64 = arrayBufferToBase64(chunkBuffer);
      setIncomingUploadNotice(`Загружаю файл: часть ${index + 1} из ${totalChunks}.`);
      await invokeGipJson("/incoming/upload-chunk", {
        upload_id: options.uploadId,
        chunk_index: index,
        total_chunks: totalChunks,
        chunk_base64: chunkBase64,
      });
    }

    setIncomingUploadNotice("Завершаю загрузку файла и создаю заявку для ГИПа.");
    return invokeGipJson("/incoming/finish-upload", {
      upload_id: options.uploadId,
      total_chunks: totalChunks,
      disk_path: options.diskPath,
      content_type: options.contentType || "application/octet-stream",
      file_size: file.size,
      sha256: options.sha256 || "",
      incoming_table: options.incomingTable,
      incoming_payload: options.payload,
      overwrite: false,
    });
  }

  async function fetchYandexFileBlob(path) {
    const response = await fetch(getGipApiUrl("/yandex"), {
      method: "POST",
      headers: getGipApiHeaders(),
      body: JSON.stringify({ action: "content", path }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      const message = data?.error || data?.message || data?.description || data?.raw || `GIP API HTTP ${response.status}`;
      throw new Error(String(message));
    }

    return response.blob();
  }

  async function readYandexCatalog(section, catalog) {
    const key = yandexCatalogKey(section, catalog);
    const path = catalog?.path || "";

    if (!path) {
      setYandexCatalogState((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: "Для этого каталога нет пути. Сначала синхронизируйте разделы из локальной программы.",
          items: [],
          normalizedPath: "",
        },
      }));
      return;
    }

    if (!isSupabaseReady || !supabase) {
      setYandexCatalogState((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: "Supabase не подключён. Невозможно вызвать серверную функцию Яндекс.Диска.",
          items: [],
          normalizedPath: path,
        },
      }));
      return;
    }

    setYandexCatalogState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), loading: true, error: "", items: [], normalizedPath: path },
    }));

    try {
      const data = await invokeYandexReadonly({ action: "list", path });

      setYandexCatalogState((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: "",
          items: Array.isArray(data?.items) ? data.items : [],
          normalizedPath: data?.path || path,
        },
      }));
    } catch (error) {
      const message = error?.message || "Не удалось прочитать каталог Яндекс.Диска.";
      const notFound = isYandexNotFoundMessage(message);
      setYandexCatalogState((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: notFound ? "" : message,
          missing: notFound,
          missingMessage: notFound ? getMissingCatalogText(catalog) : "",
          items: [],
          normalizedPath: path,
        },
      }));
    }
  }

  async function openYandexDiskFile(path, metadata = {}) {
    if (!path) return;
    if (!isSupabaseReady || !supabase) {
      setSiteDirectoryError("GIP API не подключён. Невозможно получить ссылку на скачивание.");
      return;
    }

    try {
      const data = await invokeYandexReadonly({ action: "download", path });
      if (!data?.href) throw new Error("Яндекс.Диск не вернул ссылку на скачивание.");

      window.open(data.href, "_blank", "noopener,noreferrer");
      logSiteAction("download_file", {
        ...metadata,
        yandex_path: path,
        file_name: metadata.file_name || String(path).split("/").pop() || "",
        comment: "скачивание через Яндекс.Диск",
      });
    } catch (error) {
      setSiteDirectoryError(`Ошибка получения ссылки Яндекс.Диска: ${error.message}`);
    }
  }

  async function downloadCategoryAsArchive(category, files) {
    const downloadableFiles = (files || []).filter((file) => getArchitectFileYandexPath(file));
    if (!downloadableFiles.length) {
      setSiteDirectoryError("В выбранном разделе нет файлов с путем Яндекс.Диска для архива.");
      return;
    }

    const categoryInfo = ARCHITECT_FILE_CATEGORIES.find((item) => item.value === category);
    const archiveKey = `${modalSiteSection?.id || selectedSiteSection?.id || "section"}:${category}`;
    const section = modalSiteSection || selectedSiteSection || {};
    const archiveName = sanitizeZipPart([
      section.building_gp_no || "GP",
      section.section_code || "section",
      categoryInfo?.shortLabel || category,
    ].filter(Boolean).join("_"));

    setArchiveDownloadState((prev) => ({ ...prev, [archiveKey]: true }));
    setSiteDirectoryError("");

    try {
      const zip = new JSZip();
      const usedNames = new Set();

      for (const file of downloadableFiles) {
        const diskPath = getArchitectFileYandexPath(file);
        const blob = await fetchYandexFileBlob(diskPath);
        const fileName = makeUniqueZipName(usedNames, file.file_name || String(diskPath).split("/").pop() || "file");
        zip.file(fileName, blob);
      }

      const archiveBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archiveBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${archiveName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      logSiteAction("download_archive", {
        site_section_id: section.id || "",
        building_gp_no: section.building_gp_no || "",
        building_name: section.building_name || "",
        stage: normalizeStage(section.stage || ""),
        section_code: section.section_code || "",
        section_title: section.section_title || "",
        target_area: category,
        file_name: `${archiveName}.zip`,
        comment: `архив: ${categoryInfo?.label || category}; файлов: ${downloadableFiles.length}`,
        details: { files_count: downloadableFiles.length },
      });
    } catch (error) {
      setSiteDirectoryError(`Ошибка скачивания архива: ${error.message}`);
    } finally {
      setArchiveDownloadState((prev) => ({ ...prev, [archiveKey]: false }));
    }
  }

  async function addFileToSiteSection(event) {
    event.preventDefault();
    setNotice("");
    setSiteDirectoryError("");
    setIncomingUploadError("");
    setIncomingUploadNotice("");

    const setUploadError = (message) => {
      setIncomingUploadError(message);
      setIncomingUploadNotice("");
    };

    const targetSection = modalSiteSection || selectedSiteSection;
    const filesToUpload = Array.isArray(selectedUploadFiles) ? selectedUploadFiles : [];
    if (!targetSection) {
      setUploadError("Выберите раздел.");
      return;
    }
    if (!filesToUpload.length) {
      setUploadError("Выберите один или несколько файлов для загрузки.");
      return;
    }
    if (!fileComment.trim()) {
      setUploadError("Кратко опишите, что это за файлы и куда их нужно вставить.");
      return;
    }
    if (!isSupabaseReady || !supabase) {
      setUploadError("GIP API не подключён. Загрузка во входящую очередь невозможна.");
      return;
    }

    for (const file of filesToUpload) {
      if (file.size <= 0) {
        setUploadError(`Пустой файл нельзя загрузить во входящую очередь: ${file.name}.`);
        return;
      }
      if (file.size > MAX_INCOMING_UPLOAD_BYTES) {
        setUploadError(`Файл слишком большой: ${file.name}. Ограничение: ${formatFileSize(MAX_INCOMING_UPLOAD_BYTES)}.`);
        return;
      }
      if (isBlockedUploadFile(file.name)) {
        setUploadError(`Этот тип файла запрещен для загрузки во входящую очередь: ${file.name}.`);
        return;
      }
    }

    setIncomingUploadSubmitting(true);

    try {
      for (let index = 0; index < filesToUpload.length; index += 1) {
        const uploadFile = filesToUpload[index];
        setIncomingUploadNotice(`Готовлю файл ${index + 1} из ${filesToUpload.length}: ${uploadFile.name}`);
        const uploadId = randomUploadId();
        const safeName = safeUploadFileName(uploadFile.name);
        const diskPath = makeIncomingDiskPath(targetSection, uploadId, safeName);
        const sha256 = await fileSha256(uploadFile);

        const payload = {
          project_key: targetSection.project_key || "opr_donetsk",
          site_section_id: targetSection.id,
          building_gp_no: targetSection.building_gp_no || "",
          building_name: targetSection.building_name || "",
          stage: normalizeStage(targetSection.stage || ""),
          section_code: targetSection.section_code || "",
          section_title: targetSection.section_title || "",
          target_area: fileCategory,
          target_yandex_folder: getYandexCatalogsForSection(targetSection).find((item) => item.value === fileCategory)?.path || "",
          original_filename: uploadFile.name,
          stored_filename: safeName,
          yandex_temp_path: diskPath,
          file_size: uploadFile.size,
          sha256,
          mime_type: uploadFile.type || "application/octet-stream",
          uploaded_by: currentUser?.name || currentUser?.login || "",
          uploaded_by_email: currentUser?.email || "",
          user_comment: fileComment.trim(),
          status: "pending",
          active: true,
        };

        const uploadResult = await uploadIncomingFileInChunks(uploadFile, {
          uploadId,
          diskPath,
          contentType: uploadFile.type || "application/octet-stream",
          sha256,
          incomingTable: siteIncomingTable,
          payload,
        });

        logSiteAction("upload_to_gip", {
          incoming_file_id: uploadResult?.incoming?.id || uploadResult?.data?.id || "",
          site_section_id: targetSection.id || "",
          building_gp_no: targetSection.building_gp_no || "",
          building_name: targetSection.building_name || "",
          stage: normalizeStage(targetSection.stage || ""),
          section_code: targetSection.section_code || "",
          section_title: targetSection.section_title || "",
          target_area: fileCategory,
          file_name: uploadFile.name,
          file_size: uploadFile.size,
          yandex_path: diskPath,
          status: "pending",
          comment: fileComment.trim(),
        });
      }

      setFileComment("");
      setFileUrl("");
      setFileYandexPath("");
      setSelectedUploadFiles([]);
      setFileCategory("project_file");
      setIncomingUploadNotice(filesToUpload.length === 1
        ? "загрузка успешно завершена. файл будет размещен после проверки ГИПом"
        : `загрузка успешно завершена. файлов отправлено ГИПу: ${filesToUpload.length}`);
    } catch (error) {
      setIncomingUploadError(`Ошибка загрузки файла во входящую очередь: ${error.message}`);
    } finally {
      setIncomingUploadSubmitting(false);
    }
  }

  function chooseArchitectInterface(choice) {
    setInterfaceChoice(choice);
    setNotice("");
    setSiteDirectoryError("");
    if (choice === "general") {
      const firstAvailableTab = hasAccess(currentUser, "schedule")
        ? "schedule"
        : hasAccess(currentUser, "compact")
          ? "compact"
          : hasAccess(currentUser, "ppt")
            ? "ppt"
            : hasAccess(currentUser, "buildings")
              ? "buildings"
              : "schedule";
      setActiveTab(firstAvailableTab);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setNotice("");

    if (!isSupabaseReady) {
      setLoginError("GIP API не подключён. Проверь .env.local.");
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

      const role = normalizeAccountRole(data.role);
      const normalizedUser = {
        ...data,
        role,
        allowed_elements: normalizeAccessElements(data.allowed_elements, role),
      };

      setCurrentUser(normalizedUser);
      if (normalizedUser.role === "architect") {
        setInterfaceChoice(null);
      } else if (normalizedUser.role === "project_manager") {
        setInterfaceChoice("project_manager");
        setProjectManagerView("home");
      } else {
        setInterfaceChoice("general");
      }
      const firstAvailableTab = hasAccess(normalizedUser, "schedule")
        ? "schedule"
        : hasAccess(normalizedUser, "compact")
          ? "compact"
          : hasAccess(normalizedUser, "ppt")
            ? "ppt"
            : hasAccess(normalizedUser, "buildings")
              ? "buildings"
              : hasAccess(normalizedUser, "accounts")
                ? "accounts"
                : "schedule";
      setActiveTab(firstAvailableTab);
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
    setInterfaceChoice(null);
    setProjectManagerView("home");
    setProjectManagerGraphType("design");
    setSiteSections([]);
    setSiteFiles([]);
  }

  async function addAccount(event) {
    event.preventDefault();
    setNotice("");

    const payload = {
      name: accountForm.name.trim(),
      login: accountForm.login.trim(),
      pin_code: accountForm.pin_code.trim(),
      role: normalizeAccountRole(accountForm.role),
      allowed_elements: normalizeAccessElements(accountForm.allowed_elements, accountForm.role),
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
      setNotice(`Ошибка добавления учетной записи: ${formatAccountSaveError(error)}`);
    }
  }

  async function updateAccount(account, patch) {
    setNotice("");

    const nextRole = patch.role ? normalizeAccountRole(patch.role) : normalizeAccountRole(account.role);
    const normalizedPatch = {
      ...patch,
      ...(patch.role ? { role: nextRole } : {}),
      ...(patch.allowed_elements
        ? { allowed_elements: normalizeAccessElements(patch.allowed_elements, nextRole) }
        : patch.role
          ? { allowed_elements: ROLE_DEFAULT_ACCESS[nextRole] || ROLE_DEFAULT_ACCESS.designer }
          : {}),
    };

    try {
      const { error } = await supabase
        .from("employees")
        .update(normalizedPatch)
        .eq("id", account.id);

      if (error) throw error;

      setNotice("Учетная запись обновлена.");
      await loadAccounts();
    } catch (error) {
      setNotice(`Ошибка обновления учетной записи: ${formatAccountSaveError(error)}`);
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

  async function deleteAccount(account) {
    setNotice("");

    if (currentUser?.id === account.id) {
      setNotice("Нельзя удалить учетную запись, под которой выполнен текущий вход.");
      return;
    }

    const confirmed = window.confirm(
      `Удалить учетную запись "${account.name}"? Это действие нельзя отменить.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("employees")
        .delete()
        .eq("id", account.id);

      if (error) throw error;

      setNotice("Учетная запись удалена.");
      await loadAccounts();
    } catch (error) {
      setNotice(`Ошибка удаления учетной записи: ${error.message}`);
    }
  }

  async function toggleAccountAccess(account, elementKey) {
    const currentAccess = normalizeAccessElements(account.allowed_elements, account.role);
    const hasElement = currentAccess.includes(elementKey);
    const nextAccess = hasElement
      ? currentAccess.filter((item) => item !== elementKey)
      : [...currentAccess, elementKey];

    if (nextAccess.length === 0) {
      setNotice("У пользователя должен быть доступ хотя бы к одному элементу.");
      return;
    }

    await updateAccount(account, { allowed_elements: nextAccess });
  }

  function toggleFormAccess(elementKey) {
    setAccountForm((current) => {
      const currentAccess = normalizeAccessElements(current.allowed_elements, current.role);
      const hasElement = currentAccess.includes(elementKey);
      const nextAccess = hasElement
        ? currentAccess.filter((item) => item !== elementKey)
        : [...currentAccess, elementKey];

      return {
        ...current,
        allowed_elements: nextAccess.length ? nextAccess : currentAccess,
      };
    });
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

  function openScheduleItemEdit(itemIndex) {
    const item = scheduleRows[itemIndex];
    if (!item) return;

    setEditTarget({ type: "schedule", index: itemIndex });
    setRenameValue(item.title || "");
    setExtendValue(item.end || "");
    setActiveTab("editItem");
  }

  function openPptItemEdit(itemIndex) {
    const item = pptItems[itemIndex];
    if (!item || item.type === "group") return;

    setEditTarget({ type: "ppt", index: itemIndex });
    setRenameValue(item.title || "");
    setExtendValue(item.end || "");
    setActiveTab("editItem");
  }

  function getEditItem() {
    if (!editTarget) return null;
    return editTarget.type === "schedule"
      ? scheduleRows[editTarget.index]
      : pptItems[editTarget.index];
  }

  async function renameEditItem() {
    const value = renameValue.trim();

    if (!editTarget || !value) {
      setNotice("Введите новое наименование пункта.");
      return;
    }

    if (editTarget.type === "schedule") {
      setScheduleRows((current) =>
        current.map((item, index) =>
          index === editTarget.index ? { ...item, title: value } : item
        )
      );
      setNotice("Пункт графика переименован.");
      return;
    }

    const next = pptItems.map((item, index) =>
      index === editTarget.index ? normalizePptItem({ ...item, title: value }) : item
    );

    setPptItems(next);
    setPptDraftItems(clonePptItems(next));
    saveLocalPptItems(next);
    await savePptItemsToSupabase(next, "Пункт графика ППТ переименован.");
  }

  async function deleteEditItem() {
    if (!editTarget) return;

    const confirmed = window.confirm("Удалить выбранный пункт графика?");
    if (!confirmed) return;

    if (editTarget.type === "schedule") {
      setScheduleRows((current) => current.filter((_, index) => index !== editTarget.index));
      setEditTarget(null);
      setActiveTab("schedule");
      setNotice("Пункт графика удалён.");
      return;
    }

    const next = pptItems.filter((_, index) => index !== editTarget.index);
    setPptItems(next);
    setPptDraftItems(clonePptItems(next));
    saveLocalPptItems(next);
    setEditTarget(null);
    setActiveTab("ppt");
    await savePptItemsToSupabase(next, "Пункт графика ППТ удалён.");
  }

  async function extendEditItem() {
    if (!editTarget || !extendValue) {
      setNotice("Укажите новую дату окончания.");
      return;
    }

    if (editTarget.type === "schedule") {
      setScheduleRows((current) =>
        current.map((item, index) =>
          index === editTarget.index ? { ...item, end: extendValue } : item
        )
      );
      setNotice("Срок пункта продлён.");
      return;
    }

    const item = pptItems[editTarget.index];
    if (!item) return;

    const periodIndex = findNearestPptPeriodIndex(extendValue);
    const newEvent = {
      periodIndex,
      text: `Продлено до ${formatDate(extendValue)}`,
    };

    const next = pptItems.map((currentItem, index) => {
      if (index !== editTarget.index) return currentItem;

      return normalizePptItem({
        ...currentItem,
        events: [...(currentItem.events || []), newEvent],
      });
    });

    setPptItems(next);
    setPptDraftItems(clonePptItems(next));
    saveLocalPptItems(next);
    await savePptItemsToSupabase(next, "Срок пункта графика ППТ продлён.");
  }

  async function savePptItemsToSupabase(items, successMessage) {
    if (isSupabaseReady && supabase) {
      try {
        const { error } = await supabase
          .from("ppt_schedule")
          .upsert(
            {
              id: 1,
              data: items,
              updated_by: currentUser?.login || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );

        if (error) throw error;

        setPptMessage(successMessage);
        setNotice(successMessage);
        return;
      } catch {
        setPptMessage(`${successMessage} Изменение сохранено локально, но не записано в Supabase.`);
        setNotice(`${successMessage} Изменение сохранено локально, но не записано в Supabase.`);
        return;
      }
    }

    setPptMessage(`${successMessage} Изменение сохранено локально.`);
    setNotice(`${successMessage} Изменение сохранено локально.`);
  }

  function findNearestPptPeriodIndex(dateValue) {
    const target = dateToTime(dateValue);

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    pptPeriods.forEach((period, index) => {
      const startDistance = Math.abs(dateToTime(period.start) - target);
      const endDistance = Math.abs(dateToTime(period.end) - target);
      const distance = Math.min(startDistance, endDistance);

      if (distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });

    return bestIndex;
  }

  function renderEditItemPage() {
    const item = getEditItem();

    if (!item) {
      return (
        <section className="contentStack">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Редактирование</p>
              <h2>Пункт графика не выбран</h2>
            </div>
            <button className="secondaryButton" onClick={() => setActiveTab("schedule")}>
              Вернуться к графику
            </button>
          </div>
        </section>
      );
    }

    const sourceTab = editTarget.type === "schedule" ? "schedule" : "ppt";

    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Редактирование пункта</p>
            <h2>{item.code} — {item.title}</h2>
          </div>
          <button className="secondaryButton" onClick={() => setActiveTab(sourceTab)}>
            Назад к графику
          </button>
        </div>

        {notice && <div className="noticeBox">{notice}</div>}

        <div className="editItemCard">
          <div className="editItemInfo">
            <div>
              <span>Код</span>
              <strong>{item.code}</strong>
            </div>
            <div>
              <span>Начало</span>
              <strong>{item.start ? formatDate(item.start) : "—"}</strong>
            </div>
            <div>
              <span>Окончание</span>
              <strong>{item.end ? formatDate(item.end) : "—"}</strong>
            </div>
            {item.duration && (
              <div>
                <span>Срок</span>
                <strong>{item.duration}</strong>
              </div>
            )}
          </div>

          <div className="editActionGrid">
            <div className="editActionBlock">
              <h3>Переименовать</h3>
              <label>
                Новое наименование
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  placeholder="Введите новое наименование"
                />
              </label>
              <button className="primaryButton" onClick={renameEditItem}>
                Переименовать
              </button>
            </div>

            <div className="editActionBlock">
              <h3>Продлить</h3>
              <label>
                Новая дата окончания
                <input
                  type="date"
                  value={extendValue || ""}
                  onChange={(event) => setExtendValue(event.target.value)}
                />
              </label>
              <button className="secondaryButton" onClick={extendEditItem}>
                Продлить
              </button>
            </div>

            <div className="editActionBlock dangerBlock">
              <h3>Удалить</h3>
              <p>Пункт будет удалён из текущего графика. Для ППТ изменение сохраняется в Supabase при наличии таблицы.</p>
              <button className="dangerButton" onClick={deleteEditItem}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderArchitectInterfaceChoice() {
    return (
      <main className="loginOnlyPage">
        <section className="loginCard interfaceChoiceCard">
          <p className="eyebrow">Выбор интерфейса</p>
          <div className="appVersionBadge">Версия сайта: {APP_VERSION}</div>
          <h1>Какой интерфейс использовать?</h1>
          <p className="choiceText">
            Для учетной записи архитектора доступен общий интерфейс сайта и специализированный интерфейс для работы со зданиями, разделами и файлами.
          </p>
          <div className="choiceGrid">
            <button className="choiceButton" onClick={() => chooseArchitectInterface("general")}>
              <strong>Общий интерфейс</strong>
              <span>Графики, здания и остальные разделы сайта.</span>
            </button>
            <button className="choiceButton primaryChoice" onClick={() => chooseArchitectInterface("specialized")}>
              <strong>Специализированный интерфейс</strong>
              <span>Выбор здания, список разделов и чтение файлов с Яндекс.Диска.</span>
            </button>
          </div>
          <button className="ghostButton choiceLogoutButton" onClick={logout}>Выйти</button>
        </section>
      </main>
    );
  }

  function renderArchitectWorkspace() {
    const currentBuilding = siteBuildings.find((item) => item.key === selectedSiteBuildingKey);

    return (
      <main className="appShell architectShell">
        <header className="topBar">
          <div>
            <p className="eyebrow">Специализированный интерфейс</p>
            <h1>Работа архитектора с разделами</h1>
          </div>
          <div className="userPanel">
            <div>
              <strong>{currentUser.name}</strong>
              <span>{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
            </div>
            <button className="secondaryButton" onClick={() => setInterfaceChoice(null)}>Сменить интерфейс</button>
            <button className="ghostButton" onClick={logout}>Выйти</button>
          </div>
        </header>

        <section className="contentStack">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Справочник из локальной программы ГИПа</p>
              <h2>Здания и разделы</h2>
            </div>
            <div className="sectionHeaderActions">
              <button className="secondaryButton" onClick={openGapaActionHistory} disabled={gapaHistoryLoading}>
                {gapaHistoryLoading && gapaHistoryOpen ? "Загружаю историю..." : "История действий"}
              </button>
              <button className="secondaryButton" onClick={loadSiteDirectory} disabled={siteDirectoryLoading}>
                {siteDirectoryLoading ? "Обновление..." : "Обновить"}
              </button>
            </div>
          </div>

          {notice && <div className="noticeBox">{notice}</div>}
          {siteDirectoryError && <div className="errorBox">{siteDirectoryError}</div>}

          <div className="architectGrid">
            <aside className="architectPanel buildingChooserPanel">
              <div className="buildingChooserHeader">
                <label>
                  Фильтр по названию / номеру
                  <input
                    value={siteBuildingSearch}
                    onChange={(event) => setSiteBuildingSearch(event.target.value)}
                    placeholder="Начните вводить название или номер здания"
                  />
                </label>
              </div>

              <div className="buildingList" role="listbox" aria-label="Список зданий">
                {filteredSiteBuildings.map((building) => (
                  <button
                    type="button"
                    key={building.key}
                    className={building.key === selectedSiteBuildingKey ? "buildingListItem active" : "buildingListItem"}
                    onClick={() => setSelectedSiteBuildingKey(building.key)}
                  >
                    <span>{building.gpNo || "—"}</span>
                    <strong>{building.name || building.title}</strong>
                  </button>
                ))}
                {!filteredSiteBuildings.length && (
                  <div className="emptyBuildingList">Здания по фильтру не найдены.</div>
                )}
              </div>

              <div className="buildingInfoMini">
                <span>Выбрано здание</span>
                <strong>{currentBuilding?.title || "Нет данных"}</strong>
              </div>

              <div className="smallHintBox">
                Список зданий и разделов загружается из локальной программы через вкладку «Сервисные функции → Работа с сайтом».
              </div>
            </aside>

            <section className="architectPanel mainArchitectPanel">
              <div className="cardHeaderLine sectionListHeader">
                <div>
                  <p className="eyebrow">Существующие разделы</p>
                  <h3>{selectedSiteBuildingSections.length} разделов</h3>
                </div>
                <div className="stageRadioGroup" role="radiogroup" aria-label="Выбор стадии">
                  {ARCHITECT_STAGE_OPTIONS.map((stageOption) => (
                    <label
                      key={stageOption.value}
                      className={architectStage === stageOption.value ? "stageRadio active" : "stageRadio"}
                    >
                      <input
                        type="radio"
                        name="architectStage"
                        value={stageOption.value}
                        checked={architectStage === stageOption.value}
                        onChange={() => setArchitectStage(stageOption.value)}
                      />
                      <span>{stageOption.label}</span>
                      <small>{architectStageCounts[stageOption.value] || 0}</small>
                    </label>
                  ))}
                </div>
              </div>

              <div className="architectSectionTableWrap">
                <table className="architectSectionTable">
                  <thead>
                    <tr>
                      <th>Стадия</th>
                      <th>Раздел</th>
                      <th>Наименование</th>
                      <th>Шифр</th>
                      <th>Файл</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSiteBuildingSections.map((section) => {
                      const hasProjectFile = siteSectionHasProjectFile(section);
                      const rowClassName = [
                        selectedSiteSection?.id === section.id ? "selectedRow" : "",
                        hasProjectFile ? "" : "missingProjectFileRow",
                      ].filter(Boolean).join(" ");
                      return (
                        <tr
                          key={section.id}
                          className={rowClassName}
                          onClick={() => {
                            setSelectedSiteSectionId(section.id);
                            setSiteSectionModalId(section.id);
                          }}
                        >
                          <td>{normalizeStage(section.stage)}</td>
                          <td><strong>{section.section_code}</strong></td>
                          <td>{section.section_title}</td>
                          <td>{section.cipher}</td>
                          <td>{hasProjectFile ? (section.common_latest_version_name || "Есть") : <span className="missingProjectFileText">Файл проекта не прикреплен</span>}</td>
                        </tr>
                      );
                    })}
                    {!selectedSiteBuildingSections.length && (
                      <tr>
                        <td colSpan="5" className="emptyCell">Для выбранного здания и стадии разделы не найдены. Выполните синхронизацию из локальной программы.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="smallHintBox">
                Нажмите на строку раздела, чтобы открыть карточку раздела и проверить чтение каталогов Яндекс.Диска по файлам проекта, ТЗ, исходникам и замечаниям.
              </div>
            </section>
          </div>
        </section>
        {renderArchitectSectionModal()}
        {renderGapaActionHistoryModal()}
      </main>
    );
  }

  function renderArchitectSectionModal() {
    if (!siteSectionModalId || !modalSiteSection) return null;

    const categoryFiles = (category) => modalSiteSectionFiles.filter((file) => getArchitectFileCategory(file) === category);

    return (
      <div className="architectModalBackdrop" onClick={() => setSiteSectionModalId("")}>
        <section className="architectSectionModal" onClick={(event) => event.stopPropagation()}>
          <div className="modalHeader">
            <div>
              <p className="eyebrow">Карточка раздела</p>
              <h2>{modalSiteSection.section_code} — {modalSiteSection.section_title}</h2>
              <p className="modalSubline">
                {modalSiteSection.building_gp_no || "—"} — {modalSiteSection.building_name || "Здание не указано"} / стадия {normalizeStage(modalSiteSection.stage)} / шифр {modalSiteSection.cipher || "—"}
              </p>
            </div>
            <button className="ghostButton" onClick={() => setSiteSectionModalId("")}>Закрыть</button>
          </div>

          <div className="modalToolsLine">
            <button
              type="button"
              className="secondaryButton"
              onClick={() => setShowYandexCatalogTester((value) => !value)}
            >
              {showYandexCatalogTester ? "Скрыть проверку каталогов" : "Проверить каталоги Яндекс.Диска"}
            </button>
            <span>Проверка каталогов нужна для диагностики сопоставления путей. В обычной работе она может быть скрыта.</span>
          </div>

          <div className={showYandexCatalogTester ? "modalContentGrid" : "modalContentGrid singleColumn"}>
            <section className="modalBlock">
              <div className="cardHeaderLine">
                <p className="eyebrow">Карточки из базы сайта</p>
                <h3>Зарегистрированные документы</h3>
              </div>

              <div className="fileCategoryList">
                {ARCHITECT_FILE_CATEGORIES.map((category) => {
                  const files = categoryFiles(category.value);
                  return (
                    <div className="fileCategoryBlock" key={category.value}>
                      <div className="fileCategoryTitle">
                        <strong>{category.label}</strong>
                        <div className="fileCategoryActions">
                          {(category.value === "tz" || category.value === "source" || category.value === "remark") && (
                            <button
                              type="button"
                              className="archiveButton"
                              onClick={() => downloadCategoryAsArchive(category.value, files)}
                              disabled={!files.some((file) => getArchitectFileYandexPath(file)) || archiveDownloadState[`${modalSiteSection?.id || "section"}:${category.value}`]}
                            >
                              {archiveDownloadState[`${modalSiteSection?.id || "section"}:${category.value}`] ? "Готовлю архив..." : "Скачать архивом"}
                            </button>
                          )}
                          <span>{files.length}</span>
                        </div>
                      </div>
                      <div className="fileList">
                        {files.map((file) => (
                          <article className="fileCard" key={file.id}>
                            <div>
                              <strong>{file.file_name || "Файл"}</strong>
                              {file.size_bytes ? <small>Размер: {formatFileSize(file.size_bytes)}</small> : null}
                              {getArchitectFileDate(file) ? <small>Дата: {getArchitectFileDate(file)}</small> : null}
                            </div>
                            {file.file_url ? (
                              <button
                                className="smallButton"
                                onClick={() => {
                                  window.open(file.file_url, "_blank", "noopener,noreferrer");
                                  logSiteAction("download_file", {
                                    site_section_id: modalSiteSection.id || "",
                                    document_card_id: file.id || "",
                                    building_gp_no: modalSiteSection.building_gp_no || "",
                                    building_name: modalSiteSection.building_name || "",
                                    stage: normalizeStage(modalSiteSection.stage || ""),
                                    section_code: modalSiteSection.section_code || "",
                                    section_title: modalSiteSection.section_title || "",
                                    target_area: category.value,
                                    file_name: file.file_name || file.original_name || "",
                                    file_size: file.size_bytes || null,
                                    file_url: file.file_url,
                                    comment: "скачивание по прямой ссылке",
                                  });
                                }}
                              >
                                Скачать / открыть
                              </button>
                            ) : getArchitectFileYandexPath(file) ? (
                              <button
                                className="smallButton"
                                onClick={() => openYandexDiskFile(getArchitectFileYandexPath(file), {
                                  site_section_id: modalSiteSection.id || "",
                                  document_card_id: file.id || "",
                                  building_gp_no: modalSiteSection.building_gp_no || "",
                                  building_name: modalSiteSection.building_name || "",
                                  stage: normalizeStage(modalSiteSection.stage || ""),
                                  section_code: modalSiteSection.section_code || "",
                                  section_title: modalSiteSection.section_title || "",
                                  target_area: category.value,
                                  file_name: file.file_name || file.original_name || "",
                                  file_size: file.size_bytes || null,
                                })}
                              >
                                Скачать
                              </button>
                            ) : (
                              <span className="fileNoLink">Нет ссылки</span>
                            )}
                          </article>
                        ))}
                        {!files.length && <div className="emptyFileBox">Нет зарегистрированных документов этого типа.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="modalBlock incomingUploadBlock">
              <div className="cardHeaderLine">
                <p className="eyebrow">Входящие с сайта</p>
                <h3>Загрузить файл ГИПу на проверку</h3>
              </div>
              <div className="readOnlyNotice">
                Файл будет помещен во временную папку Яндекс.Диска и появится в локальной программе ГИПа как заявка. В рабочие папки раздела файл попадет только после принятия ГИПом.
              </div>
              <form className="incomingUploadForm" onSubmit={addFileToSiteSection}>
                <label>
                  Тип вставки
                  <select value={fileCategory} onChange={(event) => setFileCategory(event.target.value)}>
                    {ARCHITECT_FILE_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Файл
                  <input
                    type="file"
                    multiple
                    onChange={(event) => setSelectedUploadFiles(Array.from(event.target.files || []))}
                  />
                </label>
                {selectedUploadFiles.length > 0 && (
                  <div className="selectedUploadFileInfo">
                    Выбрано файлов: <strong>{selectedUploadFiles.length}</strong>
                    <ul>
                      {selectedUploadFiles.map((file) => (
                        <li key={`${file.name}:${file.size}`}>{file.name} / {formatFileSize(file.size)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <label>
                  Что сделать с файлом
                  <textarea
                    value={fileComment}
                    onChange={(event) => setFileComment(event.target.value)}
                    placeholder="Например: добавить как исходник по разделу АР; добавить в набор ТЗ; принять как файл замечаний."
                    rows={3}
                  />
                </label>
                {incomingUploadError && <div className="errorBox incomingUploadMessage">{incomingUploadError}</div>}
                {incomingUploadNotice && <div className="noticeBox incomingUploadMessage">{incomingUploadNotice}</div>}
                <button className="primaryButton" type="submit" disabled={incomingUploadSubmitting}>
                  {incomingUploadSubmitting ? "Загружаю..." : "Загрузить ГИПу"}
                </button>
              </form>
            </section>

            {showYandexCatalogTester && (
            <section className="modalBlock yandexReadOnlyBlock">
              <div className="cardHeaderLine">
                <p className="eyebrow">Яндекс.Диск / только чтение</p>
                <h3>Проверка сопоставления каталогов</h3>
              </div>

              <div className="readOnlyNotice">
                На этом этапе запись отключена: сайт только читает существующие каталоги Яндекс.Диска и получает ссылки на скачивание.
              </div>

              <div className="yandexCatalogList">
                {getYandexCatalogsForSection(modalSiteSection).map((catalog) => {
                  const stateKey = yandexCatalogKey(modalSiteSection, catalog);
                  const readState = yandexCatalogState[stateKey] || {};
                  const files = Array.isArray(readState.items) ? readState.items : [];

                  return (
                    <article className="yandexCatalogCard" key={catalog.value}>
                      <div className="yandexCatalogHeader">
                        <div>
                          <strong>{catalog.label}</strong>
                          <span>{catalog.source}</span>
                        </div>
                        <button
                          type="button"
                          className="smallButton"
                          onClick={() => readYandexCatalog(modalSiteSection, catalog)}
                          disabled={readState.loading}
                        >
                          {readState.loading ? "Читаю..." : "Проверить каталог"}
                        </button>
                      </div>

                      <div className="diskPathBox">{catalog.path || "Путь не определен"}</div>
                      <p className="catalogDescription">{catalog.description}</p>

                      {readState.error && <div className="errorBox compactError">{readState.error}</div>}
                      {readState.missing && (
                        <div className="missingCatalogBox">
                          {readState.missingMessage}
                          {readState.normalizedPath && (
                            <span>Проверенный путь: <strong>{readState.normalizedPath}</strong></span>
                          )}
                        </div>
                      )}

                      {readState.normalizedPath && !readState.error && !readState.missing && (
                        <div className="catalogResultInfo">
                          Прочитан путь: <strong>{readState.normalizedPath}</strong>. Найдено: <strong>{files.length}</strong>
                        </div>
                      )}

                      <div className="diskFileList">
                        {files.map((item) => (
                          <div className="diskFileRow" key={item.path || item.name}>
                            <div>
                              <strong>{item.name}</strong>
                              <span>{item.type === "dir" ? "Папка" : "Файл"}{item.size ? ` / ${formatFileSize(item.size)}` : ""}</span>
                              {item.modified && <small>{item.modified}</small>}
                            </div>
                            {item.type !== "dir" && (
                              <button
                                className="smallButton"
                                type="button"
                                onClick={() => openYandexDiskFile(item.path, {
                                  site_section_id: modalSiteSection.id || "",
                                  building_gp_no: modalSiteSection.building_gp_no || "",
                                  building_name: modalSiteSection.building_name || "",
                                  stage: normalizeStage(modalSiteSection.stage || ""),
                                  section_code: modalSiteSection.section_code || "",
                                  section_title: modalSiteSection.section_title || "",
                                  target_area: catalog.value,
                                  file_name: item.name || "",
                                  file_size: item.size || null,
                                })}
                              >
                                Скачать
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderGapaActionHistoryModal() {
    if (!gapaHistoryOpen) return null;

    const activeRows = gapaHistoryTab === "pending" ? gapaPendingRows : gapaHistoryRows;

    return (
      <div className="architectModalBackdrop historyModalBackdrop" onClick={() => setGapaHistoryOpen(false)}>
        <section className="architectSectionModal gapaHistoryModal" onClick={(event) => event.stopPropagation()}>
          <div className="modalHeader">
            <div>
              <p className="eyebrow">ГАПА</p>
              <h2>История действий</h2>
              <p className="modalSubline">
                Скачивания с сайта, загрузки файлов ГИПу и решения ГИПа по входящим файлам.
              </p>
            </div>
            <div className="modalHeaderActions">
              <button className="secondaryButton" type="button" onClick={loadGapaActionHistory} disabled={gapaHistoryLoading}>
                {gapaHistoryLoading ? "Обновляю..." : "Обновить"}
              </button>
              <button className="ghostButton" type="button" onClick={() => setGapaHistoryOpen(false)}>Закрыть</button>
            </div>
          </div>

          <div className="historyTabs">
            <button
              type="button"
              className={gapaHistoryTab === "full" ? "historyTab active" : "historyTab"}
              onClick={() => setGapaHistoryTab("full")}
            >
              Полная история
              <span>{gapaHistoryRows.length}</span>
            </button>
            <button
              type="button"
              className={gapaHistoryTab === "pending" ? "historyTab active" : "historyTab"}
              onClick={() => setGapaHistoryTab("pending")}
            >
              Что подвешено у ГИПа
              <span>{gapaPendingRows.length}</span>
            </button>
          </div>

          {gapaHistoryError && <div className="errorBox compactError">{gapaHistoryError}</div>}

          {gapaHistoryTab === "full" ? (
            <div className="historyTableWrap">
              <table className="historyTable">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Кто</th>
                    <th>Действие</th>
                    <th>Файл</th>
                    <th>Куда</th>
                    <th>Тип</th>
                    <th>Статус / основание</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatActionDate(row.eventAt)}</td>
                      <td>{row.actor}</td>
                      <td><strong>{row.action}</strong></td>
                      <td>
                        <div className="historyFileCell">
                          <strong>{row.fileName}</strong>
                          {row.details ? <small>{row.details}</small> : null}
                        </div>
                      </td>
                      <td>{row.sectionText}</td>
                      <td>{row.category}</td>
                      <td>
                        <div className="historyStatusCell">
                          <span>{row.status}</span>
                          <small>{row.basis}</small>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!activeRows.length && (
                    <tr>
                      <td colSpan="7" className="emptyCell">История пока пустая.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pendingHistoryList">
              {gapaPendingRows.map((row) => {
                const cancelable = isIncomingCancelable(row);
                return (
                  <article className="pendingHistoryCard" key={row.id}>
                    <div>
                      <div className="pendingHistoryHeader">
                        <strong>{row.original_filename || row.stored_filename || "Файл"}</strong>
                        <span>{getIncomingStatusLabel(row.status, row.gip_decision)}</span>
                      </div>
                      <p>{makeHistorySectionText(row)}</p>
                      <div className="pendingHistoryMeta">
                        <span>{formatActionDate(row.uploaded_at || row.created_at)}</span>
                        <span>{row.uploaded_by || row.uploaded_by_email || "—"}</span>
                        <span>{getFileCategoryLabel(row.target_area)}</span>
                        {row.file_size ? <span>{formatFileSize(row.file_size)}</span> : null}
                      </div>
                      {row.user_comment && <div className="pendingHistoryComment">{row.user_comment}</div>}
                    </div>
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => cancelIncomingUpload(row)}
                      disabled={!cancelable || gapaCancelLoadingId === row.id}
                      title={cancelable ? "Снять заявку из активной очереди ГИПа" : "Файл уже взят в обработку или не может быть отменён"}
                    >
                      {gapaCancelLoadingId === row.id ? "Отменяю..." : "Отменить загрузку ГИПу"}
                    </button>
                  </article>
                );
              })}
              {!gapaPendingRows.length && (
                <div className="emptyFileBox">Нет файлов, подвешенных у ГИПа.</div>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderLoginPage() {
    return (
      <main className="loginOnlyPage">
        <form className="loginCard" onSubmit={handleLogin}>
          <h1>ОПР Донецкий. Управление проектом</h1>
          <div className="appVersionBadge">Версия сайта: {APP_VERSION}</div>

          {!isSupabaseReady && (
            <div className="warningBox">
              GIP API не подключён. Проверьте переменную VITE_GIP_API_BASE_URL.
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

  function renderAccessDenied(elementName) {
    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Доступ ограничен</p>
            <h2>Нет доступа: {elementName}</h2>
          </div>
          <button className="secondaryButton" onClick={logout}>
            Выйти
          </button>
        </div>
      </section>
    );
  }

  function renderSchedulePage() {
    if (!hasAccess(currentUser, "schedule")) {
      return renderAccessDenied("График проектирования");
    }

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
              {formatDate(scheduleRows[0]?.start || "2026-01-01")} — {formatDate(scheduleRows[scheduleRows.length - 1]?.end || "2026-01-01")}
            </div>
          </div>

          <div className="timelineScale">
            <span>Январь</span>
            <span>Февраль</span>
            <span>Март</span>
            <span>Апрель</span>
          </div>

          <div className="ganttList">
            {scheduleRows.map((item, index) => {
              const overdue = isDeadlinePassed(item.end);

              return (
              <article
                className={overdue ? "ganttRow overdue clickableRow" : "ganttRow clickableRow"}
                key={item.code}
                onClick={() => openScheduleItemEdit(index)}
                title="Открыть редактирование пункта"
              >
                <div className="taskMeta">
                  <strong>{item.code}</strong>
                  <span>{item.title}</span>
                </div>

                <div className="barArea">
                  <div className="barTrack">
                    <div className={overdue ? "bar overdueBar" : "bar"} style={getBarStyle(item, scheduleBounds)}>
                      <span>{item.progress}%</span>
                    </div>
                  </div>
                  <div className="rowDates">
                    <span>{formatDate(item.start)}</span>
                    <span>{formatDate(item.end)}</span>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function renderPptPage() {
    if (!hasAccess(currentUser, "ppt")) {
      return renderAccessDenied("Расширенный график ППТ");
    }

    const visiblePptItems = isPptEditing ? pptDraftItems : pptItems;

    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Расширенный график ППТ</p>
            <h2>Расширенный график подготовки документации ППТ</h2>
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
              const overdue = item.type !== "group" && isDeadlinePassed(item.end);

              if (item.type === "group") {
                return (
                  <article className="pptGroupRow" key={`${item.code}-${index}`}>
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                  </article>
                );
              }

              return (
                <article
                  className={overdue ? "pptRow overdue clickableRow" : "pptRow clickableRow"}
                  key={`${item.code}-${index}`}
                  onClick={() => openPptItemEdit(index)}
                  title="Открыть редактирование пункта"
                >
                  <div className="pptTaskMeta">
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                    {item.duration && <small>Срок: {item.duration}</small>}
                    {item.note && <em>{item.note}</em>}
                  </div>

                  <div className="pptBarArea">
                    <div className="pptBarTrack">
                      {item.events.length > 0 && (
                        <div className={overdue ? "pptBar overdueBar" : "pptBar"} style={getPptBarStyle(item, pptBounds)}>
                          <span>{formatDate(item.start)} — {formatDate(item.end)}</span>
                        </div>
                      )}
                      {overdue && (
                        <b
                          className="overdueLabel overdueLabelAfterBar"
                          style={getPptOverdueLabelStyle(item, pptBounds)}
                        >
                          Срок прошёл
                        </b>
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

  function renderCompactPptPage() {
    if (!hasAccess(currentUser, "compact")) {
      return renderAccessDenied("График ППТ");
    }

    const compactBounds = {
      min: dateToTime(compactMonths[0].start),
      max: dateToTime(compactMonths[compactMonths.length - 1].end),
    };

    const compactRows = pptItems.filter(
      (item) => item.type === "group" || item.events.length > 0
    );

    return (
      <section className="compactSchedulePage">
        <div className="sectionHeader compactHeader">
          <div>
            <p className="eyebrow">График ППТ</p>
            <h2>График ППТ</h2>
          </div>
          <button className="secondaryButton printButton" onClick={() => window.print()}>
            Печать листа
          </button>
        </div>

        <div className="compactSheet">
          <div className="compactSheetTitle">
            <strong>График ППТ</strong>
            <span>Компактная гистограмма на одном листе</span>
          </div>

          <div className="compactMonthHeader">
            <div className="compactNameHeader">Раздел / работа</div>
            <div className="compactMonthGrid">
              {compactMonths.map((month) => (
                <div className="compactMonthCell" key={month.label}>
                  {month.label}
                </div>
              ))}
            </div>
          </div>

          <div className="compactRows">
            {compactRows.map((item, index) => {
              if (item.type === "group") {
                return (
                  <article className="compactGroupRow" key={`${item.code}-${index}`}>
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                  </article>
                );
              }

              const overdue = isDeadlinePassed(item.end);

              return (
                <article
                  className={overdue ? "compactRow overdue" : "compactRow"}
                  key={`${item.code}-${index}`}
                  onClick={() => openPptItemEdit(pptItems.findIndex((sourceItem) => sourceItem === item))}
                  title="Открыть редактирование пункта"
                >
                  <div className="compactRowName">
                    <strong>{item.code}</strong>
                    <span>{item.title}</span>
                  </div>

                  <div className="compactTrack">
                    <div
                      className={overdue ? "compactBar overdueBar" : "compactBar"}
                      style={getCompactBarStyle(item, compactBounds)}
                    >
                      <span>{formatDate(item.start)} — {formatDate(item.end)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function openBuildingPage(buildingId) {
    setSelectedBuildingId(buildingId);
    setActiveTab("buildingDetail");
  }

  function renderBuildingsPage() {
    if (!hasAccess(currentUser, "buildings")) {
      return renderAccessDenied("Страницы зданий");
    }

    return (
      <section className="contentStack">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Здания</p>
            <h2>Страницы зданий комплекса</h2>
          </div>
          <div className="roleBadge">{buildingPages.length} страниц</div>
        </div>

        <div className="buildingGrid">
          {buildingPages.map((building) => (
            <button
              className="buildingCard"
              key={building.id}
              onClick={() => openBuildingPage(building.id)}
            >
              <span>Здание {building.number}</span>
              <strong>{building.title}</strong>
              <small>Лист PDF: {building.sourcePage}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function openImageViewer(src, title) {
    setImageViewer({ src, title });
  }

  function closeImageViewer() {
    setImageViewer(null);
  }

  function renderBuildingDetailPage() {
    if (!hasAccess(currentUser, "buildings")) {
      return renderAccessDenied("Страница здания");
    }

    const building =
      buildingPages.find((item) => item.id === selectedBuildingId) || buildingPages[0];

    const details = buildingDetails[building.id] || {
      description: "Описание будет добавлено после уточнения исходных данных.",
      floors: [],
      explication: [],
    };

    const assets = buildingAssets[building.id] || {
      view: "",
      floors: [],
    };

    return (
      <section className="contentStack buildingDetailPage">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Страница здания</p>
            <h2>{building.title}</h2>
          </div>
          <button className="secondaryButton" onClick={() => setActiveTab("buildings")}>
            К списку зданий
          </button>
        </div>

        <div className="buildingInfoGrid">
          <div className="buildingInfoCard">
            <span>Номер</span>
            <strong>{building.number}</strong>
          </div>
          <div className="buildingInfoCard">
            <span>Лист исходного PDF</span>
            <strong>{building.sourcePage}</strong>
          </div>
          <div className="buildingInfoCard">
            <span>Площадь</span>
            <strong>{building.area}</strong>
          </div>
        </div>

        <div className="buildingPageGrid">
          <div className="buildingVisualCard">
            <p className="eyebrow">Вид здания</p>
            {assets.view ? (
              <button
                className="buildingImageButton"
                onClick={() => openImageViewer(assets.view, `${building.title}. Вид здания`)}
              >
                <img src={assets.view} alt={`${building.title}. Вид здания`} />
              </button>
            ) : (
              <div className="buildingImagePlaceholder">
                <strong>Картинка здания</strong>
                <span>Изображение будет добавлено после обработки листа</span>
              </div>
            )}
            <div className="buildingImageCaption">
              Нажмите на изображение, чтобы открыть его крупно.
            </div>
          </div>

          <div className="buildingDescriptionCard">
            <p className="eyebrow">Описание из ОПЗ</p>
            <h3>Функциональное назначение</h3>
            <p>{details.description}</p>
          </div>
        </div>

        <div className="buildingDataGrid">
          <div className="buildingDataCard buildingPlansCard">
            <div className="cardHeaderLine">
              <p className="eyebrow">Планы и экспликации</p>
              <h3>Поэтажные планы</h3>
            </div>

            <div className="floorImageList">
              {assets.floors.map((floor, index) => (
                <article className="floorImageItem" key={`${building.id}-floor-image-${index}`}>
                  <div className="floorImageHeader">
                    <strong>{floor.title}</strong>
                    {details.floors[index] && <span>{details.floors[index]}</span>}
                  </div>

                  <div className="floorSplitGrid">
                    <div className="floorSplitBlock">
                      <div className="floorSplitTitle">План этажа</div>
                      {floor.plan ? (
                        <button
                          className="buildingImageButton floorImageButton"
                          onClick={() => openImageViewer(floor.plan, `${building.title}. ${floor.title}. План`)}
                        >
                          <img src={floor.plan} alt={`${building.title}. ${floor.title}. План`} />
                        </button>
                      ) : (
                        <div className="imageMissingBox">План не найден</div>
                      )}
                    </div>

                    <div className="floorSplitBlock">
                      <div className="floorSplitTitle">Экспликация</div>
                      {floor.explication ? (
                        <button
                          className="buildingImageButton floorImageButton"
                          onClick={() => openImageViewer(floor.explication, `${building.title}. ${floor.title}. Экспликация`)}
                        >
                          <img src={floor.explication} alt={`${building.title}. ${floor.title}. Экспликация`} />
                        </button>
                      ) : (
                        <div className="imageMissingBox">Экспликация не найдена</div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="buildingDataCard">
            <div className="cardHeaderLine">
              <p className="eyebrow">Экспликация из ОПЗ</p>
              <h3>Основные помещения и зоны</h3>
            </div>

            <div className="explicationList">
              {details.explication.map((item, index) => (
                <div className="explicationItem" key={`${building.id}-exp-${index}`}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }


  function openProjectManagerBuilding(buildingId) {
    setSelectedBuildingId(buildingId);
    setProjectManagerView("buildingDetail");
  }

  function renderProjectManagerHeader(title, subtitle) {
    return (
      <header className="topBar projectManagerTopBar">
        <div>
          <p className="eyebrow">Кабинет руководителя проекта</p>
          <h1>{title}</h1>
          {subtitle && <p className="projectManagerSubtitle">{subtitle}</p>}
        </div>

        <div className="userPanel">
          <div>
            <strong>{currentUser.name}</strong>
            <span>{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
          </div>
          {projectManagerView !== "home" && (
            <button className="secondaryButton" onClick={() => setProjectManagerView("home")}>К 4 разделам</button>
          )}
          <button className="ghostButton" onClick={logout}>Выйти</button>
        </div>
      </header>
    );
  }

  function renderProjectManagerHome() {
    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader(
          "Руководитель проекта",
          "Стартовый экран с четырьмя основными блоками контроля проекта."
        )}

        <section className="projectManagerHero">
          <div>
            <p className="eyebrow">Обзор</p>
            <h2>Выберите раздел для просмотра</h2>
          </div>
          <div className="projectManagerHeroStats">
            <span>{buildingPages.length} зданий</span>
            <span>{scheduleRows.length} задач проектирования</span>
            <span>{projectManagerFinancePlan.length} месяца финансирования</span>
          </div>
        </section>

        <section className="projectManagerTileGrid">
          {projectManagerSections.map((section, index) => (
            <button
              key={section.key}
              type="button"
              className="projectManagerTile"
              onClick={() => setProjectManagerView(section.key)}
            >
              <span className="projectManagerTileNumber">{index + 1}</span>
              <strong>{section.title}</strong>
              <p>{section.description}</p>
              <small>{section.metric}</small>
            </button>
          ))}
        </section>
      </main>
    );
  }

  function renderProjectManagerInfo() {
    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader(
          "Общая информация",
          "Информация по зданиям: описание, площадь и картинки из карточек здания."
        )}

        <section className="projectManagerSectionBlock">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Здания комплекса</p>
              <h2>Общее описание и изображения</h2>
            </div>
            <div className="roleBadge">{buildingPages.length} зданий</div>
          </div>

          <div className="projectManagerBuildingGrid">
            {buildingPages.map((building) => {
              const details = buildingDetails[building.id] || {};
              const assets = buildingAssets[building.id] || {};
              return (
                <article className="projectManagerBuildingCard" key={building.id}>
                  <button
                    type="button"
                    className="projectManagerBuildingImage"
                    onClick={() => openProjectManagerBuilding(building.id)}
                  >
                    {assets.view ? (
                      <img src={assets.view} alt={`${building.title}. Вид здания`} />
                    ) : (
                      <span>Изображение будет добавлено</span>
                    )}
                  </button>
                  <div className="projectManagerBuildingBody">
                    <div className="projectManagerBuildingMeta">
                      <span>Здание {building.number}</span>
                      <span>{building.area}</span>
                    </div>
                    <h3>{building.title}</h3>
                    <p>{details.description || "Описание будет добавлено после уточнения исходных данных."}</p>
                    <button className="smallButton" onClick={() => openProjectManagerBuilding(building.id)}>
                      Открыть карточку
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {imageViewer && (
          <div className="imageViewerOverlay" onClick={closeImageViewer}>
            <div className="imageViewerDialog" onClick={(event) => event.stopPropagation()}>
              <div className="imageViewerHeader">
                <strong>{imageViewer.title}</strong>
                <button onClick={closeImageViewer}>Закрыть</button>
              </div>
              <img src={imageViewer.src} alt={imageViewer.title} />
            </div>
          </div>
        )}
      </main>
    );
  }

  function renderProjectManagerBuildingDetail() {
    const building = buildingPages.find((item) => item.id === selectedBuildingId) || buildingPages[0];
    const details = buildingDetails[building.id] || {
      description: "Описание будет добавлено после уточнения исходных данных.",
      floors: [],
      explication: [],
    };
    const assets = buildingAssets[building.id] || { view: "", floors: [] };

    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader(building.title, "Карточка здания для руководителя проекта.")}

        <section className="contentStack buildingDetailPage">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Страница здания</p>
              <h2>{building.title}</h2>
            </div>
            <button className="secondaryButton" onClick={() => setProjectManagerView("info")}>К списку зданий</button>
          </div>

          <div className="buildingInfoGrid">
            <div className="buildingInfoCard"><span>Номер</span><strong>{building.number}</strong></div>
            <div className="buildingInfoCard"><span>Лист исходного PDF</span><strong>{building.sourcePage}</strong></div>
            <div className="buildingInfoCard"><span>Площадь</span><strong>{building.area}</strong></div>
          </div>

          <div className="buildingPageGrid">
            <div className="buildingVisualCard">
              <p className="eyebrow">Вид здания</p>
              {assets.view ? (
                <button className="buildingImageButton" onClick={() => openImageViewer(assets.view, `${building.title}. Вид здания`)}>
                  <img src={assets.view} alt={`${building.title}. Вид здания`} />
                </button>
              ) : (
                <div className="buildingImagePlaceholder"><strong>Картинка здания</strong><span>Изображение будет добавлено после обработки листа</span></div>
              )}
              <div className="buildingImageCaption">Нажмите на изображение, чтобы открыть его крупно.</div>
            </div>

            <div className="buildingDescriptionCard">
              <p className="eyebrow">Описание</p>
              <h3>Функциональное назначение</h3>
              <p>{details.description}</p>
            </div>
          </div>

          <div className="buildingDataGrid">
            <div className="buildingDataCard buildingPlansCard">
              <div className="cardHeaderLine"><p className="eyebrow">Планы и экспликации</p><h3>Поэтажные планы</h3></div>
              <div className="floorImageList">
                {(assets.floors || []).map((floor, index) => (
                  <article className="floorImageItem" key={`${building.id}-pm-floor-${index}`}>
                    <div className="floorImageHeader"><strong>{floor.title}</strong>{details.floors[index] && <span>{details.floors[index]}</span>}</div>
                    <div className="floorSplitGrid">
                      <div className="floorSplitBlock">
                        <div className="floorSplitTitle">План этажа</div>
                        {floor.plan ? (
                          <button className="buildingImageButton floorImageButton" onClick={() => openImageViewer(floor.plan, `${building.title}. ${floor.title}. План`)}>
                            <img src={floor.plan} alt={`${building.title}. ${floor.title}. План`} />
                          </button>
                        ) : <div className="imageMissingBox">План не найден</div>}
                      </div>
                      <div className="floorSplitBlock">
                        <div className="floorSplitTitle">Экспликация</div>
                        {floor.explication ? (
                          <button className="buildingImageButton floorImageButton" onClick={() => openImageViewer(floor.explication, `${building.title}. ${floor.title}. Экспликация`)}>
                            <img src={floor.explication} alt={`${building.title}. ${floor.title}. Экспликация`} />
                          </button>
                        ) : <div className="imageMissingBox">Экспликация не найдена</div>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="buildingDataCard">
              <div className="cardHeaderLine"><p className="eyebrow">Экспликация</p><h3>Основные помещения и зоны</h3></div>
              <div className="explicationList">
                {(details.explication || []).map((item, index) => (
                  <div className="explicationItem" key={`${building.id}-pm-exp-${index}`}><span>{index + 1}</span><p>{item}</p></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {imageViewer && (
          <div className="imageViewerOverlay" onClick={closeImageViewer}>
            <div className="imageViewerDialog" onClick={(event) => event.stopPropagation()}>
              <div className="imageViewerHeader"><strong>{imageViewer.title}</strong><button onClick={closeImageViewer}>Закрыть</button></div>
              <img src={imageViewer.src} alt={imageViewer.title} />
            </div>
          </div>
        )}
      </main>
    );
  }

  function renderProjectManagerGraphs() {
    const graphOptions = [
      { key: "design", title: "Проектирование", description: "Сводный график проектирования по разделам." },
      { key: "ppt", title: "ППТ", description: "График мероприятий по проекту планировки территории." },
      { key: "rns", title: "РНС", description: "Дорожная карта получения разрешения на строительство." },
    ];
    const rnsBounds = getScheduleBounds(projectManagerRnsItems);

    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader("Графики", "Выберите нужный график: проектирование, ППТ или РНС.")}

        <section className="projectManagerSectionBlock">
          <div className="projectManagerGraphChooser">
            {graphOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={projectManagerGraphType === option.key ? "projectManagerGraphButton active" : "projectManagerGraphButton"}
                onClick={() => setProjectManagerGraphType(option.key)}
              >
                <strong>{option.title}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>

          {projectManagerGraphType === "design" && renderSchedulePage()}
          {projectManagerGraphType === "ppt" && renderCompactPptPage()}
          {projectManagerGraphType === "rns" && (
            <section className="contentStack">
              <div className="sectionHeader">
                <div><p className="eyebrow">График РНС</p><h2>Разрешение на строительство</h2></div>
                <div className="roleBadge">дорожная карта</div>
              </div>
              <div className="scheduleList">
                {projectManagerRnsItems.map((item) => (
                  <article className="scheduleRow" key={item.code}>
                    <div className="scheduleInfo">
                      <strong>{item.code}</strong>
                      <span>{item.title}</span>
                      <small>{formatDate(item.start)} — {formatDate(item.end)}</small>
                    </div>
                    <div className="timelineTrack">
                      <div className="timelineBar" style={getBarStyle(item, rnsBounds)}>
                        <span>{item.progress}%</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </main>
    );
  }

  function renderProjectManagerMeetings() {
    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader("Совещания", "Последние протоколы, актуальная повестка и задачи по ответственным.")}

        <section className="projectManagerMeetingGrid">
          <div className="projectManagerPanel wide">
            <div className="cardHeaderLine"><p className="eyebrow">Протоколы</p><h2>Последние протоколы</h2></div>
            <div className="projectManagerProtocolList">
              {projectManagerMeetings.protocols.map((protocol) => (
                <article className="projectManagerProtocol" key={`${protocol.date}-${protocol.title}`}>
                  <div><strong>{protocol.date}</strong><span>{protocol.status}</span></div>
                  <h3>{protocol.title}</h3>
                  <p>{protocol.summary}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="projectManagerPanel">
            <div className="cardHeaderLine"><p className="eyebrow">Повестка</p><h2>Актуальная повестка</h2></div>
            <ol className="projectManagerAgendaList">
              {projectManagerMeetings.agenda.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>

          <div className="projectManagerPanel wide">
            <div className="cardHeaderLine"><p className="eyebrow">Задачи</p><h2>Кому какие задачи поставлены</h2></div>
            <div className="projectManagerTaskList">
              {projectManagerMeetings.tasks.map((task) => (
                <article className="projectManagerTask" key={`${task.owner}-${task.task}`}>
                  <strong>{task.owner}</strong>
                  <p>{task.task}</p>
                  <span>{task.due}</span>
                  <small>{task.status}</small>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  function renderProjectManagerFinance() {
    const maxAmount = Math.max(...projectManagerFinancePlan.map((item) => item.amount), 1);
    const total = projectManagerFinancePlan.reduce((sum, item) => sum + item.amount, 0);

    return (
      <main className="appShell projectManagerShell">
        {renderProjectManagerHeader("Финансирование", "График потребности в финансах на ближайшие 3 месяца.")}

        <section className="projectManagerSectionBlock">
          <div className="sectionHeader">
            <div><p className="eyebrow">Финансы</p><h2>Потребность на 3 месяца</h2></div>
            <div className="roleBadge">Итого: {total} млн ₽</div>
          </div>

          <div className="projectManagerFinanceChart">
            {projectManagerFinancePlan.map((item) => (
              <article className="projectManagerFinanceBar" key={item.month}>
                <div className="projectManagerFinanceBarTop"><strong>{item.month}</strong><span>{item.label}</span></div>
                <div className="projectManagerFinanceTrack"><div style={{ width: `${Math.round((item.amount / maxAmount) * 100)}%` }} /></div>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  function renderProjectManagerWorkspace() {
    if (!hasAccess(currentUser, "project_manager_dashboard")) {
      return renderAccessDenied("Кабинет руководителя проекта");
    }
    if (projectManagerView === "info") return renderProjectManagerInfo();
    if (projectManagerView === "buildingDetail") return renderProjectManagerBuildingDetail();
    if (projectManagerView === "graphs") return renderProjectManagerGraphs();
    if (projectManagerView === "meetings") return renderProjectManagerMeetings();
    if (projectManagerView === "finance") return renderProjectManagerFinance();
    return renderProjectManagerHome();
  }

  function renderAccountManagement() {
    if (!hasAccess(currentUser, "accounts")) {
      return renderAccessDenied("Управление учетными записями");
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
                    setAccountForm({
                      ...accountForm,
                      role: event.target.value,
                      allowed_elements: ROLE_DEFAULT_ACCESS[event.target.value] || ["schedule"],
                    })
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="accessEditor">
                <strong>Доступные элементы</strong>
                {ACCESS_ELEMENTS.map((element) => (
                  <label className="accessCheckbox" key={element.key}>
                    <input
                      type="checkbox"
                      checked={normalizeAccessElements(accountForm.allowed_elements, accountForm.role).includes(element.key)}
                      onChange={() => toggleFormAccess(element.key)}
                    />
                    {element.label}
                  </label>
                ))}
              </div>

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

                  <div className="accountAccessList">
                    {ACCESS_ELEMENTS.map((element) => (
                      <label className="accessCheckbox" key={element.key}>
                        <input
                          type="checkbox"
                          checked={normalizeAccessElements(account.allowed_elements, account.role).includes(element.key)}
                          disabled={account.role === "admin"}
                          onChange={() => toggleAccountAccess(account, element.key)}
                        />
                        {element.label}
                      </label>
                    ))}
                  </div>

                  <div className="accountControls">
                    <select
                      value={normalizeAccountRole(account.role)}
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

                    <button
                      className="deleteButton"
                      onClick={() => deleteAccount(account)}
                      disabled={currentUser?.id === account.id}
                      title={
                        currentUser?.id === account.id
                          ? "Нельзя удалить текущего пользователя"
                          : "Удалить учетную запись"
                      }
                    >
                      Удалить
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

  if (currentUser.role === "architect" && !interfaceChoice) {
    return renderArchitectInterfaceChoice();
  }

  if (currentUser.role === "architect" && interfaceChoice === "specialized") {
    return renderArchitectWorkspace();
  }

  if (currentUser.role === "project_manager") {
    return renderProjectManagerWorkspace();
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
        {hasAccess(currentUser, "schedule") && (
          <button
            className={activeTab === "schedule" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("schedule")}
          >
            График проектирования
          </button>
        )}

        {hasAccess(currentUser, "compact") && (
          <button
            className={activeTab === "compact" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("compact")}
          >
            График ППТ
          </button>
        )}

        {hasAccess(currentUser, "ppt") && (
          <button
            className={activeTab === "ppt" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("ppt")}
          >
            Расширенный график ППТ
          </button>
        )}

        {hasAccess(currentUser, "buildings") && (
          <button
            className={
              activeTab === "buildings" || activeTab === "buildingDetail"
                ? "tabButton active"
                : "tabButton"
            }
            onClick={() => setActiveTab("buildings")}
          >
            Здания
          </button>
        )}

        {hasAccess(currentUser, "accounts") && (
          <button
            className={activeTab === "accounts" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("accounts")}
          >
            Администрирование
          </button>
        )}
      </nav>

      {activeTab === "schedule" && renderSchedulePage()}
      {activeTab === "compact" && renderCompactPptPage()}
      {activeTab === "ppt" && renderPptPage()}
      {activeTab === "buildings" && renderBuildingsPage()}
      {activeTab === "buildingDetail" && renderBuildingDetailPage()}
      {activeTab === "editItem" && renderEditItemPage()}
      {activeTab === "accounts" && renderAccountManagement()}

      {imageViewer && (
        <div className="imageViewerOverlay" onClick={closeImageViewer}>
          <div className="imageViewerDialog" onClick={(event) => event.stopPropagation()}>
            <div className="imageViewerHeader">
              <strong>{imageViewer.title}</strong>
              <button onClick={closeImageViewer}>Закрыть</button>
            </div>
            <img src={imageViewer.src} alt={imageViewer.title} />
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
