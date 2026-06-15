"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Image from "next/image";
import styles from "./page.module.css";

const API_URL = "http://localhost:3000";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const SORT_OPTIONS = [
  { value: "", label: "Sort by" },
  { value: "createdAt", label: "Created date" },
  { value: "updatedAt", label: "Updated date" },
  { value: "dueDate", label: "Due date" },
  { value: "priority", label: "Priority" },
];

function CustomSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(
      Math.max(0, options.findIndex((o) => o.value === value))
  );
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((s) => !s);
  }

  function pick(idx) {
    const val = options[idx];
    if (val) {
      onChange(val.value);
    }
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(highlight);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
      <div className={styles.customSelect} ref={ref}>
        <div
            tabIndex={0}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            className={styles.csToggle}
            onClick={toggle}
            onKeyDown={onKey}
        >
          <span>{options.find((o) => o.value === value)?.label ?? value}</span>
          <span className={styles.csArrow} />
        </div>

        {open && (
            <div role="listbox" className={styles.csOptions} tabIndex={-1}>
              {options.map((opt, idx) => (
                  <div
                      key={opt.value}
                      role="option"
                      aria-selected={opt.value === value}
                      className={`${styles.csOption} ${
                          opt.value === value ? styles.csOptionSelected : ""
                      } ${highlight === idx ? styles.csOptionActive : ""}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => pick(idx)}
                  >
                    {opt.label}
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [description, setDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");

  const statusFilterRef = useRef(statusFilter);
  const searchRef = useRef(search);
  const sortRef = useRef(sort);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);


  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Request failed.");
    }

    return result;
  }

  const loadTasks = useCallback(async (filter = statusFilterRef.current, showLoading = true, searchValue = searchRef.current, sortValue = sortRef.current) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      setError("");

      const params = new URLSearchParams();

      if (filter) params.set("status", filter);
      if (searchValue.trim()) params.set("search", searchValue.trim());
      if (sortValue) params.set("sort", sortValue);

      const query = params.toString();

      const url = query ? `${API_URL}/tasks?${query}` : `${API_URL}/tasks`;

      const result = await requestJson(url);

      setTasks(result.tasks);
    } catch (error) {
      setError(error.message || "Failed to load tasks.");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  async function addTask(event) {
    event.preventDefault();

    const trimmedDescription = description.trim();

    if (!trimmedDescription) return;

    try {
      setError("");

      await requestJson(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmedDescription,
          dueDate: dueDate || null,
          priority,
        }),
      });

      setDescription("");
      setDueDate("");
      setPriority("medium");
      await loadTasks(statusFilter, false);
    } catch (error) {
      setError(error.message || "Failed to add task.");
    }
  }

  async function updateTask(id) {
    const newDescription = window.prompt("Enter new task description:");

    if (!newDescription || !newDescription.trim()) return;

    try {
      setError("");

      const result = await requestJson(`${API_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: newDescription.trim() }),
      });

      setTasks((currentTasks) =>
          currentTasks.map((task) =>
              task.id === id ? result.task : task
          )
      );
    } catch (error) {
      setError(error.message || "Failed to update task.");
    }
  }

  async function deleteTask(id) {
    try {
      setError("");

      await requestJson(`${API_URL}/tasks/${id}`, {
        method: "DELETE",
      });

      setTasks((currentTasks) =>
          currentTasks.filter((task) => task.id !== id)
      );
    } catch (error) {
      setError(error.message || "Failed to delete task.");
    }
  }

  async function markTask(id, status) {
    try {
      setError("");

      const result = await requestJson(`${API_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      setTasks((currentTasks) => {
        if (statusFilter && result.task.status !== statusFilter) {
          return currentTasks.filter((task) => task.id !== id);
        }

        return currentTasks.map((task) =>
            task.id === id ? result.task : task
        );
      });
    } catch (error) {
      setError(error.message || "Failed to update task status.");
    }
  }

  async function clearDoneTasks() {
    try {
      setError("");

      await requestJson(`${API_URL}/tasks/done`, {
        method: "DELETE",
      });

      await loadTasks(statusFilter, false);
    } catch (error) {
      setError(error.message || "Failed to clear done tasks.");
    }
  }

  function getPriorityClass(priority) {
    if (priority === "low") return styles.priorityLow;
    if (priority === "high") return styles.priorityHigh;
    return styles.priorityMedium;
  }

  function changeFilter(filter) {
    setStatusFilter(filter);
    loadTasks(filter, false);
  }

  const loadTasksRef = useRef(loadTasks);
  useEffect(() => {
    loadTasksRef.current = loadTasks;
  }, [loadTasks]);

  useEffect(() => {
    // Defer first load to avoid sync state updates in the effect body.
    const timeoutId = setTimeout(() => {
      loadTasksRef.current("");
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  const dateInputRef = useRef(null);
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    // start with month of current dueDate or today
    const d = dueDate ? new Date(dueDate) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  function openDatePicker() {
    // toggle custom calendar popup positioned under the icon
    setDateCalendarOpen((s) => {
      const next = !s;
      if (next) {
        // ensure calendar month matches current dueDate
        const d = dueDate ? new Date(dueDate) : new Date();
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      return next;
    });
  }

  function onDateMouseDown(e) {
    // Prevent native picker from opening on mouse down, but make input editable and focusable
    e.preventDefault();
    if (dateInputRef.current) {
      dateInputRef.current.readOnly = false;
      dateInputRef.current.focus();
    }
  }

  function onDateFocus() {
    if (dateInputRef.current) {
      dateInputRef.current.readOnly = false;
    }
  }

  function onDateBlur() {
    // revert to readOnly to avoid accidental picker triggers; value remains editable via icon or focus again
    if (dateInputRef.current) {
      dateInputRef.current.readOnly = true;
    }
    setDateCalendarOpen(false);
  }

  // build calendar days for the currently set calendarMonth
  function buildCalendarDays(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    // We want calendar starting from Monday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    // previous month's tail
    const prevMonthDays = startDay;
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = prevMonthDays - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDate - i),
        currentMonth: false,
      });
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), currentMonth: true });
    }
    // next month fill to complete weeks (7-day rows)
    while (days.length % 7 !== 0) {
      const nextIndex = days.length - (prevMonthDays + daysInMonth) + 1;
      days.push({ date: new Date(year, month + 1, nextIndex), currentMonth: false });
    }
    return days;
  }

  function formatDateISO(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function onCalendarPrev() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  function onCalendarNext() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  function onCalendarPick(date) {
    setDueDate(formatDateISO(date));
    setDateCalendarOpen(false);
    // keep input readOnly true
    if (dateInputRef.current) dateInputRef.current.readOnly = true;
  }

  // close calendar when clicking outside
  const dateWrapperRef = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (dateWrapperRef.current && !dateWrapperRef.current.contains(e.target)) {
        setDateCalendarOpen(false);
        // ensure legacy references removed: use dateCalendarOpen as single source
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>
            Task Tracker
            <Image src="/bow.png" alt="bow" width={28} height={28} className={styles.bow} />
          </h1>

          <p className={styles.subtitle}>
            A soft little productivity space for planning, updating, and finishing your tasks.
          </p>

          <form className={styles.form} onSubmit={addTask}>
            <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add a task..."
                className={styles.input}
            />

            <div className={styles.dateWrapper} ref={dateWrapperRef}>
              <input
                  ref={dateInputRef}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className={styles.dateInput}
                  readOnly
                  onMouseDown={onDateMouseDown}
                  onFocus={onDateFocus}
                  onBlur={onDateBlur}
              />
              <button
                  type="button"
                  aria-label="Open date picker"
                  onClick={openDatePicker}
                  className={styles.dateButton}
              />
              {dateCalendarOpen && (
                <div className={styles.dateCalendar} role="dialog" aria-modal="false">
                  <div className={styles.dateCalendarHeader}>
                    <button type="button" onClick={onCalendarPrev} aria-label="Previous month">◀</button>
                    <div className={styles.dateCalendarMonth}>{calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                    <button type="button" onClick={onCalendarNext} aria-label="Next month">▶</button>
                  </div>
                  <div className={styles.dateCalendarGrid}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                      <div key={d} className={styles.dateCalendarCellHeader}>{d}</div>
                    ))}
                    {buildCalendarDays(calendarMonth).map((dayObj) => {
                      const cls = [styles.dateCalendarCell];
                      if (!dayObj.currentMonth) cls.push(styles.dateCalendarCellFaint);
                      const isSelected = dueDate && dueDate === formatDateISO(dayObj.date);
                      if (isSelected) cls.push(styles.dateCalendarCellSelected);
                      return (
                        <button
                          key={dayObj.date.toISOString()}
                          type="button"
                          className={cls.join(' ')}
                          onClick={() => onCalendarPick(dayObj.date)}
                        >
                          {dayObj.date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <CustomSelect
                value={priority}
                onChange={(val) => setPriority(val)}
                options={PRIORITY_OPTIONS}
            />

            <button
                className={styles.addButton}
                disabled={!description.trim()}
            >
              Add
            </button>
          </form>

          <div className={styles.controls}>
            <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                className={styles.input}
            />

            <div style={{ minWidth: 180 }}>
              <CustomSelect
                value={sort}
                onChange={(val) => setSort(val)}
                options={SORT_OPTIONS}
              />
            </div>

            <button
                type="button"
                onClick={() => loadTasks(statusFilter, false)}
            >
              Apply
            </button>
          </div>


          <div className={styles.filters}>
            <button
                className={statusFilter === "" ? styles.activeFilter : ""}
                onClick={() => changeFilter("")}
            >
              All
            </button>

            <button
                className={statusFilter === "todo" ? styles.activeFilter : ""}
                onClick={() => changeFilter("todo")}
            >
              Todo
            </button>

            <button
                className={statusFilter === "in-progress" ? styles.activeFilter : ""}
                onClick={() => changeFilter("in-progress")}
            >
              In progress
            </button>

            <button
                className={statusFilter === "done" ? styles.activeFilter : ""}
                onClick={() => changeFilter("done")}
            >
              Done
            </button>

            <button
                type="button"
                className={styles.clearDoneButton}
                onClick={clearDoneTasks}
            >
              Clear done
            </button>

          </div>

          {loading && <p className={styles.message}>Loading tasks...</p>}

          {error && <p className={styles.error}>{error}</p>}

          {!loading && !error && tasks.length === 0 && (
              <p className={styles.emptyState}>
                {statusFilter
                    ? `No tasks with status "${statusFilter}" yet.`
                    : "No tasks yet. Add your first task above."}
              </p>
          )}

          <ul className={styles.list}>
            {tasks.map((task) => (
                <li key={task.id} className={styles.taskItem}>
                  <div>
                    <p className={styles.taskDescription}>{task.description}</p>

                    <div className={styles.meta}>
                        <span className={`${styles.status} ${styles[task.status]}`}>
                              {task.status}
                            </span>
                      <span className={`${styles.priority} ${getPriorityClass(task.priority)}`}>
                          {task.priority || "medium"}
                        </span>

                      {task.dueDate && (
                          <span className={styles.dueDate}>
                                 Due: {task.dueDate}
                          </span>
                      )}
                    </div>

                  </div>

                  <div className={styles.actions}>
                    <button onClick={() => markTask(task.id, "todo")}>
                      Todo
                    </button>

                    <button onClick={() => markTask(task.id, "in-progress")}>
                      In progress
                    </button>

                    <button onClick={() => markTask(task.id, "done")}>
                      Done
                    </button>

                    <button onClick={() => updateTask(task.id)}>
                      Edit
                    </button>

                    <button
                        className={styles.deleteButton}
                        onClick={() => deleteTask(task.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
            ))}
          </ul>
        </section>
      </main>
  );
}