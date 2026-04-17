/* ============================================================
   Bella Terra Timecard — Core App Logic
   File: /timecard/app.js
   Handles: login, clock in/out, breaks, weekly hours, storage.

   DATA NOTE: All data is stored in localStorage (your browser).
   This means data only exists in the browser where it was entered.
   See the bottom of this file for "Step 2 — Connect a real database".
   ============================================================ */


/* ── STORAGE KEY ──────────────────────────────────────────────
   All timecard data is saved under one key in localStorage.
   Think of it as a filing cabinet drawer just for timecards. */
var TC_KEY = 'bellaterra_timecard_v1';


/* ── VALID EMPLOYEES ──────────────────────────────────────────
   These are the names and passwords employees use to log in.
   To add a new employee: copy one line and change the name/password.
   NOTE: For a production system, passwords should live on a server.
   This is fine for the starter / internal-only version. */
var VALID_EMPLOYEES = [
  { name: 'Rena Bellika',    password: 'rena2026',    role: 'admin' },
  { name: 'Brydon Bellika',  password: 'brydon2026',  role: 'admin' },
  { name: 'Employee One',    password: 'emp1pass',    role: 'employee' },
  { name: 'Employee Two',    password: 'emp2pass',    role: 'employee' },
  { name: 'Employee Three',  password: 'emp3pass',    role: 'employee' }
];


/* ── JOB LIST ─────────────────────────────────────────────────
   These appear in the "Job" dropdown when clocking in.
   To add a job: copy a line and change the text. */
var JOB_LIST = [
  'Olympic Discovery Trail',
  'OR-217 Sound Wall',
  'Hydroseeding — General',
  'Bark Blowing — General',
  'Nursery Work',
  'Office / Admin',
  'Equipment Maintenance',
  'Other / Misc'
];


/* ──────────────────────────────────────────────────────────────
   HELPER: read / write all timecard data from localStorage
   ────────────────────────────────────────────────────────────── */

/* Load all timecard data. Returns an object with employees and entries. */
function tcLoad() {
  try {
    return JSON.parse(localStorage.getItem(TC_KEY)) || { entries: [] };
  } catch (e) {
    return { entries: [] };
  }
}

/* Save all timecard data back to localStorage. */
function tcSave(data) {
  localStorage.setItem(TC_KEY, JSON.stringify(data));
}

/* Load just the entries array (shortcut). */
function tcGetEntries() {
  return tcLoad().entries || [];
}

/* Save an updated entries array. */
function tcSaveEntries(entries) {
  var data = tcLoad();
  data.entries = entries;
  tcSave(data);
}


/* ──────────────────────────────────────────────────────────────
   HELPER: current logged-in employee
   ────────────────────────────────────────────────────────────── */

/* Save who is logged in (just their name, role, and login time). */
function tcSetSession(name, role) {
  sessionStorage.setItem('tc_user', JSON.stringify({ name: name, role: role }));
}

/* Get the current session. Returns null if no one is logged in. */
function tcGetSession() {
  try {
    return JSON.parse(sessionStorage.getItem('tc_user')) || null;
  } catch (e) {
    return null;
  }
}

/* Log the current user out and go back to the login page. */
function tcLogout() {
  sessionStorage.removeItem('tc_user');
  window.location.href = 'index.html';
}


/* ──────────────────────────────────────────────────────────────
   HELPER: time formatting
   ────────────────────────────────────────────────────────────── */

