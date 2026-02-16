const STORAGE_KEYS = {
    TASKS: 'focusflow_tasks',
    NOTES: 'focusflow_notes',
    HABITS: 'focusflow_habits',
    HABIT_LOGS: 'focusflow_habit_logs',
    THEME: 'focusflow_theme',
    TIMER_SESSIONS: 'focusflow_timer_sessions',
    STREAK: 'focusflow_streak',
    LAST_STREAK_DATE: 'focusflow_last_streak_date'
};

let tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]');
let notes = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES) || '[]');
let habits = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABITS) || '[]');
let habitLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.HABIT_LOGS) || '{}');
let timerInterval = null;
let timerSecondsLeft = 25 * 60;
let timerMode = 'work';
const TIMER_MODES = { work: 25 * 60, short: 5 * 60, long: 15 * 60 };
const HABIT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16'];

// Normalize tasks (order, tags) for backwards compatibility
tasks = tasks.map((t, i) => ({
    ...t,
    order: t.order ?? i,
    tags: Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' && t.tags.trim() ? t.tags.split(',').map(s => s.trim()).filter(Boolean) : [])
}));

function saveToStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.querySelector('.app').setAttribute('data-theme', saved);
}

function toggleTheme() {
    const app = document.querySelector('.app');
    const current = app.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    app.setAttribute('data-theme', next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEYS.THEME, next);
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${view}`).classList.add('active');
            if (view === 'dashboard') updateDashboard();
            if (view === 'habits') renderHabits();
        });
    });
}

function updateDateDisplay() {
    const el = document.getElementById('dateDisplay');
    if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function updateDashboard() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const upcoming = tasks
        .filter(t => !t.completed && t.dueDate)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 5);

    document.getElementById('dashTotalTasks').textContent = total;
    document.getElementById('dashCompletedTasks').textContent = completed;
    document.getElementById('dashNotesCount').textContent = notes.length;
    document.getElementById('taskCount').textContent = tasks.filter(t => !t.completed).length;

    let streak = parseInt(localStorage.getItem(STORAGE_KEYS.STREAK) || '0', 10);
    const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_STREAK_DATE);
    const today = getTodayKey();
    if (lastDate) {
        const last = new Date(lastDate);
        const now = new Date();
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            // already updated today
        } else if (diffDays === 1) {
            streak += 1;
            localStorage.setItem(STORAGE_KEYS.STREAK, String(streak));
            localStorage.setItem(STORAGE_KEYS.LAST_STREAK_DATE, today);
        } else {
            streak = 1;
            localStorage.setItem(STORAGE_KEYS.STREAK, '1');
            localStorage.setItem(STORAGE_KEYS.LAST_STREAK_DATE, today);
        }
    } else {
        streak = 1;
        localStorage.setItem(STORAGE_KEYS.STREAK, '1');
        localStorage.setItem(STORAGE_KEYS.LAST_STREAK_DATE, today);
    }
    document.getElementById('dashStreak').textContent = streak;

    const container = document.getElementById('upcomingTasks');
    if (upcoming.length === 0) {
        container.innerHTML = '<div class="empty-state">No upcoming tasks</div>';
    } else {
        container.innerHTML = upcoming.map(t => `
            <div class="upcoming-task-item" data-id="${t.id}">
                <input type="checkbox" ${t.completed ? 'checked' : ''} data-id="${t.id}">
                <span class="task-title">${escapeHtml(t.title)}</span>
                <span class="task-due">${formatDate(t.dueDate)}</span>
                <span class="priority-badge ${t.priority || 'medium'}">${(t.priority || 'medium')}</span>
            </div>
        `).join('');
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const task = tasks.find(t => t.id === id);
                if (task) {
                    task.completed = e.target.checked;
                    saveToStorage(STORAGE_KEYS.TASKS, tasks);
                    updateDashboard();
                    renderTasks();
                }
            });
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderTasks() {
    const filter = document.getElementById('taskFilter').value;
    const sort = document.getElementById('taskSort').value;
    let list = [...tasks];

    if (filter === 'active') list = list.filter(t => !t.completed);
    else if (filter === 'completed') list = list.filter(t => t.completed);

    if (sort === 'date') list.sort((a, b) => (new Date(a.dueDate || 0)) - (new Date(b.dueDate || 0)));
    else if (sort === 'priority') {
        const order = { high: 0, medium: 1, low: 2 };
        list.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
    } else list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    const container = document.getElementById('tasksList');
    document.getElementById('taskCount').textContent = tasks.filter(t => !t.completed).length;

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No tasks</div>';
        return;
    }

    container.innerHTML = list.map(t => `
        <div class="task-item ${t.completed ? 'completed' : ''}" data-id="${t.id}">
            <input type="checkbox" ${t.completed ? 'checked' : ''} data-id="${t.id}">
            <div class="task-item-content">
                <div class="task-item-title">${escapeHtml(t.title)}</div>
                <div class="task-item-meta">
                    ${t.dueDate ? `<span>${formatDate(t.dueDate)}</span>` : ''}
                    <span class="priority-badge ${t.priority || 'medium'}">${(t.priority || 'medium')}</span>
                </div>
            </div>
            <div class="task-item-actions">
                <button class="edit-btn" data-id="${t.id}" title="Edit">✎</button>
                <button class="delete-btn" data-id="${t.id}" title="Delete">🗑</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const task = tasks.find(t => t.id === e.target.dataset.id);
            if (task) {
                task.completed = e.target.checked;
                saveToStorage(STORAGE_KEYS.TASKS, tasks);
                renderTasks();
                updateDashboard();
            }
        });
    });
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openTaskModal(tasks.find(t => t.id === e.target.dataset.id)));
    });
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            tasks = tasks.filter(t => t.id !== e.target.dataset.id);
            saveToStorage(STORAGE_KEYS.TASKS, tasks);
            renderTasks();
            updateDashboard();
        });
    });
}

function openTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    document.getElementById('taskModalTitle').textContent = task ? 'Edit task' : 'Add task';
    document.getElementById('taskId').value = task ? task.id : '';
    document.getElementById('taskTitle').value = task ? task.title : '';
    document.getElementById('taskDescription').value = task ? (task.description || '') : '';
    document.getElementById('taskDueDate').value = task && task.dueDate ? task.dueDate.slice(0, 10) : '';
    document.getElementById('taskPriority').value = task ? (task.priority || 'medium') : 'medium';
    document.getElementById('modalOverlay').classList.add('active');
    modal.classList.add('active');
}

function saveTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const task = {
        id: id || generateId(),
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim(),
        dueDate: document.getElementById('taskDueDate').value || null,
        priority: document.getElementById('taskPriority').value,
        completed: id ? (tasks.find(t => t.id === id)?.completed ?? false) : false
    };
    if (!id) tasks.push(task);
    else {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx !== -1) tasks[idx] = task;
    }
    saveToStorage(STORAGE_KEYS.TASKS, tasks);
    closeModals();
    renderTasks();
    updateDashboard();
}

function renderNotes() {
    const query = document.getElementById('notesSearch').value.toLowerCase().trim();
    let list = notes;
    if (query) list = notes.filter(n => (n.title + ' ' + (n.content || '')).toLowerCase().includes(query));
    list = [...list].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const container = document.getElementById('notesGrid');
    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No notes</div>';
        return;
    }
    container.innerHTML = list.map(n => `
        <div class="note-card" data-id="${n.id}">
            <div class="note-card-title">${escapeHtml(n.title)}</div>
            <div class="note-card-content">${escapeHtml((n.content || '').slice(0, 200))}</div>
            <div class="note-card-date">${formatDate(n.updatedAt || n.createdAt)}</div>
            <div class="note-card-actions">
                <button class="edit" data-id="${n.id}">Edit</button>
                <button class="delete" data-id="${n.id}">Delete</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) openNoteModal(notes.find(n => n.id === card.dataset.id));
        });
    });
    container.querySelectorAll('.note-card-actions .edit').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openNoteModal(notes.find(n => n.id === btn.dataset.id)); });
    });
    container.querySelectorAll('.note-card-actions .delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            notes = notes.filter(n => n.id !== btn.dataset.id);
            saveToStorage(STORAGE_KEYS.NOTES, notes);
            renderNotes();
            updateDashboard();
        });
    });
}

function openNoteModal(note = null) {
    document.getElementById('noteModalTitle').textContent = note ? 'Edit note' : 'New note';
    document.getElementById('noteId').value = note ? note.id : '';
    document.getElementById('noteTitle').value = note ? note.title : '';
    document.getElementById('noteContent').value = note ? (note.content || '') : '';
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('noteModal').classList.add('active');
}

function saveNote(e) {
    e.preventDefault();
    const id = document.getElementById('noteId').value;
    const now = new Date().toISOString();
    const note = {
        id: id || generateId(),
        title: document.getElementById('noteTitle').value.trim(),
        content: document.getElementById('noteContent').value.trim(),
        createdAt: id ? (notes.find(n => n.id === id)?.createdAt || now) : now,
        updatedAt: now
    };
    if (!id) notes.push(note);
    else {
        const idx = notes.findIndex(n => n.id === id);
        if (idx !== -1) notes[idx] = note;
    }
    saveToStorage(STORAGE_KEYS.NOTES, notes);
    closeModals();
    renderNotes();
    updateDashboard();
}

function getTimerSessionsToday() {
    const key = getTodayKey();
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMER_SESSIONS) || '{}');
    return data[key] || 0;
}

function incrementTimerSessions() {
    const key = getTodayKey();
    const data = JSON.parse(localStorage.getItem(STORAGE_KEYS.TIMER_SESSIONS) || '{}');
    data[key] = (data[key] || 0) + 1;
    localStorage.setItem(STORAGE_KEYS.TIMER_SESSIONS, JSON.stringify(data));
    document.getElementById('sessionsCount').textContent = data[key];
}

function updateTimerDisplay() {
    const m = Math.floor(timerSecondsLeft / 60);
    const s = timerSecondsLeft % 60;
    document.getElementById('timerMinutes').textContent = String(m).padStart(2, '0');
    document.getElementById('timerSeconds').textContent = String(s).padStart(2, '0');
}

function startTimer() {
    if (timerInterval) return;
    const btn = document.getElementById('timerStart');
    btn.textContent = 'Pause';
    btn.dataset.action = 'pause';
    timerInterval = setInterval(() => {
        timerSecondsLeft--;
        updateTimerDisplay();
        if (timerSecondsLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            btn.textContent = 'Start';
            btn.dataset.action = 'start';
            if (timerMode === 'work') {
                incrementTimerSessions();
                const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
                try { audio.play().catch(() => {}); } catch (_) {}
            }
            timerSecondsLeft = TIMER_MODES[timerMode];
            updateTimerDisplay();
        }
    }, 1000);
}

function pauseTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    document.getElementById('timerStart').textContent = 'Start';
    document.getElementById('timerStart').dataset.action = 'start';
}

function resetTimer() {
    pauseTimer();
    timerSecondsLeft = TIMER_MODES[timerMode];
    updateTimerDisplay();
}

function initTimer() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            timerMode = btn.dataset.mode;
            pauseTimer();
            timerSecondsLeft = TIMER_MODES[timerMode];
            updateTimerDisplay();
        });
    });
    document.getElementById('timerStart').addEventListener('click', () => {
        if (document.getElementById('timerStart').dataset.action === 'pause') pauseTimer();
        else startTimer();
    });
    document.getElementById('timerReset').addEventListener('click', resetTimer);
    document.getElementById('sessionsCount').textContent = getTimerSessionsToday();
    updateTimerDisplay();
}

function getDaysInMonth(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let d = 1; d <= last.getDate(); d++) {
        days.push(new Date(year, month, d));
    }
    return days;
}

function renderHabits() {
    const now = new Date();
    const days = getDaysInMonth(now.getFullYear(), now.getMonth());
    const header = document.getElementById('habitsCalendarHeader');
    header.innerHTML = '<span class="habit-name" style="min-width:160px">Habit</span>' +
        '<div class="habits-days" style="display:flex;gap:6px;flex:1">' +
        days.map(d => `<span class="calendar-day" style="min-width:32px" title="${d.toLocaleDateString()}">${d.getDate()}</span>`).join('') +
        '</div>';

    const container = document.getElementById('habitsList');
    if (habits.length === 0) {
        container.innerHTML = '<div class="empty-state">No habits</div>';
        return;
    }

    container.innerHTML = habits.map(h => {
        const dots = days.map(d => {
            const key = d.toISOString().slice(0, 10);
            const checked = (habitLogs[h.id] || {})[key];
            return `<div class="habit-dot ${checked ? 'checked' : ''}" data-habit="${h.id}" data-date="${key}" style="background: ${checked ? h.color : 'transparent'}; border-color: ${h.color};"></div>`;
        }).join('');
        return `
            <div class="habit-row" data-id="${h.id}">
                <span class="habit-name">${escapeHtml(h.name)}</span>
                <div class="habit-dots">${dots}</div>
                <div class="habit-actions">
                    <button data-id="${h.id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.habit-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const habitId = dot.dataset.habit;
            const date = dot.dataset.date;
            if (!habitLogs[habitId]) habitLogs[habitId] = {};
            habitLogs[habitId][date] = !habitLogs[habitId][date];
            saveToStorage(STORAGE_KEYS.HABIT_LOGS, habitLogs);
            renderHabits();
        });
    });
    container.querySelectorAll('.habit-actions button').forEach(btn => {
        btn.addEventListener('click', () => {
            habits = habits.filter(h => h.id !== btn.dataset.id);
            delete habitLogs[btn.dataset.id];
            saveToStorage(STORAGE_KEYS.HABITS, habits);
            saveToStorage(STORAGE_KEYS.HABIT_LOGS, habitLogs);
            renderHabits();
            updateDashboard();
        });
    });
}

