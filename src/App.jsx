import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseReady } from "./supabaseClient";
import JSZip from "jszip";
import "./App.css";

const ROLE_LABELS = {
  admin: "Админ",
  architect: "Архитектор",
  designer: "Проектанты",
  customer_service: "Служба заказчика",
  external: "Сторонние люди",
  norm_controller: "Нормаконтролер",
  employee: "Проектанты",
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Админ" },
  { value: "architect", label: "Архитектор" },
  { value: "designer", label: "Проектанты" },
  { value: "customer_service", label: "Служба заказчика" },
  { value: "external", label: "Сторонние люди" },
  { value: "norm_controller", label: "Нормаконтролер" },
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

const PROJECT_FILE_TYPES = new Set([
  "project_file",
  "project",
  "project_files",
  "file_project",
  "design_file",
  "project_document",
  "файл_проекта",
  "проектный_файл",
  "проект",
]);


const APP_VERSION = "N_337";
const APP_DEPLOY_NAME = "N_338_project_site_archive_progress_async";
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
  const rawValue = value && typeof value === "object"
    ? (value.document_type || value.document_group || value.type || "")
    : value;
  const raw = String(rawValue || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  if (!raw) return "";
  if (raw === "technical_task" || raw === "technical_task_file") return "tz";
  if (raw === "answer") return "remark";
  if (PROJECT_FILE_TYPES.has(raw)) return "project_file";
  if (raw.includes("проект") && raw.includes("файл")) return "project_file";
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
  return file?.yandex_disk_path || file?.yandex_path || file?.storage_path || "";
}

function getArchitectFileDate(file) {
  return file?.registered_at || file?.modified_at || file?.created_at || "";
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

function parseMaybeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isTruthyFlag(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "да", "готов", "ready"].includes(text);
}

function isNormControlCompleted(section) {
  if (!section) return false;
  if (section.norm_control_completed === true) return true;
  const text = String(section.norm_control_completed || section.norm_control_status || "").trim().toLowerCase();
  return ["true", "1", "yes", "completed", "complete", "done", "завершен", "завершено", "готово"].includes(text);
}

function isSectionReadyForNormControl(section) {
  return Boolean(section && section.active !== false && isTruthyFlag(section.norm_control_ready) && !isNormControlCompleted(section));
}

function normalizeNormControlFiles(value) {
  return parseMaybeJsonArray(value)
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const name = String(item.name || item.file_name || item.original_name || item.stored_filename || "").trim();
      const publishedPath = String(item.published_yandex_path || item.norm_control_published_yandex_path || "").trim();
      const yandexPath = String(item.yandex_disk_path || item.yandex_path || item.storage_path || "").trim();
      const localPath = String(item.local_file_path || item.path || "").trim();
      const displayPath = publishedPath || yandexPath;
      return {
        ...item,
        name: name || displayPath.split("/").pop() || localPath.split(/[\\/]/).pop() || `file_${index + 1}`,
        kind: String(item.kind || item.document_group || item.document_type || "файл").trim(),
        yandex_disk_path: displayPath,
        yandex_path: displayPath,
        published_yandex_path: publishedPath,
        norm_control_published_yandex_path: publishedPath,
        local_file_path: localPath,
      };
    });
}

function getNormProjectKey(section) {
  return [
    section?.project_key || "opr_donetsk",
    section?.building_key || `${section?.building_gp_no || ""} — ${section?.building_name || ""}`,
  ].join("::");
}

function getNormProjectTitle(section) {
  return section?.building_key || [section?.building_gp_no, section?.building_name].filter(Boolean).join(" — ") || section?.project_key || "Проект";
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

function makeNormControlResultDiskPath(section, fileName) {
  const baseFolder = toYandexDiskPath(section?.common_storage_folder || section?.project_files_yandex_path || "");
  const uploadFolder = baseFolder
    ? joinDiskPath(baseFolder, "нормаконтроль")
    : joinDiskPath(YANDEX_DISK_ROOT, safeDiskPart(getNormProjectTitle(section)), normalizeStage(section?.stage || "П"), safeDiskPart(section?.section_code || "section"), "нормаконтроль");
  return joinDiskPath(uploadFolder, safeUploadFileName(fileName));
}

function isNormControlResultFileCard(file, section) {
  if (!file || !section) return false;
  if (file.active === false) return false;
  const fileSectionId = String(file.site_section_id || file.section_id || "");
  const sectionId = String(section.id || section.section_id || "");
  if (!fileSectionId || !sectionId || fileSectionId !== sectionId) return false;
  const group = normalizeDocumentType(file.document_group || file.document_type || "");
  return ["norm_control_result", "norm_control_return", "norm_control_checked"].includes(group);
}

const ACCESS_ELEMENTS = [
  { key: "schedule", label: "График проектирования" },
  { key: "compact", label: "График ППТ" },
  { key: "ppt", label: "Расширенный график ППТ" },
  { key: "buildings", label: "Страницы зданий" },
  { key: "accounts", label: "Управление учетными записями" },
  { key: "norm_control", label: "Нормаконтроль" },
];

const ROLE_DEFAULT_ACCESS = {
  admin: ["schedule", "compact", "ppt", "buildings", "accounts", "norm_control"],
  architect: ["schedule", "compact", "ppt", "buildings"],
  designer: ["schedule", "compact", "ppt", "buildings"],
  customer_service: ["schedule", "compact", "ppt", "buildings"],
  external: ["schedule", "compact", "buildings"],
  norm_controller: ["norm_control"],
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
  return cleaned.length ? cleaned : fallback;
}

function hasAccess(user, elementKey) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return normalizeAccessElements(user.allowed_elements, user.role).includes(elementKey);
}