/* Format a Date object as "HH:MM AM/PM" for display. */
function tcFormatTime(date) {
  var d = date instanceof Date ? date : new Date(date);
  var h = d.getHours(), m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

/* Format a timestamp as "Mon 7/14" for the weekly view. */
function tcFormatDayLabel(date) {
  var d = date instanceof Date ? date : new Date(date);
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
}

/* Convert milliseconds to "X hrs Y min" string. */
function tcFormatDuration(ms) {
  if (!ms || ms < 0) return '0 hrs 0 min';
  var totalMin = Math.floor(ms / 60000);
  var hrs = Math.floor(totalMin / 60);
  var min = totalMin % 60;
  return hrs + ' hrs ' + min + ' min';
}

/* Convert milliseconds to a decimal hours number like 7.5. */
function tcMsToHrs(ms) {
  if (!ms || ms < 0) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}


/* ──────────────────────────────────────────────────────────────
   CLOCK IN / OUT / BREAK LOGIC
   ────────────────────────────────────────────────────────────── */

/* Find the currently open (not clocked out) entry for a given employee.
   Returns the entry object or null. */
function tcGetOpenEntry(employeeName) {
  var entries = tcGetEntries();
  for (var i = entries.length - 1; i >= 0; i--) {
    if (entries[i].employee === employeeName && !entries[i].clockOut) {
      return entries[i];
    }
  }
  return null;
}

/* Clock an employee IN.
   job = job name string, notes = optional string
   Returns the new entry object. */
function tcClockIn(employeeName, job, notes) {
  var entries = tcGetEntries();

  /* Create a new entry object.
     id = unique ID using timestamp.
     clockIn = timestamp (milliseconds since 1970 — standard JS date format).
     breaks = array of break objects { start, end }.
     status = 'in' | 'break' | 'out'. */
  var entry = {
    id:       'tc_' + Date.now(),
    employee: employeeName,
    job:      job || 'General',
    notes:    notes || '',
    clockIn:  Date.now(),
    clockOut: null,
    breaks:   [],
    status:   'in',
    date:     new Date().toISOString().split('T')[0],   /* YYYY-MM-DD */
    approved: false
  };

  entries.push(entry);
  tcSaveEntries(entries);
  return entry;
}

/* Clock an employee OUT.
   Closes the open entry, calculates total worked time minus breaks.
   Returns the updated entry. */
function tcClockOut(employeeName) {
  var entries = tcGetEntries();
  var found = null;

  for (var i = entries.length - 1; i >= 0; i--) {
    if (entries[i].employee === employeeName && !entries[i].clockOut) {
      found = entries[i];
      /* Close any open break first */
      if (found.status === 'break') {
        var lastBreak = found.breaks[found.breaks.length - 1];
        if (lastBreak && !lastBreak.end) {
          lastBreak.end = Date.now();
        }
      }
      found.clockOut = Date.now();
      found.status = 'out';
      /* Calculate total break time in milliseconds */
      var totalBreakMs = 0;
      found.breaks.forEach(function(b) {
        if (b.start && b.end) totalBreakMs += (b.end - b.start);
      });
      /* Worked time = total shift minus breaks */
      found.totalBreakMs = totalBreakMs;
      found.totalWorkedMs = (found.clockOut - found.clockIn) - totalBreakMs;
      break;
    }
  }

  tcSaveEntries(entries);
  return found;
}

/* Start a break.
   Adds a new break object with start time to the open entry. */
function tcStartBreak(employeeName) {
  var entries = tcGetEntries();
  for (var i = entries.length - 1; i >= 0; i--) {
    if (entries[i].employee === employeeName && !entries[i].clockOut) {
      entries[i].breaks.push({ start: Date.now(), end: null });
      entries[i].status = 'break';
      break;
    }
  }
  tcSaveEntries(entries);
}

/* End the current break.
   Finds the open break (no end time) and closes it. */
function tcEndBreak(employeeName) {
  var entries = tcGetEntries();
  for (var i = entries.length - 1; i >= 0; i--) {
    if (entries[i].employee === employeeName && !entries[i].clockOut) {
      var bks = entries[i].breaks;
      for (var j = bks.length - 1; j >= 0; j--) {
        if (!bks[j].end) {
          bks[j].end = Date.now();
          break;
        }
      }
      entries[i].status = 'in';
      break;
    }
  }
  tcSaveEntries(entries);
}


/* ──────────────────────────────────────────────────────────────
   WEEKLY HOURS CALCULATION
   ────────────────────────────────────────────────────────────── */

/* Get the start (Sunday) of the week containing a given date. */
function tcWeekStart(date) {
  var d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());   /* subtract day-of-week index (0=Sun) */
  return d;
}

/* Get all entries for a given employee for the current week.
   Returns an array of complete (clocked-out) entries. */
