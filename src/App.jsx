import { useMemo, useState } from 'react';
import './App.css';

const initialEmployees = [
  { id: 1, name: 'Иван Петров', role: 'Мастер участка' },
  { id: 2, name: 'Сергей Иванов', role: 'Электромонтажник' },
  { id: 3, name: 'Алексей Смирнов', role: 'Техник' },
];

const initialTasks = [
  {
    id: 1,
    employeeId: 1,
    title: 'Проверить журнал заявок',
    description: 'Открыть список заявок, отметить срочные позиции и передать их в работу.',
    dueDate: 'Сегодня',
    done: false,
    comment: '',
  },
  {
    id: 2,
    employeeId: 1,
    title: 'Проверить выполнение работ за вчера',
    description: 'Сверить план и фактическое выполнение по участку.',
    dueDate: 'Сегодня',
    done: true,
    comment: 'Проверено, одна задача перенесена.',
  },
  {
    id: 3,
    employeeId: 2,
    title: 'Осмотреть щит освещения',
    description: 'Проверить визуально состояние автоматики, маркировку и наличие замечаний.',
    dueDate: 'Сегодня',
    done: false,
    comment: '',
  },
  {
    id: 4,
    employeeId: 2,
    title: 'Передать фотоотчёт',
    description: 'Загрузить фотографии выполненных работ в общий чат.',
    dueDate: 'Сегодня',
    done: false,
    comment: '',
  },
  {
    id: 5,
    employeeId: 3,
    title: 'Проверить складские остатки',
    description: 'Сверить наличие расходных материалов и записать недостающее.',
    dueDate: 'Сегодня',
    done: false,
    comment: '',
  },
];

function App() {
  const [screen, setScreen] = useState('home');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(1);
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('task-site-tasks');
    return saved ? JSON.parse(saved) : initialTasks;
  });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskEmployeeId, setNewTaskEmployeeId] = useState(1);

  const selectedEmployee = useMemo(
    () => initialEmployees.find((employee) => employee.id === selectedEmployeeId),
    [selectedEmployeeId]
  );

  const employeeTasks = useMemo(
    () => tasks.filter((task) => task.employeeId === selectedEmployeeId),
    [tasks, selectedEmployeeId]
  );

  const completedCount = tasks.filter((task) => task.done).length;
  const totalCount = tasks.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  function saveTasks(nextTasks) {
    setTasks(nextTasks);
    localStorage.setItem('task-site-tasks', JSON.stringify(nextTasks));
  }

  function toggleTask(taskId) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    saveTasks(nextTasks);
  }

  function updateComment(taskId, comment) {
    const nextTasks = tasks.map((task) =>
      task.id === taskId ? { ...task, comment } : task
    );
    saveTasks(nextTasks);
  }

  function addTask(event) {
    event.preventDefault();

    if (!newTaskTitle.trim()) {
      return;
    }

    const nextTask = {
      id: Date.now(),
      employeeId: Number(newTaskEmployeeId),
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || 'Описание не заполнено.',
      dueDate: 'Сегодня',
      done: false,
      comment: '',
    };

    saveTasks([nextTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDescription('');
  }

  function resetDemoData() {
    saveTasks(initialTasks);
    setSelectedEmployeeId(1);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Тестовый сайт</p>
          <h1>Задачи сотрудников</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={() => setScreen('home')}>Главная</button>
          <button className="ghost-button" onClick={() => setScreen('employee')}>Сотрудник</button>
          <button className="primary-button" onClick={() => setScreen('admin')}>Админ</button>
        </div>
      </header>

      {screen === 'home' && (
        <section className="hero card">
          <div>
            <p className="eyebrow">Первая рабочая версия</p>
            <h2>Проверяем сценарий: задача → выполнение → контроль</h2>
            <p>
              Это локальный тестовый сайт. Данные пока хранятся в браузере на этом компьютере.
              Следующим шагом подключим базу данных Supabase и разместим сайт на хостинге.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setScreen('employee')}>Войти как сотрудник</button>
              <button className="secondary-button" onClick={() => setScreen('admin')}>Войти как админ</button>
            </div>
          </div>
          <div className="stats-card">
            <span>Выполнено</span>
            <strong>{progress}%</strong>
            <p>{completedCount} из {totalCount} задач закрыто</p>
          </div>
        </section>
      )}

      {screen === 'employee' && (
        <section className="layout-grid">
          <aside className="card sidebar-card">
            <p className="eyebrow">Выбор сотрудника</p>
            <h2>Кабинет сотрудника</h2>
            <label className="field-label" htmlFor="employee-select">Сотрудник</label>
            <select
              id="employee-select"
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(Number(event.target.value))}
            >
              {initialEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
            <p className="muted-text">{selectedEmployee?.role}</p>
          </aside>

          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Сегодня</p>
                <h2>Мои задачи</h2>
              </div>
              <span className="badge">{employeeTasks.length} задач</span>
            </div>

            <div className="task-list">
              {employeeTasks.map((task) => (
                <article key={task.id} className={`task-card ${task.done ? 'is-done' : ''}`}>
                  <div className="task-main">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleTask(task.id)}
                      />
                      <span>{task.title}</span>
                    </label>
                    <p>{task.description}</p>
                  </div>
                  <textarea
                    value={task.comment}
                    onChange={(event) => updateComment(task.id, event.target.value)}
                    placeholder="Комментарий по выполнению"
                  />
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {screen === 'admin' && (
        <section className="layout-grid admin-grid">
          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Администратор</p>
                <h2>Добавить задачу</h2>
              </div>
            </div>

            <form className="task-form" onSubmit={addTask}>
              <label className="field-label" htmlFor="task-employee">Сотрудник</label>
              <select
                id="task-employee"
                value={newTaskEmployeeId}
                onChange={(event) => setNewTaskEmployeeId(Number(event.target.value))}
              >
                {initialEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>

              <label className="field-label" htmlFor="task-title">Название задачи</label>
              <input
                id="task-title"
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder="Например: проверить оборудование"
              />

              <label className="field-label" htmlFor="task-description">Описание</label>
              <textarea
                id="task-description"
                value={newTaskDescription}
                onChange={(event) => setNewTaskDescription(event.target.value)}
                placeholder="Что именно нужно сделать"
              />

              <button className="primary-button" type="submit">Добавить задачу</button>
            </form>
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Контроль</p>
                <h2>Статус выполнения</h2>
              </div>
              <button className="ghost-button" onClick={resetDemoData}>Сбросить демо</button>
            </div>

            <div className="status-list">
              {tasks.map((task) => {
                const employee = initialEmployees.find((item) => item.id === task.employeeId);
                return (
                  <article key={task.id} className="status-row">
                    <div>
                      <strong>{task.title}</strong>
                      <p>{employee?.name} · {task.comment || 'Комментарий не заполнен'}</p>
                    </div>
                    <span className={`status-pill ${task.done ? 'done' : 'pending'}`}>
                      {task.done ? 'Выполнено' : 'В работе'}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}

export default App;
