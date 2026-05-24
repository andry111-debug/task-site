import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseReady } from "./supabaseClient";
import "./App.css";

const today = new Date().toISOString().slice(0, 10);

function emptyEmployeeForm() {
  return {
    name: "",
    login: "",
    pin_code: "",
    role: "employee",
  };
}

function emptyTaskForm() {
  return {
    title: "",
    description: "",
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [login, setLogin] = useState("admin");
  const [pinCode, setPinCode] = useState("1111");
  const [loginError, setLoginError] = useState("");

  const [activePage, setActivePage] = useState("home");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm());
  const [taskForm, setTaskForm] = useState(emptyTaskForm());

  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState("");
  const [assignmentTaskId, setAssignmentTaskId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(today);

  const [employeeDate, setEmployeeDate] = useState(today);
  const [adminDate, setAdminDate] = useState(today);

  const activeEmployees = useMemo(
    () => employees.filter((item) => item.active && item.role === "employee"),
    [employees]
  );

  const activeTasks = useMemo(
    () => tasks.filter((item) => item.active),
    [tasks]
  );

  const assignmentRows = useMemo(() => {
    return assignments.map((assignment) => {
      const employee = employees.find((item) => item.id === assignment.employee_id);
      const task = tasks.find((item) => item.id === assignment.task_id);
      const status = statuses.find(
        (item) =>
          item.assignment_id === assignment.id &&
          item.work_date === assignment.assigned_date
      );

      return {
        ...assignment,
        employee,
        task,
        status,
      };
    });
  }, [assignments, employees, tasks, statuses]);

  const employeeRows = useMemo(() => {
    if (!currentUser) return [];
    return assignmentRows.filter(
      (row) =>
        row.employee_id === currentUser.id &&
        row.assigned_date === employeeDate &&
        row.active
    );
  }, [assignmentRows, currentUser, employeeDate]);

  const adminRows = useMemo(() => {
    return assignmentRows
      .filter((row) => row.assigned_date === adminDate && row.active)
      .sort((a, b) => {
        const nameA = a.employee?.name || "";
        const nameB = b.employee?.name || "";
        return nameA.localeCompare(nameB, "ru");
      });
  }, [assignmentRows, adminDate]);

  const doneCount = adminRows.filter((row) => row.status?.is_done).length;
  const percent = adminRows.length ? Math.round((doneCount / adminRows.length) * 100) : 0;

  async function loadData() {
    if (!isSupabaseReady) return;

    setLoading(true);
    setNotice("");

    try {
      const [
        employeesResult,
        tasksResult,
        assignmentsResult,
        statusesResult,
      ] = await Promise.all([
        supabase.from("employees").select("*").order("created_at", { ascending: true }),
        supabase.from("tasks").select("*").order("created_at", { ascending: true }),
        supabase.from("assignments").select("*").order("assigned_date", { ascending: false }),
        supabase.from("task_status").select("*"),
      ]);

      if (employeesResult.error) throw employeesResult.error;
      if (tasksResult.error) throw tasksResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (statusesResult.error) throw statusesResult.error;

      setEmployees(employeesResult.data || []);
      setTasks(tasksResult.data || []);
      setAssignments(assignmentsResult.data || []);
      setStatuses(statusesResult.data || []);
    } catch (error) {
      setNotice(`Ошибка загрузки данных: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!assignmentEmployeeId && activeEmployees.length) {
      setAssignmentEmployeeId(activeEmployees[0].id);
    }

    if (!assignmentTaskId && activeTasks.length) {
      setAssignmentTaskId(activeTasks[0].id);
    }
  }, [activeEmployees, activeTasks, assignmentEmployeeId, assignmentTaskId]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");

    if (!isSupabaseReady) {
      setLoginError("Supabase не подключён. Проверь файл .env.local.");
      return;
    }

    const cleanedLogin = login.trim();

    if (!cleanedLogin || !pinCode.trim()) {
      setLoginError("Укажи логин и PIN-код.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("login", cleanedLogin)
        .eq("pin_code", pinCode.trim())
        .eq("active", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setLoginError("Пользователь не найден или указан неверный PIN-код.");
        return;
      }

      setCurrentUser(data);
      setActivePage(data.role === "admin" ? "admin" : "employee");
      setNotice("");
      await loadData();
    } catch (error) {
      setLoginError(`Ошибка входа: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setActivePage("home");
    setLogin("admin");
    setPinCode("1111");
    setLoginError("");
  }

  async function handleAddEmployee(event) {
    event.preventDefault();
    setNotice("");

    const payload = {
      name: employeeForm.name.trim(),
      login: employeeForm.login.trim(),
      pin_code: employeeForm.pin_code.trim(),
      role: employeeForm.role,
      active: true,
    };

    if (!payload.name || !payload.login || !payload.pin_code) {
      setNotice("Заполни имя, логин и PIN-код сотрудника.");
      return;
    }

    try {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) throw error;

      setEmployeeForm(emptyEmployeeForm());
      setNotice("Сотрудник добавлен.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка добавления сотрудника: ${error.message}`);
    }
  }

  async function handleToggleEmployee(employee) {
    setNotice("");

    try {
      const { error } = await supabase
        .from("employees")
        .update({ active: !employee.active })
        .eq("id", employee.id);

      if (error) throw error;

      setNotice(employee.active ? "Сотрудник отключён." : "Сотрудник включён.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка изменения сотрудника: ${error.message}`);
    }
  }

  async function handleAddTask(event) {
    event.preventDefault();
    setNotice("");

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      active: true,
    };

    if (!payload.title) {
      setNotice("Укажи название задачи.");
      return;
    }

    try {
      const { error } = await supabase.from("tasks").insert(payload);
      if (error) throw error;

      setTaskForm(emptyTaskForm());
      setNotice("Задача добавлена.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка добавления задачи: ${error.message}`);
    }
  }

  async function handleToggleTask(task) {
    setNotice("");

    try {
      const { error } = await supabase
        .from("tasks")
        .update({ active: !task.active })
        .eq("id", task.id);

      if (error) throw error;

      setNotice(task.active ? "Задача отключена." : "Задача включена.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка изменения задачи: ${error.message}`);
    }
  }

  async function handleAssignTask(event) {
    event.preventDefault();
    setNotice("");

    if (!assignmentEmployeeId || !assignmentTaskId || !assignmentDate) {
      setNotice("Выбери сотрудника, задачу и дату.");
      return;
    }

    try {
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignments")
        .upsert(
          {
            employee_id: assignmentEmployeeId,
            task_id: assignmentTaskId,
            assigned_date: assignmentDate,
            active: true,
          },
          { onConflict: "employee_id,task_id,assigned_date" }
        )
        .select("*")
        .single();

      if (assignmentError) throw assignmentError;

      const { error: statusError } = await supabase
        .from("task_status")
        .upsert(
          {
            assignment_id: assignment.id,
            work_date: assignmentDate,
            is_done: false,
            comment: null,
          },
          { onConflict: "assignment_id,work_date" }
        );

      if (statusError) throw statusError;

      setNotice("Задача назначена.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка назначения задачи: ${error.message}`);
    }
  }

  async function handleToggleAssignment(assignment) {
    setNotice("");

    try {
      const { error } = await supabase
        .from("assignments")
        .update({ active: !assignment.active })
        .eq("id", assignment.id);

      if (error) throw error;

      setNotice(assignment.active ? "Назначение отключено." : "Назначение включено.");
      await loadData();
    } catch (error) {
      setNotice(`Ошибка изменения назначения: ${error.message}`);
    }
  }

  async function updateStatus(row, fields) {
    setNotice("");

    try {
      const { error } = await supabase
        .from("task_status")
        .upsert(
          {
            assignment_id: row.id,
            work_date: row.assigned_date,
            is_done: row.status?.is_done || false,
            comment: row.status?.comment || null,
            ...fields,
          },
          { onConflict: "assignment_id,work_date" }
        );

      if (error) throw error;

      await loadData();
    } catch (error) {
      setNotice(`Ошибка сохранения статуса: ${error.message}`);
    }
  }

  async function handleCommentBlur(row, value) {
    await updateStatus(row, {
      comment: value.trim() || null,
    });
  }

  function renderHome() {
    return (
      <section className="hero">
        <div className="heroText">
          <p className="eyebrow">Первая рабочая версия</p>
          <h2>Сайт задач сотрудников с базой Supabase</h2>
          <p>
            В этой версии администратор может добавлять сотрудников, создавать задачи,
            назначать задачи на дату и смотреть выполнение. Сотрудники видят свои
            задачи и отмечают выполнение.
          </p>

          <div className="heroActions">
            <button className="primaryButton" onClick={() => setActivePage("employee")}>
              Войти как сотрудник
            </button>
            <button className="darkButton" onClick={() => setActivePage("admin")}>
              Войти как админ
            </button>
          </div>
        </div>

        <div className="heroStats">
          <span>Выполнено</span>
          <strong>{percent}%</strong>
          <small>
            {doneCount} из {adminRows.length} задач закрыто сегодня
          </small>
        </div>
      </section>
    );
  }

  function renderLogin(targetRole) {
    return (
      <section className="loginPanel">
        <p className="eyebrow">Вход</p>
        <h2>{targetRole === "admin" ? "Кабинет администратора" : "Кабинет сотрудника"}</h2>

        <form onSubmit={handleLogin} className="formStack">
          <label>
            Логин
            <input value={login} onChange={(event) => setLogin(event.target.value)} />
          </label>

          <label>
            PIN-код
            <input
              value={pinCode}
              onChange={(event) => setPinCode(event.target.value)}
              type="password"
            />
          </label>

          {loginError && <div className="errorBox">{loginError}</div>}

          <button className="primaryButton" type="submit" disabled={loading}>
            {loading ? "Проверяем..." : "Войти"}
          </button>
        </form>

        <div className="testLogins">
          <strong>Тестовые входы</strong>
          <span>Админ: admin / 1111</span>
          <span>Сотрудник: ivan / 1234</span>
          <span>Сотрудник: sergey / 2345</span>
        </div>
      </section>
    );
  }

  function renderEmployee() {
    if (!currentUser || currentUser.role !== "employee") {
      return renderLogin("employee");
    }

    return (
      <section className="pageGrid">
        <div className="sectionHeader fullWidth">
          <div>
            <p className="eyebrow">Кабинет сотрудника</p>
            <h2>{currentUser.name}</h2>
          </div>
          <button className="ghostButton" onClick={handleLogout}>
            Выйти
          </button>
        </div>

        <div className="card fullWidth">
          <div className="toolbar">
            <label>
              Дата
              <input
                type="date"
                value={employeeDate}
                onChange={(event) => setEmployeeDate(event.target.value)}
              />
            </label>
            <button className="secondaryButton" onClick={loadData}>
              Обновить
            </button>
          </div>

          {employeeRows.length === 0 ? (
            <div className="emptyState">На выбранную дату задач нет.</div>
          ) : (
            <div className="taskList">
              {employeeRows.map((row) => (
                <article className="taskCard" key={row.id}>
                  <div>
                    <h3>{row.task?.title || "Задача удалена"}</h3>
                    <p>{row.task?.description || "Описание не заполнено."}</p>
                  </div>

                  <label className="checkRow">
                    <input
                      type="checkbox"
                      checked={Boolean(row.status?.is_done)}
                      onChange={(event) =>
                        updateStatus(row, { is_done: event.target.checked })
                      }
                    />
                    Выполнено
                  </label>

                  <label>
                    Комментарий
                    <textarea
                      defaultValue={row.status?.comment || ""}
                      onBlur={(event) => handleCommentBlur(row, event.target.value)}
                      placeholder="Короткий комментарий при необходимости"
                    />
                  </label>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderAdmin() {
    if (!currentUser || currentUser.role !== "admin") {
      return renderLogin("admin");
    }

    return (
      <section className="adminLayout">
        <div className="sectionHeader fullWidth">
          <div>
            <p className="eyebrow">Кабинет администратора</p>
            <h2>Управление задачами</h2>
          </div>
          <button className="ghostButton" onClick={handleLogout}>
            Выйти
          </button>
        </div>

        <div className="statRow fullWidth">
          <div className="statCard">
            <span>Сотрудников</span>
            <strong>{activeEmployees.length}</strong>
          </div>
          <div className="statCard">
            <span>Активных задач</span>
            <strong>{activeTasks.length}</strong>
          </div>
          <div className="statCard">
            <span>Выполнено за дату</span>
            <strong>{percent}%</strong>
          </div>
        </div>

        <div className="card">
          <h3>Добавить сотрудника</h3>
          <form className="formStack" onSubmit={handleAddEmployee}>
            <label>
              Имя
              <input
                value={employeeForm.name}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, name: event.target.value })
                }
                placeholder="Например: Алексей Смирнов"
              />
            </label>

            <label>
              Логин
              <input
                value={employeeForm.login}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, login: event.target.value })
                }
                placeholder="Например: alexey"
              />
            </label>

            <label>
              PIN-код
              <input
                value={employeeForm.pin_code}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, pin_code: event.target.value })
                }
                placeholder="Например: 3456"
              />
            </label>

            <label>
              Роль
              <select
                value={employeeForm.role}
                onChange={(event) =>
                  setEmployeeForm({ ...employeeForm, role: event.target.value })
                }
              >
                <option value="employee">Сотрудник</option>
                <option value="admin">Админ</option>
              </select>
            </label>

            <button className="primaryButton" type="submit">
              Добавить
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Добавить задачу</h3>
          <form className="formStack" onSubmit={handleAddTask}>
            <label>
              Название
              <input
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, title: event.target.value })
                }
                placeholder="Например: Проверить оборудование"
              />
            </label>

            <label>
              Описание
              <textarea
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, description: event.target.value })
                }
                placeholder="Что должен сделать сотрудник"
              />
            </label>

            <button className="primaryButton" type="submit">
              Добавить
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Назначить задачу</h3>
          <form className="formStack" onSubmit={handleAssignTask}>
            <label>
              Сотрудник
              <select
                value={assignmentEmployeeId}
                onChange={(event) => setAssignmentEmployeeId(event.target.value)}
              >
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Задача
              <select
                value={assignmentTaskId}
                onChange={(event) => setAssignmentTaskId(event.target.value)}
              >
                {activeTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Дата
              <input
                type="date"
                value={assignmentDate}
                onChange={(event) => setAssignmentDate(event.target.value)}
              />
            </label>

            <button className="primaryButton" type="submit">
              Назначить
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Сотрудники</h3>
          <div className="compactList">
            {employees.map((employee) => (
              <div className="compactRow" key={employee.id}>
                <div>
                  <strong>{employee.name}</strong>
                  <span>
                    {employee.login} / {employee.role === "admin" ? "админ" : "сотрудник"}
                  </span>
                </div>
                <button
                  className={employee.active ? "smallDangerButton" : "smallButton"}
                  onClick={() => handleToggleEmployee(employee)}
                >
                  {employee.active ? "Отключить" : "Включить"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Задачи</h3>
          <div className="compactList">
            {tasks.map((task) => (
              <div className="compactRow" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.description || "Описание не заполнено"}</span>
                </div>
                <button
                  className={task.active ? "smallDangerButton" : "smallButton"}
                  onClick={() => handleToggleTask(task)}
                >
                  {task.active ? "Отключить" : "Включить"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card fullWidth">
          <div className="tableHeader">
            <div>
              <h3>Статусы выполнения</h3>
              <p>Показываются назначения на выбранную дату.</p>
            </div>
            <label>
              Дата
              <input
                type="date"
                value={adminDate}
                onChange={(event) => setAdminDate(event.target.value)}
              />
            </label>
          </div>

          {adminRows.length === 0 ? (
            <div className="emptyState">На выбранную дату назначений нет.</div>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th>Задача</th>
                    <th>Статус</th>
                    <th>Комментарий</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {adminRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.employee?.name || "Сотрудник удалён"}</td>
                      <td>{row.task?.title || "Задача удалена"}</td>
                      <td>
                        <span className={row.status?.is_done ? "statusDone" : "statusOpen"}>
                          {row.status?.is_done ? "Выполнено" : "Не выполнено"}
                        </span>
                      </td>
                      <td>{row.status?.comment || "—"}</td>
                      <td>
                        <button
                          className="smallDangerButton"
                          onClick={() => handleToggleAssignment(row)}
                        >
                          Отключить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <p className="eyebrow">Тестовый сайт</p>
          <h1>Задачи сотрудников</h1>
        </div>

        <nav>
          <button
            className={activePage === "home" ? "navButton active" : "navButton"}
            onClick={() => setActivePage("home")}
          >
            Главная
          </button>
          <button
            className={activePage === "employee" ? "navButton active" : "navButton"}
            onClick={() => {
              setActivePage("employee");
              setLogin("ivan");
              setPinCode("1234");
            }}
          >
            Сотрудник
          </button>
          <button
            className={activePage === "admin" ? "navButton active" : "navButton"}
            onClick={() => {
              setActivePage("admin");
              setLogin("admin");
              setPinCode("1111");
            }}
          >
            Админ
          </button>
        </nav>
      </header>

      {!isSupabaseReady && (
        <div className="warningBox">
          <strong>Supabase ещё не подключён.</strong>
          <span>
            Создай файл .env.local в корне проекта и укажи VITE_SUPABASE_URL и
            VITE_SUPABASE_KEY. После этого перезапусти npm.cmd run dev.
          </span>
        </div>
      )}

      {notice && <div className="noticeBox">{notice}</div>}

      {activePage === "home" && renderHome()}
      {activePage === "employee" && renderEmployee()}
      {activePage === "admin" && renderAdmin()}
    </main>
  );
}

export default App;
