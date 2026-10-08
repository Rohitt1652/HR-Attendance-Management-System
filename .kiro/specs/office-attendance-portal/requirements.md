# Requirements Document

## Introduction

The Office Attendance Portal is a full-stack web application that enables organizations to manage employee attendance, leaves, and reporting. The system supports two roles: Admin and Employee. Admins manage employees, review attendance, approve leaves, and generate reports. Employees check in/out, apply for leave, and view their own attendance history. The portal is built with React.js (Vite), Node.js + Express, MongoDB (Mongoose), JWT authentication, and Tailwind CSS or Material UI.

## Glossary

- **System**: The Office Attendance Portal application as a whole
- **Admin**: A privileged user who manages employees, attendance records, leaves, and reports
- **Employee**: A standard user who records attendance and applies for leave
- **Auth_Service**: The component responsible for authentication and JWT token management
- **Employee_Service**: The component responsible for employee CRUD operations
- **Attendance_Service**: The component responsible for check-in/check-out and attendance tracking
- **Leave_Service**: The component responsible for leave application and approval workflows
- **Report_Service**: The component responsible for generating and exporting reports
- **JWT**: JSON Web Token used for stateless authentication
- **Check-In**: The action of recording an employee's arrival time for the day
- **Check-Out**: The action of recording an employee's departure time and computing working hours
- **Late Mark**: A flag applied when an employee checks in after the configured late threshold (default 10:00 AM)
- **Half Day**: An attendance status applied when working hours are less than 4 hours
- **Full Day**: An attendance status applied when working hours are 8 hours or more
- **Working Hours**: The duration between Check-In and Check-Out times
- **Employee_ID**: A unique, auto-generated identifier assigned to each employee
- **Leave_Type**: A category of leave — Casual Leave, Sick Leave, Paid Leave, or Work From Home
- **Dashboard**: A summary view displaying key metrics and charts
- **Rate_Limiter**: Middleware that restricts the number of API requests per client within a time window

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a user (Admin or Employee), I want to log in with my credentials, so that I can securely access my role-specific portal.

#### Acceptance Criteria

1. WHEN a user submits valid email and password credentials, THE Auth_Service SHALL issue a signed JWT token and return it to the client.
2. WHEN a user submits invalid credentials, THE Auth_Service SHALL return an HTTP 401 response with a descriptive error message.
3. WHEN an Employee submits a valid Employee ID or email along with a correct password, THE Auth_Service SHALL authenticate the Employee and issue a JWT token.
4. THE Auth_Service SHALL hash all passwords using bcrypt before storing them in the database.
5. WHEN a JWT token expires or is invalid, THE Auth_Service SHALL return an HTTP 401 response and the client SHALL redirect the user to the login page.
6. WHEN a user requests a protected route without a valid JWT token, THE Auth_Service SHALL reject the request with an HTTP 401 response.
7. WHEN a user logs out, THE Auth_Service SHALL invalidate the session on the client side and redirect the user to the login page.
8. WHILE a user session is active, THE System SHALL automatically log out the user after a configurable period of inactivity.

---

### Requirement 2: Role-Based Access Control

**User Story:** As a system operator, I want role-based access enforced on all routes, so that Admins and Employees can only access their permitted resources.

#### Acceptance Criteria

1. THE System SHALL assign each user exactly one role: either "admin" or "employee".
2. WHEN an Employee attempts to access an Admin-only route, THE System SHALL return an HTTP 403 response.
3. WHEN an Admin attempts to access an Employee-only route, THE System SHALL permit access.
4. THE System SHALL enforce role checks on every protected API endpoint via middleware.

---

### Requirement 3: Employee Management (Admin)

**User Story:** As an Admin, I want to create, view, update, and delete employee records, so that I can maintain an accurate employee directory.

#### Acceptance Criteria

