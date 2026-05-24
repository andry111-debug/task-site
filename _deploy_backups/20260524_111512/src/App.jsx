import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { isSupabaseConfigured, supabase } from './supabaseClient';

function getTodayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getSavedUser() {
  try {
    const value = localStorage.getItem('task_site_user');
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

const today = getTodayIso();

export default function App() {
  const [user, setUser] = useState(getSavedUser);
  const [page, setPage] = useState(user?.role === 'admin' ? 'admin' : user ? 'employee' : 'home');
  const [message, setMessage] = useState('');

  const logout = () => {
    localStorage.removeItem('task_site_user');
    setUser(null);
    setPage('home');
    setMessage('');
  };

  const handleLoginSuccess = (loggedUser) => {
    localStorage.setItem('task_site_user', JSON.stringify(loggedUser));
    setUser(loggedUser);
    setPage(loggedUser.role === 'admin' ? 'admin' : 'employee');
    setMessage('');
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setPage('home')}>
          <span>Тестовый сайт</span>
          <strong>Задачи сотрудников</strong>
        </button>
        <nav>
          <button type="button" onClick={() => setPage('home')}>Главная</button>
          <button type="button" onClick={() => setPage(user ? 'employee' : 'login')}>Сотрудник</button>
          <button className="primary" type="button" onClick={() => setPage(user?.role === 'admin' ? 'admin' : 'login')}>Админ</button>
          {user && <button type="button" onClick={logout}>Выйти</button>}
        </nav>
      </header>

      {!isSupabaseConfigured && <ConfigWarning />}
      {message && <div className="notice">{message}</div>}

      {page === 'home' && <Home user={user} setPage={setPage} />}
      {page === 'login' && <Login onSuccess={handleLoginSuccess} setMessage={setMessage} />}
      {page === 'employee' && <EmployeePage user={user} setPage={setPage} setMessage={setMessage} />}
      {page === 'admin' && <AdminPage user={user} setPage={setPage} setMessage={setMessage} />}
    </main>
  );
}

function ConfigWarning() {
  return (
    <section className="warning-card">
      <strong>Supabase ещё не подключён.</strong>
      <p>
        Создай файл .env.local в корне проекта и укажи VITE_SUPABASE_URL и VITE_SUPABASE_KEY.
        После этого перезапусти npm.cmd run dev.
      </p>
    </section>
  );
}

function Home({ user, setPage }) {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">Первая версия с базой Supabase</p>
        <h1>Проверяем сценарий: задача → выполнение → контроль</h1>
        <p>
          Данные теперь должны храниться в Supabase. Можно войти под тестовым сотрудником,
          отметить выполнение задач и посмотреть результат в кабинете администратора.
        </p>
        <div className="actions">
          <button className="primary" type="button" onClick={() => setPage(user ? 'employee' : 'login')}>
            Войти как сотрудник
          </button>
          <button type="button" onClick={() => setPage(user?.role === 'admin' ? 'admin' : 'login')}>
            Войти как админ
          </button>
        </div>
      </div>
      <div className="stats-card">
        <span>Сегодня</span>
        <strong>{today}</strong>
        <small>Рабочая дата для теста</small>
      </div>
    </section>
  );
}

