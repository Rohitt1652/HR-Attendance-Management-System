# Implementation Plan: Office Attendance Portal

## Overview

Full-stack implementation using React (Vite) + Tailwind CSS on the frontend, Node.js + Express on the backend, MongoDB (Mongoose) for persistence, and JWT for authentication. Tasks are ordered so each step builds on the previous, ending with full integration.

## Tasks

- [-] 1. Project scaffolding
  - Create `backend/` directory with `src/{models,middleware,routes,controllers,services,utils}` structure
  - Create `frontend/` directory with Vite + React template, install Tailwind CSS, React Router, Axios, Zustand, Recharts, react-hot-toast
  - Add `backend/.env.example` with `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
  - Add `backend/src/app.js` (Express app setup: CORS, body-parser, rate limiter, routes mount, global error handler) and `backend/src/server.js` (entry point)
  - Add `frontend/src/api/axios.js` (Axios instance with base URL and JWT interceptor)
  - _Requirements: 11.1, 11.5, 12.1_

- [ ] 2. Backend: MongoDB models
  - [ ] 2.1 Create User model (`backend/src/models/User.js`)
    - Fields: employeeId, name, email, password (bcrypt pre-save hook), phone, department, designation, role, joiningDate, status, profilePhotoUrl, shiftId, timestamps
    - Add unique index on `email`; add static `generateEmployeeId()` helper
    - _Requirements: 1.4, 3.2, 3.6_

  - [ ] 2.2 Create Attendance model (`backend/src/models/Attendance.js`)
    - Fields: employeeId (ref User), date, checkIn, checkOut, workingHours, status enum, isLate, ipAddress, deviceInfo, timestamps
    - Add compound unique index `{ employeeId, date }`
    - _Requirements: 4.1, 4.3, 5.1_

  - [ ] 2.3 Create Leave model (`backend/src/models/Leave.js`)
    - Fields: employeeId (ref User), leaveType enum, startDate, endDate, reason, status enum (default Pending), approvedBy, appliedAt, updatedAt
    - _Requirements: 8.1, 8.3, 9.1_

  - [ ] 2.4 Create Settings model (`backend/src/models/Settings.js`)
    - Fields: key (unique), lateThreshold, weekendDays, holidays array, shifts array, inactivityTimeoutMinutes, updatedAt
    - Add seed function to insert default `{ key: "global" }` document on startup
    - _Requirements: 4.4, 13.1, 13.2, 13.3, 13.4_

- [ ] 3. Backend: Middleware
  - [ ] 3.1 Implement `authenticate` middleware (`backend/src/middleware/auth.js`)
    - Verify Bearer JWT; attach `req.user`; return 401 on missing/invalid/expired token
    - _Requirements: 1.5, 1.6_

  - [ ] 3.2 Implement `authorize(roles)` middleware (`backend/src/middleware/rbac.js`)
    - Check `req.user.role` against allowed roles array; return 403 on mismatch
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ] 3.3 Implement `validate(schema)` middleware (`backend/src/middleware/validate.js`)
    - Use Joi to validate `req.body` / `req.query`; return 400 with field-level errors on failure
    - _Requirements: 11.3_

  - [ ] 3.4 Configure rate limiter in `backend/src/middleware/rateLimiter.js`
    - Use `express-rate-limit`; 100 req / 15 min per IP; return 429 on exceed
    - _Requirements: 11.1, 11.2_

- [ ] 4. Backend: Auth routes and controllers
  - [ ] 4.1 Implement auth controller (`backend/src/controllers/authController.js`)
    - `login`: find user by email or employeeId, compare bcrypt password, sign JWT, return token + user (no password field)
    - `logout`: return 200 (stateless; client removes token)
    - `getMe`: return `req.user` without password
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 11.4_

  - [ ] 4.2 Create auth router (`backend/src/routes/auth.js`) and mount at `/api/auth`
    - `POST /login` → validate(loginSchema) → login
    - `POST /logout` → authenticate → logout
    - `GET /me` → authenticate → getMe
    - _Requirements: 1.1, 1.6_

  - [ ]* 4.3 Write property test for auth (P1, P2, P3, P4)
    - **Property 1: Valid credentials produce a verifiable JWT** — generate random valid users, verify login returns verifiable JWT
    - **Property 2: Invalid credentials always return 401** — generate random invalid credentials, verify 401
    - **Property 3: Passwords are stored as bcrypt hashes** — verify stored password is bcrypt hash ≠ plaintext
    - **Property 4: Invalid or missing tokens are rejected on protected routes** — generate expired/malformed/empty tokens, verify 401
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.4**
    - _Tag: `// Feature: office-attendance-portal, Property <N>: <property_text>`_

