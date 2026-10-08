# Design Document: Office Attendance Portal

## Overview

The Office Attendance Portal is a full-stack web application for managing employee attendance, leave, and reporting. It supports two roles — Admin and Employee — with distinct capabilities for each.

The system is built on a React.js (Vite) frontend with Tailwind CSS, a Node.js + Express REST API backend, and MongoDB (Mongoose) for persistence. Authentication is stateless via JWT. The architecture follows a layered service pattern on the backend, with a component-based SPA on the frontend.

Key capabilities:
- Secure JWT-based authentication with role-based access control
- One-click check-in/check-out with automatic late mark and working hours calculation
- Leave application and approval workflow
- Admin dashboard with real-time attendance metrics (polling-based)
- Report generation and export in CSV, Excel, and PDF formats
- Configurable attendance rules (late threshold, shifts, holidays, weekends)

---

## Architecture

```mermaid
graph TB
    subgraph Client ["Frontend (React + Vite)"]
        UI[React Pages & Components]
        Store[Zustand / Context State]
        API_Client[Axios HTTP Client]
    end

    subgraph Server ["Backend (Node.js + Express)"]
        Router[Express Router]
        Middleware[Auth + RBAC + Rate Limiter + Validator]
        AuthSvc[Auth Service]
        EmpSvc[Employee Service]
        AttSvc[Attendance Service]
        LeaveSvc[Leave Service]
        ReportSvc[Report Service]
        SettingsSvc[Settings Service]
        FileUpload[Multer File Upload]
    end

    subgraph DB ["MongoDB (Mongoose)"]
        Users[(Users)]
        Attendance[(Attendance)]
        Leaves[(Leaves)]
        Settings[(Settings)]
    end

    subgraph Storage ["File Storage"]
        Uploads[/uploads/ directory]
    end

    UI --> Store
    Store --> API_Client
    API_Client -->|HTTPS REST| Router
    Router --> Middleware
    Middleware --> AuthSvc
    Middleware --> EmpSvc
    Middleware --> AttSvc
    Middleware --> LeaveSvc
    Middleware --> ReportSvc
    Middleware --> SettingsSvc
    AuthSvc --> Users
    EmpSvc --> Users
    EmpSvc --> FileUpload
    AttSvc --> Attendance
    AttSvc --> Settings
    LeaveSvc --> Leaves
    ReportSvc --> Attendance
    ReportSvc --> Leaves
    ReportSvc --> Users
    SettingsSvc --> Settings
    FileUpload --> Uploads
```

### Deployment Topology

- Frontend: Static SPA served via Vite dev server (dev) or Nginx (prod)
- Backend: Node.js process, port 5000
- Database: MongoDB Atlas (prod) or local MongoDB (dev)
- File storage: Local `uploads/` directory (dev), S3-compatible (prod option)
- HTTPS: Enforced via reverse proxy (Nginx) in production

### Real-Time Updates

Dashboard metrics use **polling** (every 30 seconds via `setInterval`) rather than WebSockets, keeping the architecture simple while meeting the 60-second freshness requirement. WebSocket upgrade is a future option.

---

## Components and Interfaces

### Backend Modules

#### Auth Service (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Authenticate user, return JWT |
| POST | `/logout` | Client-side token removal (stateless) |

#### Employee Service (`/api/employees`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Paginated employee list (Admin) |
| POST | `/` | Create employee (Admin) |
| GET | `/:id` | Get employee by ID |
| PUT | `/:id` | Update employee (Admin) |
| DELETE | `/:id` | Soft-delete employee (Admin) |
| GET | `/search` | Search by name/dept/designation (Admin) |
| POST | `/:id/photo` | Upload profile photo (Admin) |

#### Attendance Service (`/api/attendance`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/checkin` | Record check-in (Employee) |
| POST | `/checkout` | Record check-out (Employee) |
| GET | `/my` | Employee's own attendance history |
| GET | `/` | All attendance records (Admin) |
| GET | `/dashboard` | Dashboard metrics (Admin) |