function Login({ onSuccess, setMessage }) {
  const [login, setLogin] = useState('ivan');
  const [pin, setPin] = useState('1234');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');

    if (!isSupabaseConfigured) {
      setMessage('Сначала подключи Supabase через .env.local.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('id, name, login, role')
      .eq('login', login.trim())
      .eq('pin_code', pin.trim())
      .eq('active', true)
      .maybeSingle();

    setLoading(false);

    if (error) {
      setMessage(`Ошибка входа: ${error.message}`);
      return;
    }

    if (!data) {
      setMessage('Пользователь не найден. Проверь логин и PIN.');
      return;
    }

    onSuccess(data);
  };

  return (
    <section className="panel narrow-panel">
      <p className="eyebrow">Вход</p>
      <h1>Войти в тестовый кабинет</h1>
      <form className="form" onSubmit={submit}>
        <label>
          Логин
          <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="ivan" />
        </label>
        <label>
          PIN-код
          <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="1234" />
        </label>
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Проверка...' : 'Войти'}
        </button>
      </form>
      <div className="hint-box">
        <strong>Тестовые входы</strong>
        <p>Админ: admin / 1111</p>
        <p>Сотрудник: ivan / 1234</p>
        <p>Сотрудник: sergey / 2345</p>
      </div>
    </section>
  );
}

function EmployeePage({ user, setPage, setMessage }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setPage('login');
      return;
    }
    loadEmployeeTasks();
  }, [user?.id]);

  const loadEmployeeTasks = async () => {
    if (!isSupabaseConfigured || !user) return;
    setLoading(true);
    setMessage('');

    const { data: assignments, error } = await supabase
      .from('assignments')
      .select('id, task_id, assigned_date, tasks(id, title, description)')
      .eq('employee_id', user.id)
      .eq('assigned_date', today)
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (error) {
      setLoading(false);
      setMessage(`Ошибка загрузки задач: ${error.message}`);
      return;
    }

    const assignmentIds = assignments.map((item) => item.id);
    let statusMap = new Map();

    if (assignmentIds.length > 0) {
      const { data: statuses, error: statusError } = await supabase
        .from('task_status')
        .select('id, assignment_id, is_done, comment, work_date')
        .in('assignment_id', assignmentIds)
        .eq('work_date', today);

      if (statusError) {
        setLoading(false);
        setMessage(`Ошибка загрузки статусов: ${statusError.message}`);
        return;
      }

      statusMap = new Map(statuses.map((status) => [status.assignment_id, status]));
    }

    setItems(assignments.map((assignment) => ({
      ...assignment,
      status: statusMap.get(assignment.id) || { is_done: false, comment: '' },
    })));
    setLoading(false);
  };

  const updateStatus = async (assignmentId, changes) => {
    const current = items.find((item) => item.id === assignmentId);
    const nextStatus = {
      assignment_id: assignmentId,
      work_date: today,
      is_done: changes.is_done ?? current?.status?.is_done ?? false,
      comment: changes.comment ?? current?.status?.comment ?? '',
    };

    const { error } = await supabase
      .from('task_status')
      .upsert(nextStatus, { onConflict: 'assignment_id,work_date' });

    if (error) {
      setMessage(`Не удалось сохранить: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((item) => (
      item.id === assignmentId
        ? { ...item, status: { ...item.status, ...nextStatus } }
        : item
    )));
  };

  const doneCount = useMemo(() => items.filter((item) => item.status?.is_done).length, [items]);

  if (!user) return null;

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Кабинет сотрудника</p>
          <h1>{user.name}</h1>
          <p>Задачи на сегодня: {today}</p>
        </div>
        <div className="progress-card">
          <strong>{items.length ? Math.round((doneCount / items.length) * 100) : 0}%</strong>
          <span>{doneCount} из {items.length} задач выполнено</span>
        </div>
      </div>

      <button type="button" onClick={loadEmployeeTasks} disabled={loading}>
        {loading ? 'Обновление...' : 'Обновить задачи'}
      </button>

      <div className="task-list">
        {items.map((item) => (
          <article className={`task-item ${item.status?.is_done ? 'done' : ''}`} key={item.id}>
            <label className="check-line">
              <input
                type="checkbox"
                checked={Boolean(item.status?.is_done)}
                onChange={(event) => updateStatus(item.id, { is_done: event.target.checked })}
              />
              <span>
                <strong>{item.tasks?.title}</strong>
                <small>{item.tasks?.description}</small>
              </span>
            </label>
            <textarea
              value={item.status?.comment || ''}
              onChange={(event) => setItems((prev) => prev.map((row) => (
                row.id === item.id
                  ? { ...row, status: { ...row.status, comment: event.target.value } }
                  : row
              )))}
              onBlur={(event) => updateStatus(item.id, { comment: event.target.value })}
              placeholder="Комментарий по задаче"
            />
          </article>
        ))}
        {!loading && items.length === 0 && <p className="empty">На сегодня задач нет.</p>}
      </div>
    </section>
  );
}

function AdminPage({ user, setPage, setMessage }) {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ name: '', login: '', pin_code: '' });
  const [taskForm, setTaskForm] = useState({ title: '', description: '' });

  useEffect(() => {
    if (!user) {
      setPage('login');
      return;
    }
    if (user.role !== 'admin') {
      setPage('employee');
      setMessage('Раздел администратора доступен только админу.');
      return;
    }
    loadAdminData();
  }, [user?.id]);

  const loadAdminData = async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setMessage('');

    const [employeesResult, tasksResult, assignmentsResult] = await Promise.all([
      supabase.from('employees').select('id, name, login, pin_code, role, active').eq('active', true).order('created_at', { ascending: true }),
      supabase.from('tasks').select('id, title, description, active').eq('active', true).order('created_at', { ascending: true }),
      supabase.from('assignments').select('id, employee_id, task_id, employees(name), tasks(title), task_status(is_done, comment, work_date)').eq('assigned_date', today).order('created_at', { ascending: true }),
    ]);

    if (employeesResult.error || tasksResult.error || assignmentsResult.error) {
      setMessage(
        employeesResult.error?.message || tasksResult.error?.message || assignmentsResult.error?.message
      );
      setLoading(false);
      return;
    }

    setEmployees(employeesResult.data || []);
    setTasks(tasksResult.data || []);
    setAssignments(assignmentsResult.data || []);
    setLoading(false);
  };

  const ensureStatusRows = async (rows) => {
    if (!rows?.length) return;
    const statusRows = rows.map((row) => ({
      assignment_id: row.id,
      work_date: today,
      is_done: false,
      comment: '',
    }));
    await supabase.from('task_status').upsert(statusRows, { onConflict: 'assignment_id,work_date' });
  };

  const addEmployee = async (event) => {
    event.preventDefault();
    setMessage('');

    const { data: employee, error } = await supabase
      .from('employees')
      .insert({ ...employeeForm, role: 'employee', active: true })
      .select('id')
      .single();

    if (error) {
      setMessage(`Не удалось добавить сотрудника: ${error.message}`);
      return;
    }

    if (tasks.length > 0) {
      const rows = tasks.map((task) => ({
        employee_id: employee.id,
        task_id: task.id,
        assigned_date: today,
        active: true,
      }));
      const { data: newAssignments, error: assignmentError } = await supabase
        .from('assignments')
        .upsert(rows, { onConflict: 'employee_id,task_id,assigned_date' })
        .select('id');

      if (!assignmentError) await ensureStatusRows(newAssignments);
    }

    setEmployeeForm({ name: '', login: '', pin_code: '' });
    await loadAdminData();
  };

  const addTask = async (event) => {
    event.preventDefault();
    setMessage('');

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ ...taskForm, active: true })
      .select('id')
      .single();

    if (error) {
      setMessage(`Не удалось добавить задачу: ${error.message}`);
      return;
    }

    const staff = employees.filter((employee) => employee.role === 'employee');
    if (staff.length > 0) {
      const rows = staff.map((employee) => ({
        employee_id: employee.id,
        task_id: task.id,
        assigned_date: today,
        active: true,
      }));
      const { data: newAssignments, error: assignmentError } = await supabase
        .from('assignments')
        .upsert(rows, { onConflict: 'employee_id,task_id,assigned_date' })
        .select('id');

      if (!assignmentError) await ensureStatusRows(newAssignments);
    }

    setTaskForm({ title: '', description: '' });
    await loadAdminData();
  };

  if (!user || user.role !== 'admin') return null;

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Кабинет администратора</p>
          <h1>Контроль задач</h1>
          <p>Дата контроля: {today}</p>
        </div>
        <button type="button" onClick={loadAdminData} disabled={loading}>
          {loading ? 'Обновление...' : 'Обновить'}
        </button>
      </div>

      <div className="admin-grid">
        <form className="form card" onSubmit={addEmployee}>
          <h2>Добавить сотрудника</h2>
          <label>Имя<input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} required /></label>
          <label>Логин<input value={employeeForm.login} onChange={(event) => setEmployeeForm({ ...employeeForm, login: event.target.value })} required /></label>
          <label>PIN<input value={employeeForm.pin_code} onChange={(event) => setEmployeeForm({ ...employeeForm, pin_code: event.target.value })} required /></label>
          <button className="primary" type="submit">Добавить</button>
        </form>

        <form className="form card" onSubmit={addTask}>
          <h2>Добавить задачу</h2>
          <label>Название<input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required /></label>
          <label>Описание<textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} /></label>
          <button className="primary" type="submit">Добавить</button>
        </form>
      </div>

      <div className="table-card">
        <h2>Статусы выполнения</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Задача</th>
                <th>Статус</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => {
                const status = row.task_status?.find((item) => item.work_date === today) || row.task_status?.[0];
                return (
                  <tr key={row.id}>
                    <td>{row.employees?.name}</td>
                    <td>{row.tasks?.title}</td>
                    <td>{status?.is_done ? 'Выполнено' : 'Не выполнено'}</td>
                    <td>{status?.comment || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