- [ ] 5. Backend: Employee routes and controllers
  - [ ] 5.1 Implement employee controller (`backend/src/controllers/employeeController.js`)
    - `createEmployee`: auto-generate employeeId, hash password via model hook, return 201; return 409 on duplicate email
    - `listEmployees`: paginated query with optional name/dept/designation filter
    - `getEmployee`: find by `_id`, return 404 if not found
    - `updateEmployee`: partial update, return updated doc
    - `deleteEmployee`: set `status = 'Inactive'` (soft delete)
    - `searchEmployees`: regex search on name, department, designation
    - `uploadPhoto`: accept multipart via Multer, store path in `profilePhotoUrl`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ] 5.2 Create employee router (`backend/src/routes/employees.js`) and mount at `/api/employees`
    - All routes require `authenticate`; write/delete routes require `authorize(['admin'])`
    - Configure Multer for `POST /:id/photo`
    - _Requirements: 2.2, 3.1_

  - [ ]* 5.3 Write property tests for employee service (P6, P7, P8, P9, P10, P11)
    - **Property 6: Employee IDs are unique** — create N random employees, verify all employeeIds distinct
    - **Property 7: Employee creation round-trip preserves all required fields**
    - **Property 8: Employee update round-trip** — verify GET reflects submitted changes
    - **Property 9: Soft-delete preserves the record** — verify record exists with status Inactive after DELETE
    - **Property 10: Duplicate email is rejected** — verify 409 on duplicate email
    - **Property 11: Employee search returns only matching records**
    - **Validates: Requirements 3.1–3.9**

- [ ] 6. Backend: Attendance routes and controllers
  - [ ] 6.1 Implement attendance business logic helpers (`backend/src/services/attendanceService.js`)
    - `computeWorkingHours(checkIn, checkOut)`: returns decimal hours
    - `classifyStatus(hours)`: returns 'Half Day' | 'Present' | 'Full Day'
    - `isLateCheckIn(checkInTime, threshold)`: returns boolean
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 4.3_

  - [ ] 6.2 Implement attendance controller (`backend/src/controllers/attendanceController.js`)
    - `checkIn`: reject duplicate same-day check-in (409); record timestamp, IP, deviceInfo; evaluate isLate against Settings.lateThreshold
    - `checkOut`: reject if no check-in today (400); compute workingHours and status; save
    - `getMyAttendance`: return only records for `req.user._id`
    - `getAllAttendance`: admin paginated list with date/employee filters
    - `getDashboard`: aggregate present/absent/late/on-leave counts for today; monthly graph data
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 7.1, 7.2_

  - [ ] 6.3 Create attendance router (`backend/src/routes/attendance.js`) and mount at `/api/attendance`
    - `POST /checkin` and `POST /checkout` → authenticate + authorize(['employee'])
    - `GET /my` → authenticate + authorize(['employee'])
    - `GET /` and `GET /dashboard` → authenticate + authorize(['admin'])
    - _Requirements: 2.2, 4.1, 5.1_

  - [ ]* 6.4 Write property tests for attendance service (P12, P13, P14, P15, P16, P17, P18)
    - **Property 12: Check-in records timestamp, IP, and device info**
    - **Property 13: Duplicate check-in on the same day is rejected** — verify 409
    - **Property 14: Late mark reflects the configured threshold** — generate random times and thresholds
    - **Property 15: Working hours computed correctly and status classified** — generate random check-in/check-out pairs
    - **Property 16: Check-out without check-in is rejected** — verify 400
    - **Property 17: Dashboard counts are accurate** — verify counts match manual aggregation
    - **Property 18: Attendance history is scoped to the requesting employee**
    - **Validates: Requirements 4.1–4.4, 5.1–5.5, 6.1, 7.1, 7.2**