function openHabitModal(habit = null) {
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit habit' : 'Add habit';
    document.getElementById('habitId').value = habit ? habit.id : '';
    document.getElementById('habitName').value = habit ? habit.name : '';
    const picker = document.getElementById('habitColorPicker');
    picker.innerHTML = HABIT_COLORS.map(c => `
        <button type="button" class="color-option ${habit && habit.color === c ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>
    `).join('');
    if (!habit) picker.querySelector('.color-option').classList.add('selected');
    picker.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            picker.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('habitModal').classList.add('active');
}

function saveHabit(e) {
    e.preventDefault();
    const id = document.getElementById('habitId').value;
    const selectedColor = document.querySelector('#habitColorPicker .color-option.selected');
    const color = selectedColor ? selectedColor.dataset.color : HABIT_COLORS[0];
    const habit = {
        id: id || generateId(),
        name: document.getElementById('habitName').value.trim(),
        color
    };
    if (!id) habits.push(habit);
    else {
        const idx = habits.findIndex(h => h.id === id);
        if (idx !== -1) habits[idx] = habit;
    }
    saveToStorage(STORAGE_KEYS.HABITS, habits);
    closeModals();
    renderHabits();
    updateDashboard();
}

function closeModals() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModals();
});
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', closeModals);
});

document.getElementById('taskForm').addEventListener('submit', saveTask);
document.getElementById('noteForm').addEventListener('submit', saveNote);
document.getElementById('habitForm').addEventListener('submit', saveHabit);

document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal());
document.getElementById('addNoteBtn').addEventListener('click', () => openNoteModal());
document.getElementById('addHabitBtn').addEventListener('click', () => openHabitModal());

document.getElementById('taskFilter').addEventListener('change', renderTasks);
document.getElementById('taskSort').addEventListener('change', renderTasks);
document.getElementById('notesSearch').addEventListener('input', renderNotes);

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

initTheme();
updateDateDisplay();
initNavigation();
initTimer();
updateDashboard();
renderTasks();
renderNotes();
renderHabits();

setInterval(updateDateDisplay, 60000);
