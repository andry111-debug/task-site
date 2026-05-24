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
    owner: "ГИП",
  },
  {
    code: "ПЗУ",
    title: "Схема планировочной организации земельного участка",
    start: "2026-01-20",
    end: "2026-02-12",
    progress: 70,
    owner: "ГП",
  },
  {
    code: "АР",
    title: "Архитектурные решения",
    start: "2026-01-24",
    end: "2026-02-20",
    progress: 62,
    owner: "АР",
  },
  {
    code: "КР",
    title: "Конструктивные и объемно-планировочные решения",
    start: "2026-02-01",
    end: "2026-03-08",
    progress: 46,
    owner: "КР",
  },
  {
    code: "ИОС",
    title: "Инженерное оборудование, сети и инженерно-технические мероприятия",
    start: "2026-02-05",
    end: "2026-03-28",
    progress: 38,
    owner: "ОВ/ВК/ЭОМ/СС",
  },
  {
    code: "ТХ",
    title: "Технологические решения",
    start: "2026-02-10",
    end: "2026-03-18",
    progress: 42,
    owner: "ТХ",
  },
  {
    code: "ПОС",
    title: "Проект организации строительства",
    start: "2026-03-01",
    end: "2026-03-30",
    progress: 25,
    owner: "ПОС",
  },
  {
    code: "ПОД",
    title: "Проект организации работ по сносу или демонтажу",
    start: "2026-03-05",
    end: "2026-03-22",
    progress: 18,
    owner: "ПОС",
  },
  {
    code: "ООС",
    title: "Мероприятия по охране окружающей среды",
    start: "2026-03-10",
    end: "2026-04-08",
    progress: 20,
    owner: "ООС",
  },
  {
    code: "ПБ",
    title: "Мероприятия по обеспечению пожарной безопасности",
    start: "2026-03-14",
    end: "2026-04-12",
    progress: 16,
    owner: "ПБ",
  },
  {
    code: "ОДИ",
    title: "Мероприятия по обеспечению доступа инвалидов",
    start: "2026-03-18",
    end: "2026-04-05",
    progress: 12,
    owner: "АР",
  },
  {
    code: "БЭ",
    title: "Требования к обеспечению безопасной эксплуатации",
    start: "2026-03-20",
    end: "2026-04-18",
    progress: 10,
    owner: "ГИП",
  },
  {
    code: "ЭЭ",
    title: "Мероприятия по обеспечению энергетической эффективности",
    start: "2026-03-24",
    end: "2026-04-22",
    progress: 8,
    owner: "ОВ/ЭОМ",
  },
  {
    code: "СМ",
    title: "Смета на строительство",
    start: "2026-04-01",
    end: "2026-04-28",
    progress: 5,
    owner: "Сметы",
  },
  {
    code: "ИД",
    title: "Иная документация в случаях, предусмотренных законодательством",
    start: "2026-04-10",
    end: "2026-04-30",
    progress: 0,
    owner: "ГИП",
  },
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

  const isAdmin = currentUser?.role === "admin";

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
              <p>Пока заполнено тестовыми сроками. После загрузки реального перечня заменим разделы, даты и ответственных.</p>
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
                  <small>Ответственный: {item.owner}</small>
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
      {activeTab === "accounts" && renderAccountManagement()}
    </main>
  );
}

export default App;