1. WHEN an Admin submits a new employee form with valid data, THE Employee_Service SHALL create an employee record with an auto-generated Employee_ID and return HTTP 201.
2. THE Employee_Service SHALL auto-generate a unique Employee_ID for every new employee record.
3. WHEN an Admin requests the employee list, THE Employee_Service SHALL return a paginated list of all employee records.
4. WHEN an Admin submits updated employee data for an existing employee, THE Employee_Service SHALL update the record and return the updated employee object.
5. WHEN an Admin deletes an employee, THE Employee_Service SHALL mark the employee record as inactive rather than permanently removing it from the database.
6. THE Employee_Service SHALL store the following fields per employee: name, email, phone, department, designation, Employee_ID, joining date, status (Active/Inactive), and profile photo URL.
7. IF an Admin submits an employee form with a duplicate email, THEN THE Employee_Service SHALL return an HTTP 409 response with a descriptive error message.
8. WHERE profile photo upload is enabled, THE Employee_Service SHALL accept image files and store the file reference in the employee record.
9. WHEN an Admin searches employees by name, department, or designation, THE Employee_Service SHALL return matching records.

---

### Requirement 4: Attendance Check-In

**User Story:** As an Employee, I want to check in with one click, so that my arrival time, IP address, and device information are recorded automatically.

#### Acceptance Criteria

1. WHEN an authenticated Employee triggers a Check-In, THE Attendance_Service SHALL record the current timestamp, IP address, and device information in a new attendance record.
2. IF an Employee attempts a second Check-In on the same calendar day, THEN THE Attendance_Service SHALL reject the request with an HTTP 409 response and a descriptive error message.
3. WHEN a Check-In timestamp is after the configured late threshold (default 10:00 AM), THE Attendance_Service SHALL set the Late Mark flag to true on the attendance record.
4. THE Attendance_Service SHALL store the configured late threshold as a system-level setting that an Admin can update.

---

### Requirement 5: Attendance Check-Out

**User Story:** As an Employee, I want to check out with one click, so that my departure time and total working hours are recorded.

#### Acceptance Criteria

1. WHEN an authenticated Employee triggers a Check-Out, THE Attendance_Service SHALL record the checkout timestamp and compute Working Hours as the difference between Check-Out and Check-In times.
2. IF an Employee attempts a Check-Out without a prior Check-In on the same day, THEN THE Attendance_Service SHALL reject the request with an HTTP 400 response and a descriptive error message.
3. WHEN computed Working Hours are less than 4 hours, THE Attendance_Service SHALL set the attendance status to "Half Day".
4. WHEN computed Working Hours are 8 hours or more, THE Attendance_Service SHALL set the attendance status to "Full Day".
5. WHEN computed Working Hours are between 4 hours (inclusive) and 8 hours (exclusive), THE Attendance_Service SHALL set the attendance status to "Present".

---

### Requirement 6: Admin Attendance Dashboard

**User Story:** As an Admin, I want a real-time attendance dashboard, so that I can monitor daily attendance metrics and trends at a glance.

#### Acceptance Criteria

1. WHEN an Admin views the Attendance Dashboard, THE System SHALL display the total number of employees, employees present today, employees absent today, employees marked late today, and employees on approved leave today.
2. WHEN an Admin views the Attendance Dashboard, THE System SHALL render a monthly attendance graph showing daily present/absent counts for the current month.
3. WHEN an Admin views the Attendance Dashboard, THE System SHALL render per-employee attendance statistics for a selectable date range.
4. WHEN an Admin views the Attendance Dashboard, THE System SHALL render department-level attendance statistics for a selectable date range.
5. WHEN attendance data changes, THE System SHALL reflect updated metrics on the dashboard within 60 seconds without requiring a full page reload.

---

### Requirement 7: Employee Attendance View

**User Story:** As an Employee, I want to view my own attendance history, so that I can track my check-in/check-out records and working hours.

#### Acceptance Criteria

1. WHEN an authenticated Employee requests their attendance history, THE Attendance_Service SHALL return only the records belonging to that Employee.
2. WHEN an Employee views their attendance history, THE System SHALL display date, check-in time, check-out time, working hours, status, and late mark for each record.
3. WHEN an Employee views their attendance history, THE System SHALL provide a calendar view highlighting present, absent, late, and leave days.

---

### Requirement 8: Leave Application (Employee)

**User Story:** As an Employee, I want to apply for leave by selecting a date range and providing a reason, so that my absence is formally recorded and reviewed.

#### Acceptance Criteria