#### Leave Service (`/api/leaves`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Apply for leave (Employee) |
| GET | `/my` | Employee's own leave history |
| GET | `/` | All leave records, filterable (Admin) |
| PUT | `/:id/approve` | Approve leave (Admin) |
| PUT | `/:id/reject` | Reject leave (Admin) |

#### Report Service (`/api/reports`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/daily` | Daily attendance report (Admin) |
| GET | `/monthly` | Monthly attendance report (Admin) |
| GET | `/employee/:id` | Per-employee report (Admin) |
| GET | `/department` | Department report (Admin) |
| GET | `/export` | Export report (CSV/Excel/PDF) (Admin) |

#### Settings Service (`/api/settings`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get current settings (Admin) |
| PUT | `/` | Update settings (Admin) |
| POST | `/holidays` | Add holiday (Admin) |
| DELETE | `/holidays/:date` | Remove holiday (Admin) |

### Middleware Stack

```
Request → Rate Limiter → Body Parser → CORS → authenticate (JWT verify) → authorize (role check) → validate (Joi/Zod) → Route Handler
```

- `authenticate`: Verifies JWT, attaches `req.user`
- `authorize(roles)`: Checks `req.user.role` against allowed roles
- `validate(schema)`: Validates request body/query against Joi schema, returns 400 on failure

### Frontend Pages & Routing

```
/login                    → LoginPage
/                         → redirect based on role
/admin/dashboard          → AdminDashboard
/admin/employees          → EmployeeList
/admin/employees/new      → EmployeeForm
/admin/employees/:id      → EmployeeDetail
/admin/attendance         → AttendanceManagement
/admin/leaves             → LeaveManagement
/admin/reports            → Reports
/admin/settings           → Settings
/employee/dashboard       → EmployeeDashboard
/employee/attendance      → MyAttendance
/employee/leaves          → MyLeaves
/employee/leaves/apply    → LeaveApplication
/employee/profile         → Profile
```

### Frontend Component Tree (key components)

```
App
├── AuthProvider (JWT context)
├── Layout
│   ├── Sidebar (role-aware nav links)
│   ├── TopBar (user info, logout)
│   └── <Outlet> (page content)
├── Pages (per route above)
└── Shared
    ├── DataTable (sortable, paginated)
    ├── AttendanceCalendar
    ├── StatCard
    ├── AttendanceChart (Recharts)
    ├── LoadingSpinner
    ├── ToastNotification
    └── ConfirmDialog
```

---

## Data Models

### User (MongoDB Collection: `users`)

```js
{
  _id: ObjectId,
  employeeId: String,        // auto-generated, e.g. "EMP-0001"
  name: String,              // required
  email: String,             // required, unique
  password: String,          // bcrypt hash
  phone: String,
  department: String,
  designation: String,
  role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
  joiningDate: Date,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  profilePhotoUrl: String,
  shiftId: ObjectId,         // ref: Settings.shifts (optional)
  createdAt: Date,
  updatedAt: Date
}
```

### Attendance (MongoDB Collection: `attendance`)

```js
{
  _id: ObjectId,
  employeeId: ObjectId,      // ref: User
  date: Date,                // calendar date (YYYY-MM-DD, no time)
  checkIn: Date,             // full timestamp
  checkOut: Date,            // full timestamp (null until checked out)
  workingHours: Number,      // decimal hours, computed on checkout
  status: { type: String, enum: ['Present', 'Half Day', 'Full Day', 'Absent', 'Holiday', 'Weekend'] },
  isLate: Boolean,
  ipAddress: String,
  deviceInfo: String,
  createdAt: Date,
  updatedAt: Date
}
// Compound unique index: { employeeId, date }
```

### Leave (MongoDB Collection: `leaves`)

```js
{
  _id: ObjectId,
  employeeId: ObjectId,      // ref: User
  leaveType: { type: String, enum: ['Casual Leave', 'Sick Leave', 'Paid Leave', 'Work From Home'] },
  startDate: Date,
  endDate: Date,
  reason: String,
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: ObjectId,      // ref: User (Admin), null until actioned
  appliedAt: Date,
  updatedAt: Date
}
```