function normalizeAccountRole(role) {
  if (role === "employee") return "designer";
  if (role === "architect" || role === "arhitect" || role === "архитектор") return "architect";
  if (role === "projectant" || role === "proektant") return "designer";
  if (role === "customer" || role === "client" || role === "zakazchik") return "customer_service";
  if (role === "other" || role === "guest" || role === "external_people") return "external";
  if (["norm_controller", "normcontrol", "norm_control", "normal_controller", "нормаконтролер", "нормоконтролер"].includes(role)) return "norm_controller";
  if (["admin", "architect", "designer", "customer_service", "external", "norm_controller"].includes(role)) return role;
  return "designer";
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
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
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
  const [archiveProgressState, setArchiveProgressState] = useState({});
  const [selectedNormProjectKey, setSelectedNormProjectKey] = useState("");
  const [selectedNormSectionId, setSelectedNormSectionId] = useState("");
  const [normResultFiles, setNormResultFiles] = useState([]);
  const [normResultUploading, setNormResultUploading] = useState(false);
  const [normResultUploadProgress, setNormResultUploadProgress] = useState({ percent: 0, message: "" });
  const [normResultDragActive, setNormResultDragActive] = useState(false);
  const [normDiagnostics, setNormDiagnostics] = useState({ loading: false, log: "" });
  const siteSectionsTable = import.meta.env.VITE_SITE_SECTIONS_TABLE || "opr_site_sections";
  const siteFilesTable = import.meta.env.VITE_SITE_FILES_TABLE || "opr_site_section_files";
  const siteIncomingTable = import.meta.env.VITE_SITE_INCOMING_TABLE || "opr_site_incoming_files";
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


  const normReadySections = useMemo(() => {
    return siteSections
      .filter(isSectionReadyForNormControl)
      .sort((a, b) => {
        const projectCompare = getNormProjectTitle(a).localeCompare(getNormProjectTitle(b), "ru");
        if (projectCompare !== 0) return projectCompare;
        const stageOrder = { "П": 1, "Р": 2 };
        const stageCompare = (stageOrder[normalizeStage(a.stage)] || 99) - (stageOrder[normalizeStage(b.stage)] || 99);
        if (stageCompare !== 0) return stageCompare;
        return String(a.section_code || "").localeCompare(String(b.section_code || ""), "ru");
      });
  }, [siteSections]);

  const normProjects = useMemo(() => {
    const map = new Map();
    normReadySections.forEach((section) => {
      const key = getNormProjectKey(section);
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: getNormProjectTitle(section),
          projectKey: section.project_key || "opr_donetsk",
          gpNo: section.building_gp_no || "",
          name: section.building_name || "",
          sections: [],
        });
      }
      map.get(key).sections.push(section);
    });
    return Array.from(map.values()).sort((a, b) => String(a.title).localeCompare(String(b.title), "ru"));
  }, [normReadySections]);

  const selectedNormProjectSections = useMemo(() => {
    if (!selectedNormProjectKey) return [];
    return normReadySections.filter((section) => getNormProjectKey(section) === selectedNormProjectKey);
  }, [normReadySections, selectedNormProjectKey]);

  const selectedNormSection = useMemo(() => {
    return selectedNormProjectSections.find((section) => section.id === selectedNormSectionId) || selectedNormProjectSections[0] || null;
  }, [selectedNormProjectSections, selectedNormSectionId]);

  const selectedNormResultCards = useMemo(() => {
    if (!selectedNormSection) return [];
    return siteFiles
      .filter((file) => isNormControlResultFileCard(file, selectedNormSection))
      .sort((a, b) => String(b.registered_at || b.created_at || "").localeCompare(String(a.registered_at || a.created_at || "")));
  }, [siteFiles, selectedNormSection]);

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
    const sectionId = String(section.id || "").trim();
    return siteFiles.some((file) => {
      if (file.active === false) return false;
      const fileSectionId = String(file.site_section_id || file.section_id || "").trim();
      if (fileSectionId !== sectionId) return false;
      if (getArchitectFileCategory(file) !== "project_file") return false;
      return Boolean(String(file.file_name || file.original_name || file.file_url || file.download_url || file.public_url || file.web_url || file.href || getArchitectFileYandexPath(file) || "").trim());
    });
  }

  function normalizeFileNameForMatch(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .split("/")
      .pop();
  }

  function getNormControlFileCategory(file) {
    const normalized = normalizeDocumentType(file?.document_type || file?.document_group || file?.source_kind || file?.kind || "");
    if (normalized) return normalized;
    const text = [file?.kind, file?.name, file?.file_name, file?.original_name].filter(Boolean).join(" ").toLowerCase();
    if (text.includes("тз") || text.includes("technical task")) return "tz";
    if (text.includes("исход")) return "source";
    if (text.includes("договор")) return "contract";
    if (text.includes("замеч")) return "remark";
    if (text.includes("проект") || text.includes("pdf")) return "project_file";
    return "";
  }

  function findSiteFileCardForNormControlFile(file, section) {
    const sectionId = String(section?.id || file?.section_id || file?.site_section_id || "").trim();
    if (!sectionId) return null;

    const requestedName = normalizeFileNameForMatch(file?.name || file?.file_name || file?.original_name || file?.stored_filename || file?.path || file?.local_file_path);
    const requestedType = getNormControlFileCategory(file);
    const requestedCardId = String(file?.document_card_id || "").trim();

    const candidates = siteFiles
      .filter((item) => {
        if (!item || item.active === false) return false;
        const itemSectionId = String(item.section_id || item.site_section_id || "").trim();
        if (itemSectionId !== sectionId) return false;
        return Boolean(getArchitectFileYandexPath(item));
      })
      .map((item) => {
        let score = 0;
        const itemId = String(item.id || "").trim();
        const itemName = normalizeFileNameForMatch(item.file_name || item.original_name || item.stored_filename || getArchitectFileYandexPath(item));
        const itemType = getArchitectFileCategory(item);
        if (requestedCardId && itemId && requestedCardId === itemId) score += 200;
        if (requestedName && itemName && requestedName === itemName) score += 100;
        if (requestedName && itemName && (requestedName.includes(itemName) || itemName.includes(requestedName))) score += 40;
        if (requestedType && itemType && requestedType === itemType) score += 25;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.item || null;
  }

  function resolveNormControlFileYandexPath(file, section = selectedNormSection) {
    // For norm-control the package-specific published path has priority.
    // Ordinary file cards can still keep /Папка ГИПа/... or other internal paths,
    // but the norm-controller must open the copy prepared under
    // /Внутренняя технологии/Нормаконтролер/... when that path exists.
    const publishedPath = String(file?.published_yandex_path || file?.norm_control_published_yandex_path || "").trim();
    if (publishedPath) return toYandexDiskPath(publishedPath);

    const rawPath = String(file?.yandex_disk_path || file?.yandex_path || file?.storage_path || "").trim();
    if (rawPath) return toYandexDiskPath(rawPath);

    const cardId = String(file?.document_card_id || "").trim();
    if (cardId) {
      const exactCard = siteFiles.find((item) => String(item.id || "") === cardId);
      const exactPath = getArchitectFileYandexPath(exactCard);
      if (exactPath) return toYandexDiskPath(exactPath);
    }

    const linkedCard = findSiteFileCardForNormControlFile(file, section);
    const linkedPath = getArchitectFileYandexPath(linkedCard);
    if (linkedPath) return toYandexDiskPath(linkedPath);

    const localPath = String(file?.local_file_path || file?.path || "").trim();
    return localPath ? toYandexDiskPath(localPath) : "";
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
    if (currentUser?.role === "norm_controller" || activeTab === "norm_control") {
      loadSiteDirectory();
    }
  }, [currentUser, interfaceChoice, activeTab]);

  useEffect(() => {
    if (!selectedSiteBuildingKey && siteBuildings.length > 0) {
      setSelectedSiteBuildingKey(siteBuildings[0].key);
    }
  }, [siteBuildings, selectedSiteBuildingKey]);

  useEffect(() => {
    if (!selectedNormProjectKey && normProjects.length > 0) {
      setSelectedNormProjectKey(normProjects[0].key);
      return;
    }
    if (selectedNormProjectKey && !normProjects.some((project) => project.key === selectedNormProjectKey)) {
      setSelectedNormProjectKey(normProjects[0]?.key || "");
    }
  }, [normProjects, selectedNormProjectKey]);

  useEffect(() => {
    if (selectedNormProjectSections.length > 0) {
      const exists = selectedNormProjectSections.some((section) => section.id === selectedNormSectionId);
      if (!exists) {
        setSelectedNormSectionId(selectedNormProjectSections[0].id);
      }
    } else {
      setSelectedNormSectionId("");
    }
  }, [selectedNormProjectSections, selectedNormSectionId]);

  useEffect(() => {
    setNormResultFiles([]);
    setNormResultUploadProgress({ percent: 0, message: "" });
    setNormResultDragActive(false);
  }, [selectedNormSectionId]);

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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function normalizeArchiveProgress(job) {
    const progress = Math.max(0, Math.min(100, Number(job?.progress_percent || 0)));
    const filesDone = Number(job?.files_done || 0);
    const filesTotal = Number(job?.files_total || 0);
    const message = job?.message || job?.stage || "Готовлю архив";
    return {
      state: job?.state || "running",
      stage: job?.stage || "",
      message,
      progress,
      filesDone,
      filesTotal,
      currentFile: job?.current_file || "",
      sourceBytes: Number(job?.source_bytes || 0),
      archiveBytes: Number(job?.archive_bytes || 0),
    };
  }

  async function startAndWaitNormArchiveJob(payloadFiles, archiveName, archiveKey, dryRun = false) {
    const start = await invokeYandexReadonly({
      action: "archive_start",
      path: "/",
      archive_name: `${archiveName}.zip`,
      dry_run: Boolean(dryRun),
      files: payloadFiles,
    });
    const jobId = start?.job_id || start?.job?.job_id || start?.job?.id;
    if (!jobId) throw new Error("GIP API не вернул номер задачи архива.");

    setArchiveProgressState((prev) => ({
      ...prev,
      [archiveKey]: normalizeArchiveProgress(start.job || { state: "queued", message: "Задача поставлена в очередь", progress_percent: 0 }),
    }));

    const startedAt = Date.now();
    const timeoutMs = 30 * 60 * 1000;
    while (true) {
      await sleep(1500);
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("Превышено время ожидания формирования архива: 30 минут.");
      }
      const status = await invokeYandexReadonly({ action: "archive_status", path: "/", job_id: jobId });
      setArchiveProgressState((prev) => ({ ...prev, [archiveKey]: normalizeArchiveProgress(status) }));
      if (status?.state === "success") return status;
      if (status?.state === "error") throw new Error(status?.error || status?.message || "Ошибка фоновой задачи архива.");
    }
  }

  async function uploadIncomingFileInChunks(file, options) {
    const chunkSize = Math.max(256 * 1024, Number(INCOMING_UPLOAD_CHUNK_BYTES || 2 * 1024 * 1024));
    const totalChunks = Math.ceil(file.size / chunkSize);
    const noticePrefix = options.noticePrefix || "Загружаю файл";

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunkBuffer = await file.slice(start, end).arrayBuffer();
      const chunkBase64 = arrayBufferToBase64(chunkBuffer);
      if (typeof options.onChunkProgress === "function") {
        options.onChunkProgress({ chunkIndex: index, totalChunks, bytesSent: end, totalBytes: file.size });
      } else {
        setIncomingUploadNotice(`${noticePrefix}: часть ${index + 1} из ${totalChunks}.`);
      }
      await invokeGipJson("/incoming/upload-chunk", {
        upload_id: options.uploadId,
        chunk_index: index,
        total_chunks: totalChunks,
        chunk_base64: chunkBase64,
      });
    }

    if (typeof options.onFinishStart === "function") {
      options.onFinishStart({ totalChunks, totalBytes: file.size });
    } else {
      setIncomingUploadNotice(options.finishNotice || "Завершаю загрузку файла и создаю заявку для ГИПа.");
    }
    return invokeGipJson("/incoming/finish-upload", {
      upload_id: options.uploadId,
      total_chunks: totalChunks,
      disk_path: options.diskPath,
      content_type: options.contentType || "application/octet-stream",
      file_size: file.size,
      sha256: options.sha256 || "",
      incoming_table: options.incomingTable,
      incoming_payload: options.payload,
      overwrite: Boolean(options.overwrite),
    });
  }

  async function fetchYandexFileBlobDetailed(path) {
    const startedAt = performance?.now ? performance.now() : Date.now();
    const response = await fetch(getGipApiUrl("/yandex"), {
      method: "POST",
      headers: getGipApiHeaders(),
      body: JSON.stringify({ action: "content", path }),
    });

    const info = {
      ok: response.ok,
      status: response.status,
      status_text: response.statusText || "",
      content_type: response.headers.get("Content-Type") || "",
      content_length_header: response.headers.get("Content-Length") || "",
      elapsed_ms: null,
      blob_size: null,
    };

    if (!response.ok) {
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      const message = data?.error || data?.message || data?.description || data?.raw || `GIP API HTTP ${response.status}`;
      const error = new Error(String(message));
      error.diagnostic = { ...info, error: String(message), response_keys: data ? Object.keys(data) : [] };
      throw error;
    }

    const blob = await response.blob();
    const endedAt = performance?.now ? performance.now() : Date.now();
    info.elapsed_ms = Math.round(endedAt - startedAt);
    info.blob_size = blob.size;
    return { blob, info };
  }

  async function fetchYandexFileBlob(path) {
    const detailed = await fetchYandexFileBlobDetailed(path);
    return detailed.blob;
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

  function getYandexParentPath(path) {
    const normalized = toYandexDiskPath(path || "");
    if (!normalized || normalized === "/") return "/";
    const parts = normalized.split("/").filter(Boolean);
    parts.pop();
    return `/${parts.join("/")}`;
  }

  function getYandexFileNameFromPath(path) {
    const normalized = toYandexDiskPath(path || "");
    return normalized.split("/").filter(Boolean).pop() || "";
  }

  function getNormDiagnosticPathVariants(path) {
    const normalized = toYandexDiskPath(path || "");
    const variants = [];
    const add = (value, note) => {
      const normalizedValue = toYandexDiskPath(value || "");
      if (normalizedValue && !variants.some((item) => item.path === normalizedValue)) {
        variants.push({ path: normalizedValue, note });
      }
    };
    add(normalized, "как указано в карточке");
    if (normalized.includes("/Внутренняя технологии/")) {
      add(normalized.replace("/Внутренняя технологии/", "/Внутренняя Технологии/"), "вариант с заглавной буквой Т");
    }
    if (normalized.includes("/Внутренняя Технологии/")) {
      add(normalized.replace("/Внутренняя Технологии/", "/Внутренняя технологии/"), "вариант со строчной буквой т");
    }
    return variants;
  }

  function summarizeYandexItems(items, expectedName) {
    const expected = String(expectedName || "").trim().toLowerCase();
    return (items || []).slice(0, 80).map((item) => {
      const name = String(item?.name || item?.file_name || "");
      return {
        name,
        type: item?.type || "",
        path: item?.path || item?.resource_id || "",
        size: item?.size || item?.size_bytes || null,
        name_matches_requested_file: Boolean(expected && name.trim().toLowerCase() === expected),
      };
    });
  }

  function buildNormFileDiagnosticsIntro(file, section, diskPath, linkedCard) {
    return {
      app_version: APP_VERSION,
      checked_at: new Date().toISOString(),
      section: {
        id: section?.id || "",
        stage: normalizeStage(section?.stage),
        section_code: section?.section_code || "",
        section_title: section?.section_title || "",
        cipher: section?.cipher || "",
      },
      file_from_norm_control_files: {
        name: file?.name || "",
        file_name: file?.file_name || "",
        kind: file?.kind || "",
        document_type: file?.document_type || "",
        document_group: file?.document_group || "",
        source_path: file?.source_path || file?.local_file_path || file?.path || "",
        published_yandex_path: file?.published_yandex_path || "",
        norm_control_published_yandex_path: file?.norm_control_published_yandex_path || "",
        yandex_disk_path: file?.yandex_disk_path || "",
        yandex_path: file?.yandex_path || "",
        storage_path: file?.storage_path || "",
        document_card_id: file?.document_card_id || "",
      },
      resolved_path_used_by_site: diskPath || "",
      resolved_parent_path: getYandexParentPath(diskPath),
      resolved_file_name: getYandexFileNameFromPath(diskPath),
      matched_site_file_card: linkedCard ? {
        id: linkedCard.id || "",
        file_name: linkedCard.file_name || "",
        original_name: linkedCard.original_name || "",
        document_type: linkedCard.document_type || "",
        document_group: linkedCard.document_group || "",
        storage_path: linkedCard.storage_path || "",
        yandex_disk_path: linkedCard.yandex_disk_path || "",
        yandex_path: linkedCard.yandex_path || "",
        active: linkedCard.active,
        status: linkedCard.status || "",
      } : null,
    };
  }

  async function diagnoseNormControlFile(file, section = selectedNormSection) {
    const diskPath = resolveNormControlFileYandexPath(file, section);
    const linkedCard = findSiteFileCardForNormControlFile(file, section);
    const log = {
      summary: "Диагностика скачивания файла нормоконтроля. Временные ссылки скачивания в лог не выводятся.",
      input: buildNormFileDiagnosticsIntro(file, section, diskPath, linkedCard),
      tests: [],
    };

    setNormDiagnostics({ loading: true, log: "Выполняется диагностика..." });
    setSiteDirectoryError("");

    if (!diskPath) {
      log.tests.push({ step: "resolve_path", ok: false, error: "Сайт не смог вычислить путь для файла." });
      setNormDiagnostics({ loading: false, log: JSON.stringify(log, null, 2) });
      return;
    }

    const variants = getNormDiagnosticPathVariants(diskPath);
    for (const variant of variants) {
      const parentPath = getYandexParentPath(variant.path);
      const fileName = getYandexFileNameFromPath(variant.path);
      const entry = {
        step: "check_variant",
        note: variant.note,
        path: variant.path,
        parent_path: parentPath,
        file_name: fileName,
        list_parent: null,
        download_link_check: null,
      };

      try {
        const listData = await invokeYandexReadonly({ action: "list", path: parentPath });
        const items = Array.isArray(listData?.items) ? listData.items : [];
        entry.list_parent = {
          ok: true,
          returned_path: listData?.path || parentPath,
          items_count: items.length,
          items: summarizeYandexItems(items, fileName),
        };
      } catch (error) {
        entry.list_parent = { ok: false, error: error?.message || String(error) };
      }

      try {
        const downloadData = await invokeYandexReadonly({ action: "download", path: variant.path });
        entry.download_link_check = {
          ok: Boolean(downloadData?.href),
          href_received: Boolean(downloadData?.href),
          response_keys: downloadData ? Object.keys(downloadData).filter((key) => key !== "href") : [],
        };
      } catch (error) {
        entry.download_link_check = { ok: false, error: error?.message || String(error) };
      }

      log.tests.push(entry);
    }

    const successful = log.tests.find((item) => item.download_link_check?.ok);
    log.conclusion = successful
      ? `Рабочий путь найден: ${successful.path}`
      : "Рабочий путь не найден. Сравните path, parent_path и список items: обычно причина в точном имени папки/файла, регистре букв или символах в пути.";

    setNormDiagnostics({ loading: false, log: JSON.stringify(log, null, 2) });
  }

  async function openYandexDiskFile(path) {
    if (!path) return;
    if (!isSupabaseReady || !supabase) {
      setSiteDirectoryError("GIP API не подключён. Невозможно получить ссылку на скачивание.");
      return;
    }

    try {
      const data = await invokeYandexReadonly({ action: "download", path });
      if (!data?.href) throw new Error("Яндекс.Диск не вернул ссылку на скачивание.");

      const resolvedPath = String(data.resolved_path || "").trim();
      if (data.path_was_resolved && resolvedPath && resolvedPath !== path) {
        setNotice(`Путь найден с уточнением регистра: ${resolvedPath}`);
      }

      window.open(data.href, "_blank", "noopener,noreferrer");
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
    } catch (error) {
      setSiteDirectoryError(`Ошибка скачивания архива: ${error.message}`);
    } finally {
      setArchiveDownloadState((prev) => ({ ...prev, [archiveKey]: false }));
    }
  }

  async function diagnoseNormControlArchive(section) {
    const log = {
      summary: "Диагностика общего архива нормоконтроля. Временные ссылки скачивания и содержимое файлов в лог не выводятся.",
      app_version: APP_VERSION,
      checked_at: new Date().toISOString(),
      section: section ? {
        id: section.id || "",
        stage: normalizeStage(section.stage),
        section_code: section.section_code || "",
        section_title: section.section_title || "",
        cipher: section.cipher || "",
      } : null,
      input: {
        source_files_count: 0,
        downloadable_files_count: 0,
        archive_name: "",
      },
      files: [],
      zip_generate: null,
      server_archive_check: null,
      conclusion: "",
    };

    setNormDiagnostics({ loading: true, log: "Выполняется диагностика общего архива..." });
    setSiteDirectoryError("");
    setNotice("");

    try {
      if (!section) {
        log.conclusion = "Раздел не выбран.";
        setNormDiagnostics({ loading: false, log: JSON.stringify(log, null, 2) });
        return;
      }

      const sourceFiles = normalizeNormControlFiles(section.norm_control_files);
      const downloadableFiles = sourceFiles
        .map((file) => ({ ...file, resolved_yandex_path: resolveNormControlFileYandexPath(file, section) }))
        .filter((file) => file.resolved_yandex_path);

      const archiveName = sanitizeZipPart([
        section.building_gp_no || "GP",
        normalizeStage(section.stage || "П"),
        section.section_code || "section",
        "Нормаконтроль",
      ].filter(Boolean).join("_"));

      log.input.source_files_count = sourceFiles.length;
      log.input.downloadable_files_count = downloadableFiles.length;
      log.input.archive_name = `${archiveName}.zip`;

      if (!downloadableFiles.length) {
        log.conclusion = "Нет файлов с вычисленным путем для архива.";
        setNormDiagnostics({ loading: false, log: JSON.stringify(log, null, 2) });
        return;
      }

      const zip = new JSZip();
      const usedNames = new Set();
      let addedCount = 0;

      for (let index = 0; index < downloadableFiles.length; index += 1) {
        const file = downloadableFiles[index];
        const requestedPath = String(file.resolved_yandex_path || "");
        const zipName = makeUniqueZipName(usedNames, file.name || requestedPath.split("/").pop() || "file");
        const entry = {
          index: index + 1,
          name: file.name || "",
          file_name: file.file_name || "",
          kind: file.kind || "",
          document_type: file.document_type || "",
          document_group: file.document_group || "",
          source_path: file.source_path || file.local_file_path || file.path || "",
          requested_path: requestedPath,
          zip_name: zipName,
          parent_path: getYandexParentPath(requestedPath),
          download_link_check: null,
          content_fetch_check: null,
          zip_add_check: null,
        };

        try {
          const downloadData = await invokeYandexReadonly({ action: "download", path: requestedPath });
          entry.download_link_check = {
            ok: Boolean(downloadData?.href),
            href_received: Boolean(downloadData?.href),
            resolved_path: downloadData?.resolved_path || requestedPath,
            path_was_resolved: Boolean(downloadData?.path_was_resolved),
            response_keys: downloadData ? Object.keys(downloadData).filter((key) => key !== "href") : [],
          };
        } catch (error) {
          entry.download_link_check = { ok: false, error: error?.message || String(error) };
        }

        try {
          const detailed = await fetchYandexFileBlobDetailed(requestedPath);
          entry.content_fetch_check = detailed.info;
          zip.file(zipName, detailed.blob);
          entry.zip_add_check = { ok: true };
          addedCount += 1;
        } catch (error) {
          entry.content_fetch_check = error?.diagnostic || { ok: false, error: error?.message || String(error) };
          entry.zip_add_check = { ok: false, skipped: true };
        }

        log.files.push(entry);
      }

      if (addedCount > 0) {
        try {
          const startedAt = performance?.now ? performance.now() : Date.now();
          const archiveBlob = await zip.generateAsync({ type: "blob" });
          const endedAt = performance?.now ? performance.now() : Date.now();
          log.zip_generate = {
            ok: true,
            added_files_count: addedCount,
            archive_blob_size: archiveBlob.size,
            elapsed_ms: Math.round(endedAt - startedAt),
          };
        } catch (error) {
          log.zip_generate = { ok: false, error: error?.message || String(error), added_files_count: addedCount };
        }
      } else {
        log.zip_generate = { ok: false, error: "В ZIP не добавлен ни один файл.", added_files_count: 0 };
      }

      try {
        const serverPayloadFiles = downloadableFiles.map((file) => ({
          path: file.resolved_yandex_path,
          name: file.name || file.file_name || String(file.resolved_yandex_path).split("/").pop() || "file",
        }));
        const serverArchive = await startAndWaitNormArchiveJob(
          serverPayloadFiles,
          archiveName,
          `diag:${section.id || "section"}`,
          true
        );
        log.server_archive_check = {
          ok: true,
          dry_run: Boolean(serverArchive?.dry_run),
          file_count: serverArchive?.file_count || 0,
          source_bytes: serverArchive?.source_bytes || 0,
          archive_bytes: serverArchive?.archive_bytes || 0,
          files: Array.isArray(serverArchive?.files) ? serverArchive.files.map((item) => ({
            index: item.index,
            name: item.name,
            requested_path: item.requested_path,
            resolved_path: item.resolved_path,
            path_was_resolved: Boolean(item.path_was_resolved),
            bytes: item.bytes,
          })) : [],
        };
      } catch (error) {
        log.server_archive_check = { ok: false, error: error?.message || String(error) };
      }

      const linkErrors = log.files.filter((item) => !item.download_link_check?.ok);
      const contentErrors = log.files.filter((item) => !item.content_fetch_check?.ok);
      if (log.server_archive_check?.ok && contentErrors.length) {
        log.conclusion = `Старый браузерный способ не смог получить содержимое ${contentErrors.length} файла(ов), первый: ${contentErrors[0].name || contentErrors[0].requested_path}. Новый серверный способ GIP API собрал архив в dry-run: ${log.server_archive_check.archive_bytes} байт. Обычная кнопка архива в N_338 использует фоновый серверный способ.`;
      } else if (!log.server_archive_check?.ok) {
        log.conclusion = `Новый серверный способ GIP API не смог собрать архив: ${log.server_archive_check?.error || "ошибка server archive"}.`;
      } else if (contentErrors.length) {
        log.conclusion = `Проблема на получении содержимого файлов через старый action=content. Ошибочных файлов: ${contentErrors.length} из ${downloadableFiles.length}. Первый ошибочный файл: ${contentErrors[0].name || contentErrors[0].requested_path}`;
      } else if (linkErrors.length) {
        log.conclusion = `Ссылки download получены не для всех файлов, но content скачался. Ошибок download: ${linkErrors.length}. Проверь расхождение download/content в GIP API.`;
      } else if (!log.zip_generate?.ok) {
        log.conclusion = `Все файлы скачались, но сборка ZIP упала: ${log.zip_generate?.error || "ошибка JSZip"}.`;
      } else {
        log.conclusion = `Диагностика успешно скачала содержимое всех файлов браузером и серверный GIP API dry-run тоже собрал архив. Размер server ZIP: ${log.server_archive_check.archive_bytes} байт.`;
      }
    } catch (error) {
      log.conclusion = `Диагностика архива прервана общей ошибкой: ${error?.message || String(error)}`;
    }

    setNormDiagnostics({ loading: false, log: JSON.stringify(log, null, 2) });
  }

  async function downloadNormControlArchive(section) {
    if (!section) {
      setSiteDirectoryError("Выберите раздел для нормоконтроля.");
      return;
    }

    const sourceFiles = normalizeNormControlFiles(section.norm_control_files);
    const downloadableFiles = sourceFiles
      .map((file) => ({ ...file, resolved_yandex_path: resolveNormControlFileYandexPath(file, section) }))
      .filter((file) => file.resolved_yandex_path);

    if (!downloadableFiles.length) {
      setSiteDirectoryError("В выбранном разделе нет файлов с путем для формирования архива нормоконтроля.");
      return;
    }

    const archiveKey = `norm:${section.id || "section"}`;
    const archiveName = sanitizeZipPart([
      section.building_gp_no || "GP",
      normalizeStage(section.stage || "П"),
      section.section_code || "section",
      "Нормаконтроль",
    ].filter(Boolean).join("_"));

    setArchiveDownloadState((prev) => ({ ...prev, [archiveKey]: true }));
    setSiteDirectoryError("");
    setNotice("Готовлю общий архив на стороне GIP API...");

    try {
      const payloadFiles = downloadableFiles.map((file) => ({
        path: file.resolved_yandex_path,
        name: file.name || file.file_name || String(file.resolved_yandex_path).split("/").pop() || "file",
      }));

      const result = await startAndWaitNormArchiveJob(payloadFiles, archiveName, archiveKey);

      if (!result?.href) {
        throw new Error("GIP API не вернул ссылку на подготовленный архив.");
      }

      window.open(result.href, "_blank", "noopener,noreferrer");
      setNotice(`Архив нормоконтроля подготовлен через GIP API. Файлов: ${result.file_count || downloadableFiles.length}. Размер: ${formatBytes(result.archive_bytes || 0)}.`);
    } catch (error) {
      setSiteDirectoryError(`Ошибка формирования архива нормоконтроля через GIP API: ${error.message}`);
    } finally {
      setArchiveDownloadState((prev) => ({ ...prev, [archiveKey]: false }));
    }
  }

  async function uploadYandexFileBase64(file, diskPath, overwrite = false) {
    const buffer = await file.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(buffer);
    return invokeYandexReadonly({
      action: "upload",
      path: diskPath,
      file_base64: fileBase64,
      content_type: file.type || "application/octet-stream",
      overwrite,
    });
  }

  function handleNormResultFilesPicked(files) {
    const picked = Array.from(files || []);
    if (!picked.length) return;
    const existingKeys = new Set(normResultFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const nextFiles = [...normResultFiles];
    picked.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        nextFiles.push(file);
      }
    });
    setNormResultFiles(nextFiles);
    setNormResultUploadProgress({ percent: 0, message: `Выбрано файлов: ${nextFiles.length}` });
  }

  async function uploadNormControlResultFiles() {
    const section = selectedNormSection;
    const filesToUpload = Array.isArray(normResultFiles) ? normResultFiles : [];

    setSiteDirectoryError("");
    setNotice("");
    if (!section) {
      setSiteDirectoryError("Выберите раздел для загрузки результатов проверки.");
      return;
    }
    if (!filesToUpload.length) {
      setSiteDirectoryError("Добавьте один или несколько файлов результатов проверки.");
      return;
    }

    for (const file of filesToUpload) {
      if (file.size <= 0) {
        setSiteDirectoryError(`Пустой файл нельзя загрузить: ${file.name}.`);
        return;
      }
      if (file.size > MAX_INCOMING_UPLOAD_BYTES) {
        setSiteDirectoryError(`Файл слишком большой: ${file.name}. Ограничение: ${formatFileSize(MAX_INCOMING_UPLOAD_BYTES)}.`);
        return;
      }
      if (isBlockedUploadFile(file.name)) {
        setSiteDirectoryError(`Этот тип файла запрещен для загрузки: ${file.name}.`);
        return;
      }
    }

    setNormResultUploading(true);
    setNormResultUploadProgress({ percent: 1, message: "Подготовка загрузки." });

    try {
      const usedDiskNames = new Set();
      for (let index = 0; index < filesToUpload.length; index += 1) {
        const file = filesToUpload[index];
        const baseProgress = Math.round((index / filesToUpload.length) * 100);
        const safeName = makeUniqueZipName(usedDiskNames, file.name);
        const diskPath = makeNormControlResultDiskPath(section, safeName);
        const registeredAt = new Date().toISOString();
        const uploadId = randomUploadId();

        const payload = {
          project_key: section.project_key || "opr_donetsk",
          section_id: section.id,
          site_section_id: section.id,
          building_gp_no: section.building_gp_no || "",
          building_name: section.building_name || "",
          stage: normalizeStage(section.stage || ""),
          section_code: section.section_code || "",
          section_title: section.section_title || "",
          document_type: "remark",
          document_group: "norm_control_result",
          file_name: file.name,
          original_name: file.name,
          file_url: "",
          yandex_path: diskPath,
          yandex_disk_path: diskPath,
          storage_path: diskPath,
          local_file_path: "",
          size_bytes: file.size,
          modified_at: registeredAt,
          registered_at: registeredAt,
          registered_by: currentUser?.name || currentUser?.login || "",
          uploaded_by: currentUser?.name || currentUser?.login || "",
          comment: "[file_category:norm_control_result] Результат проверки нормоконтроля.",
          status: "uploaded",
          active: true,
          source_hash: "",
          source_exists: true,
          source_updated_at: registeredAt,
        };

        setNormResultUploadProgress({ percent: Math.max(1, baseProgress), message: `Подготовка файла ${index + 1} из ${filesToUpload.length}: ${file.name}` });
        const sha256 = await fileSha256(file);

        await uploadIncomingFileInChunks(file, {
          uploadId,
          diskPath,
          contentType: file.type || "application/octet-stream",
          sha256,
          incomingTable: siteFilesTable,
          payload,
          overwrite: false,
          noticePrefix: "Обработка результата нормоконтроля",
          onChunkProgress: ({ chunkIndex, totalChunks }) => {
            const chunkShare = totalChunks > 0 ? (chunkIndex / totalChunks) : 0;
            const percent = Math.min(98, Math.round(((index + chunkShare) / filesToUpload.length) * 100));
            setNormResultUploadProgress({
              percent: Math.max(1, percent),
              message: `Обработка файла ${index + 1} из ${filesToUpload.length}: часть ${chunkIndex + 1} из ${totalChunks}.`,
            });
          },
          onFinishStart: () => {
            setNormResultUploadProgress({
              percent: Math.min(99, Math.round(((index + 0.95) / filesToUpload.length) * 100)),
              message: `Завершаю обработку файла ${index + 1} из ${filesToUpload.length}.`,
            });
          },
        });

        setNormResultUploadProgress({
          percent: Math.round(((index + 1) / filesToUpload.length) * 100),
          message: `Загружено файлов: ${index + 1} из ${filesToUpload.length}.`,
        });
      }

      setNormResultFiles([]);
      setNotice(`Результаты проверки загружены. Файлов: ${filesToUpload.length}.`);
      await loadSiteDirectory();
    } catch (error) {
      setSiteDirectoryError(`Ошибка загрузки результатов проверки: ${error.message}`);
    } finally {
      setNormResultUploading(false);
    }
  }

  async function deleteNormControlResultFile(file) {
    const fileId = String(file?.id || "").trim();
    const fileName = file?.file_name || file?.original_name || "файл";

    setSiteDirectoryError("");
    setNotice("");

    if (!fileId) {
      setSiteDirectoryError("Не удалось удалить запись: у файла нет идентификатора в БД.");
      return;
    }

    const answer = window.confirm(`Удалить запись результата нормоконтроля «${fileName}» из списка? Файл на диске не удаляется.`);
    if (!answer) return;

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from(siteFilesTable)
        .update({
          active: false,
          status: "deleted",
          modified_at: now,
        })
        .eq("id", fileId)
        .eq("document_group", "norm_control_result");

      if (error) throw error;

      setSiteFiles((items) => items.map((item) => (String(item.id || "") === fileId ? { ...item, active: false, status: "deleted", modified_at: now } : item)));
      setNotice(`Запись результата нормоконтроля удалена из списка: ${fileName}.`);
    } catch (error) {
      setSiteDirectoryError(`Ошибка удаления результата нормоконтроля: ${error.message}`);
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

        await uploadIncomingFileInChunks(uploadFile, {
          uploadId,
          diskPath,
          contentType: uploadFile.type || "application/octet-stream",
          sha256,
          incomingTable: siteIncomingTable,
          payload,
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
      } else if (normalizedUser.role === "norm_controller") {
        setInterfaceChoice("norm_control");
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
                : hasAccess(normalizedUser, "norm_control")
                  ? "norm_control"
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
    setLogin("");
    setPassword("");
    setLoginError("");
    setNotice("");
    setInterfaceChoice(null);
    setSiteSections([]);
    setSiteFiles([]);
    setSelectedNormProjectKey("");
    setSelectedNormSectionId("");
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
      setNotice(`Ошибка добавления учетной записи: ${error.message}`);
    }
  }

  async function updateAccount(account, patch) {
    setNotice("");

    const normalizedPatch = {
      ...patch,
      ...(patch.role ? { role: normalizeAccountRole(patch.role) } : {}),
      ...(patch.allowed_elements
        ? { allowed_elements: normalizeAccessElements(patch.allowed_elements, patch.role || account.role) }
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

  function renderNormControllerWorkspace() {
    const selectedFiles = normalizeNormControlFiles(selectedNormSection?.norm_control_files);
    const downloadKey = `norm:${selectedNormSection?.id || "section"}`;
    const resultTargetPath = selectedNormSection ? makeNormControlResultDiskPath(selectedNormSection, "<файл>") : "";

    return (
      <main className="architectShell normControllerShell">
        <header className="architectHero">
          <div>
            <p className="eyebrow">Нормаконтроль</p>
            <h1>Кабинет нормоконтролера</h1>
            <p>Показаны только проекты, где есть разделы, готовые к нормаконтролю, и нормаконтроль еще не завершен.</p>
          </div>
          <div className="architectHeroActions">
            <div className="roleBadge">{ROLE_LABELS[currentUser?.role] || currentUser?.role}</div>
            <button className="ghostButton" onClick={loadSiteDirectory} disabled={siteDirectoryLoading}>
              {siteDirectoryLoading ? "Обновляю..." : "Обновить"}
            </button>
            <button className="ghostButton" onClick={logout}>Выйти</button>
          </div>
        </header>

        {siteDirectoryError && <div className="errorBox architectError">{siteDirectoryError}</div>}
        {notice && <div className="noticeBox architectError">{notice}</div>}

        <section className="architectWorkspaceGrid normWorkspaceGrid">
          <aside className="architectPanel normProjectPanel">
            <div className="cardHeaderLine">
              <div>
                <h3>Проекты</h3>
              </div>
              <strong>{normProjects.length}</strong>
            </div>

            <div className="normProjectList" role="listbox" aria-label="Проекты для нормаконтроля">
              {normProjects.map((project) => (
                <button
                  key={project.key}
                  type="button"
                  className={selectedNormProjectKey === project.key ? "normProjectItem active" : "normProjectItem"}
                  onClick={() => {
                    setSelectedNormProjectKey(project.key);
                    setSelectedNormSectionId(project.sections[0]?.id || "");
                  }}
                >
                  <span>{project.title}</span>
                  <small>{project.sections.length} разделов</small>
                </button>
              ))}
              {!normProjects.length && (
                <div className="emptyFileBox">Нет проектов с разделами, готовыми к нормаконтролю.</div>
              )}
            </div>
          </aside>

          <section className="architectPanel mainArchitectPanel normSectionPanel">
            <div className="cardHeaderLine sectionListHeader">
              <div>
                <h3>Разделы выбранного проекта</h3>
              </div>
              <div className="normArchiveActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => diagnoseNormControlArchive(selectedNormSection)}
                  disabled={!selectedNormSection || normDiagnostics.loading || archiveDownloadState[downloadKey]}
                >
                  {normDiagnostics.loading ? "Диагностика..." : "Диагностика архива"}
                </button>
                <button
                  type="button"
                  className="primaryButton"
                  onClick={() => downloadNormControlArchive(selectedNormSection)}
                  disabled={!selectedNormSection || archiveDownloadState[downloadKey]}
                >
                  {archiveDownloadState[downloadKey] ? "Готовлю архив..." : "Загрузить файлы"}
                </button>
              </div>
            </div>

            {archiveProgressState[downloadKey] && archiveDownloadState[downloadKey] && (
              <div className="normArchiveProgressBox">
                <div className="normArchiveProgressText">
                  <strong>{archiveProgressState[downloadKey].message}</strong>
                  <span>{Math.round(archiveProgressState[downloadKey].progress)}%</span>
                </div>
                <progress value={archiveProgressState[downloadKey].progress} max="100" />
                <small>
                  Файлов: {archiveProgressState[downloadKey].filesDone} из {archiveProgressState[downloadKey].filesTotal}
                  {archiveProgressState[downloadKey].archiveBytes ? ` · Архив: ${formatBytes(archiveProgressState[downloadKey].archiveBytes)}` : ""}
                  {archiveProgressState[downloadKey].sourceBytes ? ` · Получено: ${formatBytes(archiveProgressState[downloadKey].sourceBytes)}` : ""}
                </small>
              </div>
            )}

            <div className="architectSectionTableWrap">
              <table className="architectSectionTable normSectionTable">
                <thead>
                  <tr>
                    <th>Стадия</th>
                    <th>Раздел</th>
                    <th>Наименование</th>
                    <th>Шифр</th>
                    <th>Файлов</th>
                    <th>Готовность</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNormProjectSections.map((section) => {
                    const files = normalizeNormControlFiles(section.norm_control_files);
                    return (
                      <tr
                        key={section.id}
                        className={selectedNormSection?.id === section.id ? "selectedRow" : ""}
                        onClick={() => setSelectedNormSectionId(section.id)}
                      >
                        <td>{normalizeStage(section.stage)}</td>
                        <td><strong>{section.section_code}</strong></td>
                        <td>{section.section_title}</td>
                        <td>{section.cipher || "—"}</td>
                        <td>{files.length}</td>
                        <td><span className="readyBadge">Готов к нормаконтролю</span></td>
                      </tr>
                    );
                  })}
                  {!selectedNormProjectSections.length && (
                    <tr>
                      <td colSpan="6" className="emptyCell">Для выбранного проекта нет разделов, готовых к нормаконтролю.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selectedNormSection && (
              <section className="normFilesPanel">
                <div className="cardHeaderLine">
                  <div>
                    <p className="eyebrow">Файлы выбранного раздела</p>
                    <h3>{selectedNormSection.section_code} — {selectedNormSection.section_title}</h3>
                  </div>
                  <span>{selectedFiles.length}</span>
                </div>
                <div className="fileList">
                  {selectedFiles.map((file, index) => {
                    const diskPath = resolveNormControlFileYandexPath(file, selectedNormSection);
                    return (
                      <article className="fileCard" key={file.key || file.document_card_id || `${file.name}:${index}`}>
                        <div>
                          <strong>{file.name || "Файл"}</strong>
                          <small>{file.kind || file.document_type || "файл"}</small>
                          <small>{diskPath ? "Путь найден" : "Нет пути для архива"}</small>
                          <small className="normFilePath" title={diskPath || ""}>Путь: {diskPath || "—"}</small>
                        </div>
                        <div className="normFileActions">
                          {diskPath ? (
                            <button className="smallButton" type="button" onClick={() => openYandexDiskFile(diskPath)}>
                              Открыть
                            </button>
                          ) : (
                            <span className="fileNoLink">Нет ссылки</span>
                          )}
                          <button
                            className="secondaryButton smallDiagnosticButton"
                            type="button"
                            onClick={() => diagnoseNormControlFile(file, selectedNormSection)}
                            disabled={normDiagnostics.loading}
                          >
                            Диагностика
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!selectedFiles.length && <div className="emptyFileBox">В разделе нет сохраненного списка файлов для нормаконтроля.</div>}
                </div>
                {normDiagnostics.log && (
                  <div className="normDiagnosticsBox">
                    <div className="cardHeaderLine compactHeaderLine">
                      <p className="eyebrow">Лог диагностики скачивания / архива</p>
                      <button
                        type="button"
                        className="smallButton"
                        onClick={() => navigator.clipboard?.writeText(normDiagnostics.log)}
                      >
                        Скопировать лог
                      </button>
                    </div>
                    <textarea readOnly value={normDiagnostics.log} />
                  </div>
                )}
              </section>
            )}
          </section>

          <section className="architectPanel normResultPanel">
            <div className="cardHeaderLine sectionListHeader">
              <div>
                <h3>Результаты проверки</h3>
                {selectedNormSection ? (
                  <p>Папка: <strong>{resultTargetPath}</strong></p>
                ) : (
                  <p>Выберите раздел, чтобы загрузить результаты проверки.</p>
                )}
              </div>
              <button
                type="button"
                className="primaryButton"
                onClick={uploadNormControlResultFiles}
                disabled={!selectedNormSection || normResultUploading || !normResultFiles.length}
              >
                {normResultUploading ? "Обработка..." : "Загрузить"}
              </button>
            </div>

            <div
              className={normResultDragActive ? "normResultDropZone active" : "normResultDropZone"}
              onDragOver={(event) => {
                event.preventDefault();
                if (!normResultUploading) setNormResultDragActive(true);
              }}
              onDragLeave={() => setNormResultDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setNormResultDragActive(false);
                if (!normResultUploading) handleNormResultFilesPicked(event.dataTransfer.files);
              }}
            >
              <strong>Перетащите сюда файлы результатов проверки</strong>
              <span>или выберите их через поле ниже</span>
              <input
                type="file"
                multiple
                disabled={normResultUploading || !selectedNormSection}
                onChange={(event) => handleNormResultFilesPicked(event.target.files)}
              />
            </div>

            {normResultFiles.length > 0 && (
              <div className="selectedUploadFileInfo normResultSelectedFiles">
                Выбрано файлов: <strong>{normResultFiles.length}</strong>
                <button type="button" className="smallButton" onClick={() => setNormResultFiles([])} disabled={normResultUploading}>Очистить</button>
                <ul>
                  {normResultFiles.map((file) => (
                    <li key={`${file.name}:${file.size}:${file.lastModified}`}>{file.name} / {formatFileSize(file.size)}</li>
                  ))}
                </ul>
              </div>
            )}

            {(normResultUploading || normResultUploadProgress.message) && (
              <div className="normResultProgressBox">
                <progress value={normResultUploadProgress.percent || 0} max="100" />
                <div>{normResultUploadProgress.percent || 0}% — {normResultUploadProgress.message}</div>
              </div>
            )}

            <div className="normUploadedResults">
              <div className="cardHeaderLine compactHeaderLine">
                <p className="eyebrow">Загруженные результаты</p>
                <span>{selectedNormResultCards.length}</span>
              </div>
              <div className="fileList">
                {selectedNormResultCards.map((file) => {
                  const diskPath = getArchitectFileYandexPath(file) || file.storage_path || "";
                  return (
                    <article className="fileCard" key={file.id || `${file.file_name}:${file.registered_at}`}>
                      <div>
                        <strong>{file.file_name || file.original_name || "Файл"}</strong>
                        {file.size_bytes ? <small>Размер: {formatFileSize(file.size_bytes)}</small> : null}
                        {file.registered_at ? <small>Дата: {file.registered_at}</small> : null}
                      </div>
                      <div className="normResultFileActions">
                        {diskPath ? (
                          <button className="smallButton" type="button" onClick={() => openYandexDiskFile(diskPath)}>
                            Открыть
                          </button>
                        ) : (
                          <span className="fileNoLink">Нет ссылки</span>
                        )}
                        <button className="dangerButton" type="button" onClick={() => deleteNormControlResultFile(file)}>
                          Удалить
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!selectedNormResultCards.length && <div className="emptyFileBox">Результаты проверки по выбранному разделу еще не загружены.</div>}
              </div>
            </div>
          </section>
        </section>
      </main>
    );
  }

  function renderArchitectInterfaceChoice() {
    return (
      <main className="loginOnlyPage">
        <section className="loginCard interfaceChoiceCard">
          <h1>Выбор интерфейса</h1>
          <div className="appVersionBadge">Версия сайта: {APP_VERSION}</div>
          <p className="choiceText">
            Выберите режим работы для учетной записи ГАПа.
          </p>

          <div className="choiceGrid">
            <button className="choiceButton primaryChoice" type="button" onClick={() => chooseArchitectInterface("specialized")}>
              <strong>Кабинет ГАПа</strong>
              <span>Работа со зданиями, разделами, файлами проекта и входящими материалами.</span>
            </button>

            <button className="choiceButton" type="button" onClick={() => chooseArchitectInterface("general")}>
              <strong>Общий интерфейс</strong>
              <span>Графики, здания и доступные разделы общего личного кабинета.</span>
            </button>
          </div>

          <button className="ghostButton choiceLogoutButton" type="button" onClick={logout}>
            Выйти
          </button>
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
            <button className="secondaryButton" onClick={loadSiteDirectory} disabled={siteDirectoryLoading}>
              {siteDirectoryLoading ? "Обновление..." : "Обновить"}
            </button>
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
                        hasProjectFile ? "project-file-attached-row" : "missingProjectFileRow",
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

          <div className="modalContentGrid singleColumn">
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
                              <button className="smallButton" onClick={() => window.open(file.file_url, "_blank", "noopener,noreferrer")}>
                                Скачать / открыть
                              </button>
                            ) : getArchitectFileYandexPath(file) ? (
                              <button className="smallButton" onClick={() => openYandexDiskFile(getArchitectFileYandexPath(file))}>
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

          </div>
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

        <div className="adminGrid accountAdminGrid">
          <div className="adminCard accountAddCard">
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

          <div className="adminCard wideCard accountListCard">
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

                  <div className="accountControls accountControlsStack">
                    <div className="accountRolePasswordRow">
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
                    </div>

                    <div className="accountActionButtons accountActionButtonsUnderRole">
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

  if (currentUser.role === "norm_controller") {
    return renderNormControllerWorkspace();
  }

  if (currentUser.role === "architect" && !interfaceChoice) {
    return renderArchitectInterfaceChoice();
  }

  if (currentUser.role === "architect" && interfaceChoice === "specialized") {
    return renderArchitectWorkspace();
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

        {hasAccess(currentUser, "norm_control") && (
          <button
            className={activeTab === "norm_control" ? "tabButton active" : "tabButton"}
            onClick={() => setActiveTab("norm_control")}
          >
            Нормаконтроль
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
      {activeTab === "norm_control" && renderNormControllerWorkspace()}

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