1. WHEN an authenticated Employee submits a leave application with a valid Leave_Type, date range, and reason, THE Leave_Service SHALL create a leave record with status "Pending" and return HTTP 201.
2. IF an Employee submits a leave application with a date range that overlaps an existing approved or pending leave, THEN THE Leave_Service SHALL reject the request with an HTTP 409 response.
3. THE Leave_Service SHALL support the following Leave_Types: Casual Leave, Sick Leave, Paid Leave, and Work From Home.
4. WHEN an Employee views their leave history, THE Leave_Service SHALL return all leave records belonging to that Employee including status (Pending, Approved, Rejected).

---

### Requirement 9: Leave Management (Admin)

**User Story:** As an Admin, I want to approve or reject leave requests and view leave history, so that I can manage workforce availability.

#### Acceptance Criteria

1. WHEN an Admin approves a leave request, THE Leave_Service SHALL update the leave record status to "Approved", record the approving Admin's ID, and notify the relevant Employee.
2. WHEN an Admin rejects a leave request, THE Leave_Service SHALL update the leave record status to "Rejected" and record the approving Admin's ID.
3. WHEN an Admin views the leave list, THE Leave_Service SHALL return a paginated list of all leave records filterable by status, Leave_Type, department, and date range.
4. IF an Admin attempts to approve a leave request that is already in "Approved" or "Rejected" status, THEN THE Leave_Service SHALL return an HTTP 409 response.

---

### Requirement 10: Reports (Admin)

**User Story:** As an Admin, I want to generate and export attendance and leave reports, so that I can analyze workforce data and share it with stakeholders.

#### Acceptance Criteria

1. WHEN an Admin requests a daily report, THE Report_Service SHALL return attendance records for all employees for the specified date.
2. WHEN an Admin requests a monthly report, THE Report_Service SHALL return aggregated attendance data for all employees for the specified month.
3. WHEN an Admin requests an employee report, THE Report_Service SHALL return the full attendance and leave history for the specified employee within a date range.
4. WHEN an Admin requests a department report, THE Report_Service SHALL return aggregated attendance and leave data for all employees in the specified department within a date range.
5. WHEN an Admin exports a report, THE Report_Service SHALL generate the report in the requested format: CSV, Excel (.xlsx), or PDF.
6. IF a report export request specifies an unsupported format, THEN THE Report_Service SHALL return an HTTP 400 response with a descriptive error message.

---

### Requirement 11: Security and API Protection

**User Story:** As a system operator, I want the API to be protected against abuse and unauthorized access, so that the system remains secure and available.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL restrict each client IP to a maximum of 100 requests per 15-minute window on all API routes.
2. IF a client exceeds the rate limit, THEN THE Rate_Limiter SHALL return an HTTP 429 response.
3. THE System SHALL validate all incoming request payloads and return HTTP 400 with field-level error details for invalid inputs.
4. THE Auth_Service SHALL never return plaintext passwords in any API response.
5. THE System SHALL use HTTPS in production to encrypt data in transit.

---

### Requirement 12: UI and Navigation

**User Story:** As a user, I want a responsive, intuitive interface with sidebar navigation, so that I can efficiently navigate the portal on any device.

#### Acceptance Criteria

1. THE System SHALL render a sidebar navigation menu that is accessible on all authenticated pages.
2. THE System SHALL display a loading spinner during all asynchronous data fetch operations.
3. THE System SHALL display toast notifications for success and error outcomes of user actions.
4. THE System SHALL support search and filter controls on all list views (employees, attendance, leaves).
5. THE System SHALL paginate all list views that may return more than 20 records.
6. THE System SHALL render correctly on viewport widths from 375px (mobile) to 1920px (desktop).
7. WHERE dark mode is enabled by the user, THE System SHALL apply a dark color theme across all pages.

---

### Requirement 13: Configuration and Settings (Admin)

**User Story:** As an Admin, I want to configure attendance rules and calendar settings, so that the system reflects my organization's policies.

#### Acceptance Criteria

1. WHEN an Admin updates the late check-in threshold time, THE Attendance_Service SHALL apply the new threshold to all subsequent Check-In evaluations.
2. WHEN an Admin configures weekend days, THE System SHALL exclude those days from attendance tracking and reporting.
3. WHEN an Admin adds a public holiday to the Holiday Calendar, THE System SHALL mark that date as a holiday and exclude it from absent counts.
4. WHERE shift timings are configured, THE Attendance_Service SHALL use the configured shift start time as the late threshold for employees assigned to that shift.