function tcGetWeekEntries(employeeName, weekStart) {
  var entries = tcGetEntries();
  var ws = weekStart || tcWeekStart(new Date());
  var we = new Date(ws); we.setDate(we.getDate() + 7);   /* week end = start + 7 days */

  return entries.filter(function(e) {
    if (e.employee !== employeeName) return false;
    var d = new Date(e.clockIn);
    return d >= ws && d < we;
  });
}

/* Calculate total worked hours for the week (completed entries only).
   Returns hours as a decimal number like 34.5. */
function tcWeekTotalHours(employeeName, weekStart) {
  var weekEntries = tcGetWeekEntries(employeeName, weekStart);
  var totalMs = 0;
  weekEntries.forEach(function(e) {
    if (e.clockOut) totalMs += (e.totalWorkedMs || 0);
  });
  return tcMsToHrs(totalMs);
}

/* Build a daily breakdown for the weekly view.
   Returns an array of 7 objects, one per day Sun–Sat. */
function tcWeekByDay(employeeName, weekStart) {
  var ws = weekStart || tcWeekStart(new Date());
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(ws);
    d.setDate(d.getDate() + i);
    var dateStr = d.toISOString().split('T')[0];

    var dayEntries = tcGetEntries().filter(function(e) {
      return e.employee === employeeName && e.date === dateStr && e.clockOut;
    });

    var dayMs = dayEntries.reduce(function(sum, e) { return sum + (e.totalWorkedMs || 0); }, 0);
    var jobNames = [...new Set(dayEntries.map(function(e) { return e.job; }))].join(', ');

    days.push({
      date:    dateStr,
      label:   tcFormatDayLabel(d),
      hours:   tcMsToHrs(dayMs),
      jobs:    jobNames,
      entries: dayEntries
    });
  }
  return days;
}


/* ──────────────────────────────────────────────────────────────
   LOGIN PAGE LOGIC
   (Only runs when you're on index.html)
   ────────────────────────────────────────────────────────────── */

/* Called when the login button is clicked. */
function tcDoLogin() {
  var nameEl  = document.getElementById('tc-login-name');
  var passEl  = document.getElementById('tc-login-pass');
  var errorEl = document.getElementById('tc-login-error');

  var name = nameEl.value.trim();
  var pass = passEl.value;

  /* Check the entered name+password against our VALID_EMPLOYEES list */
  var match = VALID_EMPLOYEES.find(function(e) {
    return e.name.toLowerCase() === name.toLowerCase() && e.password === pass;
  });

  if (!match) {
    errorEl.style.display = 'block';
    errorEl.textContent = 'Name or password is incorrect. Try again.';
    return;
  }

  /* Valid login — save the session and redirect */
  tcSetSession(match.name, match.role);

  /* Admins go to admin page, everyone else goes to dashboard */
  if (match.role === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'dashboard.html';
  }
}


/* ──────────────────────────────────────────────────────────────
   DASHBOARD PAGE LOGIC
   (Only runs when you're on dashboard.html)
   ────────────────────────────────────────────────────────────── */

var _clockInterval  = null;   /* timer for the live clock display */
var _elapsedInterval = null;  /* timer for elapsed worked-time display */

/* Called when dashboard.html finishes loading. */
function tcInitDashboard() {
  /* If no one is logged in, send them back to login */
  var session = tcGetSession();
  if (!session) { window.location.href = 'index.html'; return; }

  /* Show the employee's name in the header */
  var badgeEl = document.getElementById('tc-user-badge');
  if (badgeEl) badgeEl.textContent = session.name;

  /* Fill the Job dropdown with the JOB_LIST array */
  var jobSel = document.getElementById('tc-job-select');
  if (jobSel) {
    JOB_LIST.forEach(function(job) {
      var opt = document.createElement('option');
      opt.value = job;
      opt.textContent = job;
      jobSel.appendChild(opt);
    });
  }

  /* Start the live clock (updates every second) */
  tcStartLiveClock();

  /* Draw the current state (buttons, status, elapsed time) */
  tcRefreshDashboard();

  /* Draw the weekly hours section */
  tcRenderWeeklyView();
}