### Settings (MongoDB Collection: `settings`)

```js
{
  _id: ObjectId,
  key: String,               // unique key, e.g. "global"
  lateThreshold: String,     // "HH:MM" format, default "10:00"
  weekendDays: [Number],     // 0=Sun, 6=Sat, default [0, 6]
  holidays: [
    {
      date: Date,
      name: String
    }
  ],
  shifts: [
    {
      _id: ObjectId,
      name: String,          // e.g. "Morning Shift"
      startTime: String,     // "HH:MM"
      endTime: String        // "HH:MM"
    }
  ],
  inactivityTimeoutMinutes: Number,  // default 30
  updatedAt: Date
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid credentials produce a verifiable JWT

*For any* user with valid credentials (email/employeeId + correct password), submitting those credentials to the login endpoint should return a JWT token that can be successfully verified with the server's secret key.

**Validates: Requirements 1.1, 1.3**

---

### Property 2: Invalid credentials always return 401

*For any* combination of credentials where either the email/employeeId does not exist or the password does not match, the login endpoint should return HTTP 401.

**Validates: Requirements 1.2**

---

### Property 3: Passwords are stored as bcrypt hashes

*For any* user created in the system, the password field stored in the database should be a valid bcrypt hash and should never equal the plaintext password submitted during creation.

**Validates: Requirements 1.4, 11.4**

---

### Property 4: Invalid or missing tokens are rejected on protected routes

*For any* protected API endpoint, a request made with an expired token, a malformed token, or no token at all should receive an HTTP 401 response.

**Validates: Requirements 1.5, 1.6**

---

### Property 5: Role-based access is enforced

*For any* admin-only endpoint and any request bearing an employee-role JWT, the response should be HTTP 403. *For any* employee-accessible endpoint and any request bearing an admin-role JWT, the response should be permitted (2xx).

**Validates: Requirements 2.2, 2.3**

---

### Property 6: Employee IDs are unique across all employees

*For any* set of N employees created in the system, all N Employee_IDs should be distinct strings.

**Validates: Requirements 3.2**

---

### Property 7: Employee creation round-trip preserves all required fields

*For any* valid employee creation payload, the record returned by a subsequent GET request should contain all required fields: name, email, phone, department, designation, employeeId, joiningDate, status, and profilePhotoUrl.

**Validates: Requirements 3.1, 3.6**

---

### Property 8: Employee update round-trip

*For any* existing employee and any valid partial update payload, the record returned after the update should reflect all submitted changes.

**Validates: Requirements 3.4**

---

### Property 9: Soft-delete preserves the record

*For any* employee, after a DELETE request the employee record should still exist in the database with status set to "Inactive".

**Validates: Requirements 3.5**

---

### Property 10: Duplicate email is rejected

*For any* existing employee email, attempting to create a second employee with the same email should return HTTP 409.

**Validates: Requirements 3.7**

---

### Property 11: Employee search returns only matching records

*For any* search query (name, department, or designation) and any set of employee records, every record returned by the search endpoint should match the query criteria, and no non-matching record should appear in the results.

**Validates: Requirements 3.9**

---

### Property 12: Check-in records timestamp, IP, and device info

*For any* authenticated employee check-in, the created attendance record should contain a non-null checkIn timestamp, a non-null ipAddress, and a non-null deviceInfo field.

**Validates: Requirements 4.1**

---

### Property 13: Duplicate check-in on the same day is rejected

*For any* employee who has already checked in on a given calendar day, a second check-in request on that same day should return HTTP 409.

**Validates: Requirements 4.2**

---

### Property 14: Late mark reflects the configured threshold

*For any* check-in timestamp and any configured late threshold, the isLate flag on the resulting attendance record should be true if and only if the check-in time (HH:MM) is strictly after the threshold.

**Validates: Requirements 4.3, 13.1, 13.4**

---

### Property 15: Working hours are computed correctly and status is classified

*For any* check-in/check-out pair, the workingHours value should equal (checkOut − checkIn) in decimal hours, and the status should be:
- "Half Day" when workingHours < 4
- "Present" when 4 ≤ workingHours < 8
- "Full Day" when workingHours ≥ 8

**Validates: Requirements 5.1, 5.3, 5.4, 5.5**

---

### Property 16: Check-out without check-in is rejected

*For any* employee who has not checked in on the current day, a check-out request should return HTTP 400.

**Validates: Requirements 5.2**

---

### Property 17: Dashboard counts are accurate

*For any* set of attendance records for a given day, the dashboard metrics (present count, absent count, late count, on-leave count) should equal the exact counts derived from those records.

**Validates: Requirements 6.1**

---

### Property 18: Attendance history is scoped to the requesting employee

*For any* authenticated employee, the `/api/attendance/my` endpoint should return only attendance records where `employeeId` matches that employee's ID, and all required display fields (date, checkIn, checkOut, workingHours, status, isLate) should be present.

**Validates: Requirements 7.1, 7.2**

---

### Property 19: New leave applications start as Pending

*For any* valid leave application submitted by an employee, the created leave record should have status "Pending".

**Validates: Requirements 8.1**

---

### Property 20: Overlapping leave applications are rejected

*For any* employee with an existing Approved or Pending leave covering dates D1–D2, a new leave application whose date range overlaps D1–D2 should return HTTP 409.

**Validates: Requirements 8.2**

---

### Property 21: Only valid leave types are accepted

*For any* leave application with a leaveType not in {Casual Leave, Sick Leave, Paid Leave, Work From Home}, the request should be rejected with HTTP 400.

**Validates: Requirements 8.3**

---

### Property 22: Leave history is scoped to the requesting employee

*For any* authenticated employee, the `/api/leaves/my` endpoint should return only leave records where `employeeId` matches that employee's ID.

**Validates: Requirements 8.4**

---

### Property 23: Leave status transitions are correct

*For any* Pending leave request, approving it should set status to "Approved" and record the approving admin's ID; rejecting it should set status to "Rejected" and record the admin's ID.

**Validates: Requirements 9.1, 9.2**

---

### Property 24: Re-actioning a non-Pending leave is rejected

*For any* leave record already in "Approved" or "Rejected" status, an approve or reject request should return HTTP 409.

**Validates: Requirements 9.4**

---

### Property 25: Leave list filters return only matching records

*For any* combination of filter parameters (status, leaveType, department, date range), every record returned by the admin leave list endpoint should satisfy all applied filters.

**Validates: Requirements 9.3**

---

### Property 26: Report data is scoped and complete

*For any* report request (daily, monthly, employee, or department), the returned records should contain only data matching the specified scope (date/employee/department) and should include all employees/records within that scope.

**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

---

### Property 27: Report export produces correct content type

*For any* export request with a valid format (csv, xlsx, pdf), the response Content-Type header should match the requested format. For any unsupported format string, the response should be HTTP 400.

**Validates: Requirements 10.5, 10.6**

---

### Property 28: Invalid payloads return 400 with field-level errors

*For any* API endpoint and any request body that fails schema validation, the response should be HTTP 400 and the body should contain field-level error details identifying which fields are invalid.

**Validates: Requirements 11.3**

---

### Property 29: Weekend and holiday dates are excluded from absent counts

*For any* configured set of weekend days and holidays, attendance aggregation queries should not count those dates as absent days for any employee.

**Validates: Requirements 13.2, 13.3**

---

## Error Handling

### HTTP Status Code Conventions

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Validation failure, missing required fields, checkout without checkin |
| 401 | Unauthorized | Missing/invalid/expired JWT |
| 403 | Forbidden | Valid JWT but insufficient role |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate email, duplicate check-in, overlapping leave, re-actioning leave |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unhandled exceptions |

### Error Response Shape

All error responses follow a consistent JSON envelope:

```json
{
  "success": false,
  "message": "Human-readable error description",
  "errors": [
    { "field": "email", "message": "Email already exists" }
  ]
}
```

The `errors` array is present only for validation failures (400). For other errors, only `success` and `message` are returned.

### Success Response Shape

```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