- [ ] 7. Checkpoint — Ensure all backend auth, employee, and attendance tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Backend: Leave routes and controllers
  - [ ] 8.1 Implement leave controller (`backend/src/controllers/leaveController.js`)
    - `applyLeave`: validate leaveType enum; check for overlapping Approved/Pending leaves (409); create with status Pending; return 201
    - `getMyLeaves`: return only records for `req.user._id`
    - `getAllLeaves`: admin paginated list filterable by status, leaveType, department, date range
    - `approveLeave`: set status Approved + approvedBy; reject if already Approved/Rejected (409)
    - `rejectLeave`: set status Rejected + approvedBy; reject if already Approved/Rejected (409)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4_

  - [ ] 8.2 Create leave router (`backend/src/routes/leaves.js`) and mount at `/api/leaves`
    - `POST /` and `GET /my` → authenticate + authorize(['employee'])
    - `GET /`, `PUT /:id/approve`, `PUT /:id/reject` → authenticate + authorize(['admin'])
    - _Requirements: 2.2, 8.1, 9.1_

  - [ ]* 8.3 Write property tests for leave service (P19, P20, P21, P22, P23, P24, P25)
    - **Property 19: New leave applications start as Pending**
    - **Property 20: Overlapping leave applications are rejected** — verify 409
    - **Property 21: Only valid leave types are accepted** — generate invalid leaveType strings, verify 400
    - **Property 22: Leave history is scoped to the requesting employee**
    - **Property 23: Leave status transitions are correct** — verify status and approvedBy after approve/reject
    - **Property 24: Re-actioning a non-Pending leave is rejected** — verify 409
    - **Property 25: Leave list filters return only matching records**
    - **Validates: Requirements 8.1–8.4, 9.1–9.4**

- [ ] 9. Backend: Reports routes and controllers
  - [ ] 9.1 Implement report controller (`backend/src/controllers/reportController.js`)
    - `getDailyReport`: aggregate attendance for all employees on a given date
    - `getMonthlyReport`: aggregate per-employee attendance for a given month
    - `getEmployeeReport`: full attendance + leave history for one employee within date range
    - `getDepartmentReport`: aggregate attendance + leave for all employees in a department within date range
    - `exportReport`: generate CSV (fast-csv), Excel (exceljs), or PDF (pdfkit) based on `format` query param; return 400 for unsupported format
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ] 9.2 Create reports router (`backend/src/routes/reports.js`) and mount at `/api/reports`
    - All routes → authenticate + authorize(['admin'])
    - _Requirements: 2.2, 10.1_

  - [ ]* 9.3 Write property tests for report service (P26, P27)
    - **Property 26: Report data is scoped and complete** — generate random attendance/leave data, verify scoping
    - **Property 27: Report export produces correct Content-Type** — verify correct header for csv/xlsx/pdf; verify 400 for invalid format
    - **Validates: Requirements 10.1–10.6**

- [ ] 10. Backend: Settings routes and controllers
  - [ ] 10.1 Implement settings controller (`backend/src/controllers/settingsController.js`)
    - `getSettings`: return global settings document
    - `updateSettings`: update lateThreshold, weekendDays, shifts, inactivityTimeoutMinutes
    - `addHoliday`: push `{ date, name }` to holidays array
    - `removeHoliday`: pull holiday by date
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 10.2 Create settings router (`backend/src/routes/settings.js`) and mount at `/api/settings`
    - All routes → authenticate + authorize(['admin'])
    - _Requirements: 2.2, 13.1_

  - [ ]* 10.3 Write property tests for settings and cross-cutting concerns (P28, P29)
    - **Property 28: Invalid payloads return 400 with field-level errors** — generate random invalid payloads for each endpoint, verify 400 + field errors
    - **Property 29: Weekend and holiday dates are excluded from absent counts** — generate random weekend/holiday configs, verify those dates absent from absent counts
    - **Validates: Requirements 11.3, 13.2, 13.3**