/* Start the live digital clock in the top of the dashboard. */
function tcStartLiveClock() {
  clearInterval(_clockInterval);
  function update() {
    var el = document.getElementById('tc-live-clock');
    if (!el) return;
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    el.textContent = h + ':' + (m<10?'0':'') + m + ':' + (s<10?'0':'') + s + ' ' + ampm;
  }
  update();
  _clockInterval = setInterval(update, 1000);
}

/* Refresh the button states, status badge, and elapsed time.
   Called after every clock in/out/break action. */
function tcRefreshDashboard() {
  var session = tcGetSession();
  if (!session) return;
  var openEntry = tcGetOpenEntry(session.name);

  var statusEl   = document.getElementById('tc-status-badge');
  var clockInBtn = document.getElementById('tc-btn-clockin');
  var clockOutBtn= document.getElementById('tc-btn-clockout');
  var breakStart = document.getElementById('tc-btn-break-start');
  var breakEnd   = document.getElementById('tc-btn-break-end');
  var elapsedEl  = document.getElementById('tc-elapsed');
  var jobRow     = document.getElementById('tc-job-row');    /* the job/notes fields */

  clearInterval(_elapsedInterval);

  if (!openEntry) {
    /* ── State: CLOCKED OUT ── */
    if (statusEl)   { statusEl.className = 'tc-status-badge out'; statusEl.textContent = 'Not clocked in'; }
    if (clockInBtn) clockInBtn.disabled = false;
    if (clockOutBtn)clockOutBtn.disabled = true;
    if (breakStart) breakStart.disabled = true;
    if (breakEnd)   breakEnd.disabled = true;
    if (elapsedEl)  elapsedEl.innerHTML = '';
    if (jobRow)     jobRow.style.display = 'block';   /* show job/notes when clocking in */

  } else if (openEntry.status === 'break') {
    /* ── State: ON BREAK ── */
    if (statusEl)   { statusEl.className = 'tc-status-badge break'; statusEl.textContent = 'On Break'; }
    if (clockInBtn) clockInBtn.disabled = true;
    if (clockOutBtn)clockOutBtn.disabled = false;
    if (breakStart) breakStart.disabled = true;
    if (breakEnd)   breakEnd.disabled = false;
    if (jobRow)     jobRow.style.display = 'none';
    tcStartElapsed(openEntry);

  } else {
    /* ── State: CLOCKED IN ── */
    if (statusEl)   { statusEl.className = 'tc-status-badge in'; statusEl.textContent = 'Clocked In — ' + openEntry.job; }
    if (clockInBtn) clockInBtn.disabled = true;
    if (clockOutBtn)clockOutBtn.disabled = false;
    if (breakStart) breakStart.disabled = false;
    if (breakEnd)   breakEnd.disabled = true;
    if (jobRow)     jobRow.style.display = 'none';
    tcStartElapsed(openEntry);
  }
}

/* Start the "You have been clocked in for X hrs Y min" counter. */
function tcStartElapsed(entry) {
  clearInterval(_elapsedInterval);
  function update() {
    var el = document.getElementById('tc-elapsed');
    if (!el || !entry) return;
    var now = Date.now();
    /* Subtract break time from elapsed */
    var breakMs = 0;
    entry.breaks.forEach(function(b) {
      if (b.start) breakMs += (b.end ? b.end : now) - b.start;
    });
    var workedMs = (now - entry.clockIn) - breakMs;
    el.innerHTML = 'Clocked in for <span>' + tcFormatDuration(workedMs) + '</span>';
  }
  update();
  _elapsedInterval = setInterval(update, 30000);   /* refresh every 30 seconds */
}

/* ── Button handlers for dashboard ── */

function tcHandleClockIn() {
  var session = tcGetSession();
  if (!session) return;

  var job   = document.getElementById('tc-job-select')?.value || 'General';
  var notes = document.getElementById('tc-notes')?.value || '';

  if (!job) {
    alert('Please select a job before clocking in.');
    return;
  }

  tcClockIn(session.name, job, notes);
  tcRefreshDashboard();
  tcRenderWeeklyView();
  tcRenderRecentLog();
}

function tcHandleClockOut() {
  var session = tcGetSession();
  if (!session) return;
  if (!confirm('Clock out now?')) return;

  tcClockOut(session.name);
  tcRefreshDashboard();
  tcRenderWeeklyView();
  tcRenderRecentLog();
}