`pagination` is included only on paginated list endpoints.

### Global Error Middleware

Express global error handler catches all unhandled errors, logs them server-side, and returns a sanitized 500 response (no stack traces in production).

### Attendance Business Logic Errors

- Check-in when already checked in today → 409
- Check-out when not checked in → 400
- Check-out before check-in time (clock skew) → 400 with descriptive message

### Leave Business Logic Errors

- Overlapping leave dates → 409
- Invalid leave type → 400
- Approve/reject non-pending leave → 409

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:
- Unit tests verify specific examples, integration points, and edge cases
- Property-based tests verify universal correctness across randomized inputs

### Unit Tests

Focus areas:
- Auth middleware: valid token, expired token, missing token, wrong role
- Attendance status classification: boundary values (3.9h, 4.0h, 7.9h, 8.0h)
- Late mark logic: exactly at threshold, 1 minute before, 1 minute after
- Leave overlap detection: adjacent ranges, fully contained, partial overlap
- Report aggregation: empty data sets, single record, multi-employee
- API integration tests (supertest): one test per endpoint covering happy path and primary error case

### Property-Based Tests

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (JavaScript/TypeScript)

**Configuration**: Each property test runs a minimum of **100 iterations**.

**Tag format**: Each test must include a comment:
```
// Feature: office-attendance-portal, Property <N>: <property_text>
```