- [ ] 11. Checkpoint — Ensure all backend tests pass (auth, employee, attendance, leave, reports, settings)
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Frontend: Project setup and auth infrastructure
  - [ ] 12.1 Configure React Router in `frontend/src/main.jsx`
    - Define all routes from the routing table (login, admin/*, employee/*)
    - Add `ProtectedRoute` component that reads auth context and redirects to `/login` if unauthenticated
    - Add role-based redirect on `/` based on `user.role`
    - _Requirements: 1.5, 2.2, 12.1_

  - [ ] 12.2 Implement `AuthContext` (`frontend/src/context/AuthContext.jsx`)
    - Store JWT token in `localStorage`; expose `user`, `login(token)`, `logout()` helpers
    - Implement inactivity timeout using `setTimeout` reset on user events; call `logout()` on timeout
    - _Requirements: 1.7, 1.8_

  - [ ] 12.3 Implement API service modules (`frontend/src/api/`)
    - `authApi.js`, `employeeApi.js`, `attendanceApi.js`, `leaveApi.js`, `reportApi.js`, `settingsApi.js`
    - Each module wraps Axios calls; Axios interceptor attaches Bearer token from context
    - _Requirements: 1.6_

- [ ] 13. Frontend: Shared components
  - [ ] 13.1 Create `Layout` component (`frontend/src/components/Layout.jsx`)
    - Renders `Sidebar` + `TopBar` + `<Outlet>`; responsive: sidebar collapses to hamburger on mobile
    - _Requirements: 12.1, 12.6_

  - [ ] 13.2 Create `Sidebar` component (`frontend/src/components/Sidebar.jsx`)
    - Role-aware nav links (admin vs employee); highlight active route
    - _Requirements: 12.1_

  - [ ] 13.3 Create `DataTable` component (`frontend/src/components/DataTable.jsx`)
    - Sortable columns, pagination controls, search/filter bar; emits page/sort/filter change events to parent
    - _Requirements: 12.4, 12.5_

  - [ ] 13.4 Create `AttendanceCalendar` component (`frontend/src/components/AttendanceCalendar.jsx`)
    - Monthly calendar grid; color-code cells: present (green), absent (red), late (yellow), leave (blue), holiday/weekend (grey)
    - _Requirements: 7.3_

  - [ ] 13.5 Create `LoadingSpinner`, `ToastNotification`, and `ConfirmDialog` components
    - `LoadingSpinner`: centered overlay shown during async operations
    - `ToastNotification`: wraps react-hot-toast; called via `toast.success` / `toast.error`
    - `ConfirmDialog`: modal with confirm/cancel; used before destructive actions
    - _Requirements: 12.2, 12.3_

  - [ ] 13.6 Create `StatCard` and `AttendanceChart` components
    - `StatCard`: displays a metric label + value + optional icon
    - `AttendanceChart`: Recharts `BarChart` or `LineChart` for monthly present/absent trend
    - _Requirements: 6.1, 6.2_

- [ ] 14. Frontend: Login page
  - Implement `LoginPage` (`frontend/src/pages/LoginPage.jsx`)
  - Form with email/employeeId + password fields; call `authApi.login`; on success store token via `AuthContext.login` and redirect by role
  - Show toast on error; disable submit button while loading
  - _Requirements: 1.1, 1.2, 1.3, 12.3_

- [ ] 15. Frontend: Admin pages
  - [ ] 15.1 Implement `AdminDashboard` (`frontend/src/pages/admin/AdminDashboard.jsx`)
    - Fetch `/api/attendance/dashboard`; display `StatCard` grid (total, present, absent, late, on-leave)
    - Render `AttendanceChart` for monthly trend; poll every 30 seconds via `setInterval`
    - _Requirements: 6.1, 6.2, 6.5_

  - [ ] 15.2 Implement `EmployeeList` and `EmployeeForm` pages (`frontend/src/pages/admin/`)
    - `EmployeeList`: `DataTable` with search/filter; action buttons for view/edit/delete (with `ConfirmDialog`)
    - `EmployeeForm`: create/edit form with all required fields + photo upload input; call create or update API
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.8, 3.9, 12.4_

  - [ ] 15.3 Implement `EmployeeDetail` page (`frontend/src/pages/admin/EmployeeDetail.jsx`)
    - Display full employee profile; show attendance summary and leave history for that employee
    - _Requirements: 3.6, 7.2_

  - [ ] 15.4 Implement `AttendanceManagement` page (`frontend/src/pages/admin/AttendanceManagement.jsx`)
    - `DataTable` of all attendance records; date range picker + employee/department filter
    - _Requirements: 6.3, 6.4, 12.4_

  - [ ] 15.5 Implement `LeaveManagement` page (`frontend/src/pages/admin/LeaveManagement.jsx`)
    - `DataTable` of all leave requests; filter by status/type/department/date; approve/reject buttons with `ConfirmDialog`
    - _Requirements: 9.1, 9.2, 9.3, 12.4_

  - [ ] 15.6 Implement `Reports` page (`frontend/src/pages/admin/Reports.jsx`)
    - Tabs for daily / monthly / employee / department reports; date pickers and selectors
    - Export buttons (CSV, Excel, PDF) that trigger file download via blob response
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 15.7 Implement `Settings` page (`frontend/src/pages/admin/Settings.jsx`)
    - Form sections: late threshold time picker, weekend day checkboxes, holiday calendar (add/remove), shift management
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [ ] 16. Frontend: Employee pages
  - [ ] 16.1 Implement `EmployeeDashboard` (`frontend/src/pages/employee/EmployeeDashboard.jsx`)
    - Check-in / Check-out button (toggle based on today's attendance state); show today's status, working hours
    - Summary stats: present days this month, late count, pending leaves
    - _Requirements: 4.1, 5.1, 7.2_

  - [ ] 16.2 Implement `MyAttendance` page (`frontend/src/pages/employee/MyAttendance.jsx`)
    - `AttendanceCalendar` for current month; `DataTable` list below with date, check-in, check-out, hours, status, late flag
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 16.3 Implement `MyLeaves` and `LeaveApplication` pages (`frontend/src/pages/employee/`)
    - `MyLeaves`: `DataTable` of own leave history with status badges
    - `LeaveApplication`: form with leaveType select, date range picker, reason textarea; submit to `/api/leaves`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 16.4 Implement `Profile` page (`frontend/src/pages/employee/Profile.jsx`)
    - Display own employee record; allow photo upload; show read-only fields
    - _Requirements: 3.6, 3.8_

- [ ] 17. Checkpoint — Ensure all frontend pages render without errors and all backend tests still pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Integration: wire frontend to backend and end-to-end validation
  - [ ] 18.1 Verify all Axios API modules point to correct backend endpoints and handle error responses (show toast on 4xx/5xx)
    - _Requirements: 11.3, 12.3_

  - [ ] 18.2 Implement dark mode toggle in `TopBar`; persist preference in `localStorage`; apply Tailwind `dark:` classes across all pages
    - _Requirements: 12.7_

  - [ ] 18.3 Verify responsive layout at 375px, 768px, and 1920px breakpoints for all pages
    - _Requirements: 12.6_

  - [ ]* 18.4 Write unit tests for attendance business logic helpers (`attendanceService.js`)
    - Test `classifyStatus` at boundary values: 3.9h → Half Day, 4.0h → Present, 7.9h → Present, 8.0h → Full Day
    - Test `isLateCheckIn` at threshold, 1 min before, 1 min after
    - Test `computeWorkingHours` with known pairs
    - _Requirements: 5.3, 5.4, 5.5, 4.3_

  - [ ]* 18.5 Write unit tests for leave overlap detection logic
    - Test adjacent ranges (no overlap), fully contained range, partial overlap, same-day range
    - _Requirements: 8.2_

  - [ ]* 18.6 Write supertest integration tests for each API endpoint (happy path + primary error case)
    - One test per endpoint covering the main success response and the primary error condition
    - _Requirements: 1.1–13.4_

- [ ] 19. Final checkpoint — Ensure all tests pass and the application is fully wired
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` with minimum 100 iterations each; each test must include the tag comment `// Feature: office-attendance-portal, Property <N>: <property_text>`
- All 29 correctness properties from the design document are covered by tasks 4.3, 5.3, 6.4, 8.3, 9.3, and 10.3
- Checkpoints at tasks 7, 11, 17, and 19 ensure incremental validation throughout the build