function tcHandleBreakStart() {
  var session = tcGetSession();
  if (!session) return;
  tcStartBreak(session.name);
  tcRefreshDashboard();
}

function tcHandleBreakEnd() {
  var session = tcGetSession();
  if (!session) return;
  tcEndBreak(session.name);
  tcRefreshDashboard();
}

/* Render the weekly view (7-day grid + total). */
function tcRenderWeeklyView() {
  var session = tcGetSession();
  if (!session) return;

  var totalEl = document.getElementById('tc-week-total-hrs');
  var gridEl  = document.getElementById('tc-week-grid');
  if (!totalEl || !gridEl) return;

  var total = tcWeekTotalHours(session.name);
  totalEl.textContent = total.toFixed(1) + ' hrs';

  var days = tcWeekByDay(session.name);
  gridEl.innerHTML = days.map(function(d) {
    var hasHours = d.hours > 0;
    return '<div class="tc-day-box ' + (hasHours ? 'has-hours' : '') + '">'
      + '<div class="day-name">' + d.label + '</div>'
      + '<div class="day-hours">' + (hasHours ? d.hours.toFixed(1) + ' hrs' : '—') + '</div>'
      + (d.jobs ? '<div class="day-job">' + d.jobs + '</div>' : '')
      + '</div>';
  }).join('');
}

/* Render the recent punch log (last 10 entries). */
function tcRenderRecentLog() {
  var session = tcGetSession();
  if (!session) return;
  var logEl = document.getElementById('tc-recent-log');
  if (!logEl) return;

  var allEntries = tcGetEntries().filter(function(e) {
    return e.employee === session.name;
  }).slice(-10).reverse();   /* last 10, newest first */

  if (!allEntries.length) {
    logEl.innerHTML = '<p style="color:var(--gray-mid);font-size:0.875rem;">No time entries yet.</p>';
    return;
  }

  logEl.innerHTML = allEntries.map(function(e) {
    var inTime  = tcFormatTime(e.clockIn);
    var outTime = e.clockOut ? tcFormatTime(e.clockOut) : 'still in';
    var hrs = e.totalWorkedMs ? tcMsToHrs(e.totalWorkedMs).toFixed(1) + ' hrs' : '(open)';
    return '<div class="tc-log-entry">'
      + '<div class="log-dot ' + (e.clockOut ? 'out' : 'in') + '"></div>'
      + '<div class="log-time">' + inTime + '</div>'
      + '<div class="log-desc">' + e.date + ' &nbsp;→&nbsp; ' + outTime + ' · ' + hrs + '</div>'
      + '<div class="log-job">' + e.job + '</div>'
      + '</div>';
  }).join('');
}


/* ──────────────────────────────────────────────────────────────
   ★ STEP 2: HOW TO CONNECT A REAL DATABASE
   ────────────────────────────────────────────────────────────────
   When you're ready to move beyond localStorage, here is what
   to change. The rest of the app code stays the same.

   OPTION A — Google Apps Script (easiest, free, matches your portal):
     1. Create a Google Sheet to store timecard entries.
     2. Add a Google Apps Script web app (like APPS_SCRIPT in the portal).
     3. Replace tcLoad() / tcSave() with fetch() calls to your Apps Script URL.
     Example:
       async function tcSaveEntries(entries) {
         await fetch(YOUR_APPS_SCRIPT_URL, {
           method: 'POST',
           mode: 'no-cors',
           headers: { 'Content-Type': 'text/plain' },
           body: JSON.stringify({ action: 'saveEntries', entries: entries })
         });
       }

   OPTION B — Supabase (free tier, real database):
     1. Create a free project at supabase.com.
     2. Create a table called "timecard_entries" matching the entry object shape.
     3. Replace tcLoad/tcSave with supabase.from('timecard_entries').select() etc.

   OPTION C — Firebase Firestore (free tier):
     Similar to Supabase but from Google.

   In all cases: employees and passwords should be stored in the database,
   not hardcoded in VALID_EMPLOYEES above.
   ────────────────────────────────────────────────────────────── */