Each correctness property defined above must be implemented by exactly one property-based test. The mapping is:

| Property | Test Description |
|----------|-----------------|
| P1 | Generate random valid users, verify login returns verifiable JWT |
| P2 | Generate random invalid credentials, verify 401 |
| P3 | Generate random users, verify stored password is bcrypt hash ≠ plaintext |
| P4 | Generate random tokens (expired, malformed, empty), verify 401 on protected routes |
| P5 | Generate employee tokens against admin routes (403) and admin tokens against employee routes (2xx) |
| P6 | Create N random employees, verify all employeeIds are distinct |
| P7 | Generate random valid employee payloads, verify all required fields present after create+fetch |
| P8 | Generate random employees + update payloads, verify GET reflects changes |
| P9 | Generate random employees, delete them, verify record exists with status Inactive |
| P10 | Create employee, attempt duplicate email creation, verify 409 |
| P11 | Generate random employee sets + search queries, verify all results match query |
| P12 | Generate random check-in events, verify timestamp/IP/device fields are non-null |
| P13 | Generate employee with existing check-in, attempt second check-in, verify 409 |
| P14 | Generate random check-in times and thresholds, verify isLate = (checkInTime > threshold) |
| P15 | Generate random check-in/check-out pairs, verify workingHours and status classification |
| P16 | Generate employees without check-in, attempt check-out, verify 400 |
| P17 | Generate random attendance record sets, verify dashboard counts match manual aggregation |
| P18 | Generate multiple employees with attendance, verify /my returns only own records with all fields |
| P19 | Generate random valid leave applications, verify status is Pending |
| P20 | Generate employee with existing leave, generate overlapping range, verify 409 |
| P21 | Generate random invalid leaveType strings, verify 400 |
| P22 | Generate multiple employees with leaves, verify /my returns only own records |
| P23 | Generate pending leaves, approve/reject them, verify status and approvedBy fields |
| P24 | Generate approved/rejected leaves, attempt re-action, verify 409 |
| P25 | Generate random leave sets + filter combos, verify all results satisfy filters |
| P26 | Generate random attendance/leave data, verify report scoping and completeness |
| P27 | Generate valid format strings, verify correct Content-Type; generate invalid strings, verify 400 |
| P28 | Generate random invalid payloads for each endpoint, verify 400 with field errors |
| P29 | Generate random weekend/holiday configs, verify those dates absent from absent counts |
