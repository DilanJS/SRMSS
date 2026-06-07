# SRMSS — Smart Route Management System
## Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Project Structure](#4-project-structure)
5. [Backend Modules](#5-backend-modules)
   - 5.1 [Authentication Module](#51-authentication-module)
   - 5.2 [Routes Module](#52-routes-module)
   - 5.3 [Vehicles Module](#53-vehicles-module)
   - 5.4 [Drivers Module](#54-drivers-module)
   - 5.5 [Schedules Module](#55-schedules-module)
   - 5.6 [Tracking Module](#56-tracking-module)
   - 5.7 [Maintenance Module](#57-maintenance-module)
   - 5.8 [Reports Module](#58-reports-module)
   - 5.9 [Dashboard Module](#59-dashboard-module)
6. [Frontend Modules](#6-frontend-modules)
   - 6.1 [Login Page](#61-login-page)
   - 6.2 [Dashboard Page](#62-dashboard-page)
   - 6.3 [Routes Page](#63-routes-page)
   - 6.4 [Vehicles Page](#64-vehicles-page)
   - 6.5 [Drivers Page](#65-drivers-page)
   - 6.6 [Schedules Page](#66-schedules-page)
   - 6.7 [Tracking Page](#67-tracking-page)
   - 6.8 [Maintenance Page](#68-maintenance-page)
   - 6.9 [Reports Page](#69-reports-page)
   - 6.10 [Users Page](#610-users-page)
   - 6.11 [Profile Page](#611-profile-page)
7. [Database Documentation](#7-database-documentation)
   - 7.1 [Firebase Realtime Database](#71-firebase-realtime-database)
   - 7.2 [Local JSON Storage (Development)](#72-local-json-storage-development)
   - 7.3 [Collection Schemas](#73-collection-schemas)
8. [API Reference](#8-api-reference)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Authentication & Session Management](#10-authentication--session-management)
11. [Design System (CSS)](#11-design-system-css)
12. [Configuration & Environment](#12-configuration--environment)
13. [Key Features & Business Logic](#13-key-features--business-logic)
14. [Testing](#14-testing)

---

## 1. Project Overview

**SRMSS (Smart Route Management System)** is a full-stack web application for managing a public or private bus fleet. It covers the complete operational lifecycle: defining routes with GPS stops, managing a vehicle fleet, managing drivers, scheduling trips with conflict detection, live GPS tracking, fuel and maintenance logging, and analytics reporting.

The system supports four user roles — Admin, Manager, Driver, and User — with each role having a scoped view of the system. The frontend is a Single-Page Application (SPA) served by FastAPI alongside the REST API backend. Data is stored in Firebase Realtime Database in production or local JSON files in development.

---

## 2. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.12 | Primary backend language |
| **FastAPI** | Latest | REST API framework (async-capable) |
| **Pydantic v2** | Latest | Data validation and serialization |
| **Pyrebase** | Latest | Firebase Realtime Database + Auth client |
| **HMAC-SHA256 (stdlib)** | — | Custom JWT signing and verification |
| **PBKDF2-SHA256 (stdlib)** | — | Password hashing (local mode) |
| **threading.Lock** | stdlib | Thread safety for local JSON writes |
| **uvicorn** | Latest | ASGI server to run FastAPI |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Vanilla JavaScript (ES6+)** | — | SPA logic, routing, DOM rendering |
| **Leaflet.js** | 1.9.4 | Interactive maps (route planning, live tracking) |
| **html2pdf.js** | Latest | Client-side PDF export for reports |
| **Firebase SDK** | 9.23.0 | Browser-side Firebase auth (optional) |
| **Google Fonts** | — | Manrope (UI text), Space Grotesk (headings/numbers) |
| **OpenStreetMap / Nominatim** | — | Tile layer + reverse geocoding for maps |

### Database & Infrastructure

| Technology | Purpose |
|---|---|
| **Firebase Realtime Database** | Production data store (cloud-hosted NoSQL) |
| **Firebase Authentication** | User credential management (production) |
| **Local JSON files** | Development/test data store (file-based) |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  HTML Pages  │  │   JS Modules │  │  Leaflet.js / Maps    │ │
│  │  (SPA Shell) │  │  (ES6 mods)  │  │  html2pdf.js          │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────┘ │
│         └────────────────┬┘                                     │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP/REST (JWT Bearer)
┌──────────────────────────▼──────────────────────────────────────┐
│                  FastAPI Application (Python)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Routers                          │   │
│  │  /auth  /routes  /vehicles  /drivers  /schedules        │   │
│  │  /tracking  /maintenance  /reports  /dashboard          │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│  ┌────────────────────────▼────────────────────────────────┐   │
│  │                   Service Layer                         │   │
│  │  AuthService  RouteService  VehicleService  ...         │   │
│  │  (dual-provider: Local JSON or Firebase)                │   │
│  └─────────────┬──────────────────────────┬───────────────┘   │
└────────────────┼──────────────────────────┼────────────────────┘
                 │                          │
    ┌────────────▼──────┐        ┌──────────▼──────────────┐
    │  Local JSON Files │        │  Firebase Realtime DB   │
    │  (data/*.json)    │        │  (cloud.firebase.com)   │
    └───────────────────┘        └─────────────────────────┘
```

**Dual-Provider Pattern:** Every service class has a Local implementation and a Firebase implementation. The `ScheduleManager`, `VehicleManager`, `DriverManager`, etc. wrap these and select the active provider at startup based on the `AUTH_PROVIDER` environment variable.

---

## 4. Project Structure

```
SRMSS/
├── main.py                        # Entry point — imports app from app/main.py
├── .env                           # Environment variables (secrets, Firebase keys)
├── .env.example                   # Template for environment configuration
├── http-client.env.json           # HTTP test client credentials
├── test_main.http                 # HTTP request tests for all endpoints
│
├── app/                           # Backend application
│   ├── main.py                    # FastAPI app init, router registration, static files
│   ├── config.py                  # Settings loader (reads .env, exposes get_settings())
│   ├── firebase_config.py         # Firebase app initialization (Pyrebase)
│   │
│   ├── routes/                    # API endpoint handlers (thin controllers)
│   │   ├── auth.py                # /auth/* endpoints + get_current_user dependency
│   │   ├── dashboard.py           # /dashboard/overview
│   │   ├── drivers.py             # /drivers/* endpoints
│   │   ├── maintenance.py         # /maintenance/fuel-logs & maintenance-logs
│   │   ├── reports.py             # /reports/overview
│   │   ├── routes.py              # /routes/* endpoints
│   │   ├── schedules.py           # /schedules/* endpoints
│   │   ├── tracking.py            # /tracking/* endpoints
│   │   └── vehicles.py            # /vehicles/* endpoints
│   │
│   ├── schemas/                   # Pydantic models for request/response validation
│   │   ├── auth.py                # User, login, register, session schemas
│   │   ├── common.py              # PaginatedResponse, paginate() utility
│   │   ├── dashboard.py           # Dashboard overview response schemas
│   │   ├── driver.py              # Driver CRUD schemas
│   │   ├── maintenance.py         # Fuel log + maintenance log schemas
│   │   ├── report.py              # Report overview response schemas
│   │   ├── route.py               # Route CRUD + map schemas
│   │   ├── schedule.py            # Schedule CRUD + conflict + recurring schemas
│   │   ├── tracking.py            # Location update + response schemas
│   │   └── vehicle.py             # Vehicle CRUD + availability schemas
│   │
│   └── services/                  # Business logic (dual-provider pattern)
│       ├── auth_service.py        # Auth, sessions, JWT, user management
│       ├── dashboard_service.py   # Aggregation for dashboard KPIs
│       ├── driver_service.py      # Driver CRUD + availability
│       ├── maintenance_service.py # Fuel logs + maintenance logs + due reminders
│       ├── report_service.py      # Analytics aggregation
│       ├── route_service.py       # Route CRUD + map data
│       ├── schedule_service.py    # Schedule CRUD + conflict detection + recurring
│       ├── tracking_service.py    # GPS location updates and reads
│       └── vehicle_service.py     # Vehicle CRUD + availability
│
├── frontend/                      # Frontend SPA
│   ├── index.html                 # Login page
│   ├── app.html                   # Main SPA shell (loaded after login)
│   ├── routes.html                # (Standalone page, fallback)
│   ├── schedules.html             # (Standalone page, fallback)
│   │
│   ├── css/
│   │   └── styles.css             # Unified design system (4000+ lines, CSS vars)
│   │
│   └── js/
│       ├── api.js                 # apiRequest() — fetch wrapper with error handling
│       ├── auth.js                # localStorage session helpers
│       ├── app.js                 # SPA router — maps URL hash to page modules
│       ├── components.js          # Shared UI: renderShellLayout, renderManagementPage,
│       │                          #   renderEntityTable, openSidePanel, showToast, etc.
│       ├── page-utils.js          # authHeaders(), fetchCurrentUser(), logout()
│       ├── login-page.js          # Login form and redirect logic
│       ├── dashboard-page.js      # Admin/manager KPI dashboard
│       ├── routes-page.js         # Route management + Leaflet map editor
│       ├── vehicles-page.js       # Vehicle fleet management
│       ├── drivers-page.js        # Driver management
│       ├── schedules-page.js      # Schedule management + calendar view
│       ├── tracking-page.js       # Live vehicle tracking map
│       ├── driver-tracker-page.js # Driver self-location update
│       ├── maintenance-page.js    # Fuel and maintenance logs
│       ├── reports-page.js        # Analytics + PDF export
│       ├── users-page.js          # User account management (admin)
│       └── profile-page.js        # Current user profile + sessions
│
└── tests/                         # Backend unit/integration tests
    ├── test_auth.py
    ├── test_dashboard.py
    ├── test_drivers.py
    ├── test_maintenance.py
    ├── test_reports.py
    ├── test_routes.py
    ├── test_schedules.py
    └── test_vehicles.py
```

---

## 5. Backend Modules

### 5.1 Authentication Module

**Files:** `app/routes/auth.py`, `app/services/auth_service.py`, `app/schemas/auth.py`

**Responsibilities:**
- User registration and login
- JWT token generation and validation
- Session creation, listing, and revocation
- User CRUD (admin-only)
- `get_current_user` and `require_roles` FastAPI dependency injection

**Auth Flow:**
1. Client POSTs credentials to `/auth/login`
2. Service validates password hash (PBKDF2-SHA256 in local mode; Firebase Auth in production)
3. Creates a session record with expiry timestamp
4. Signs and returns a JWT (HMAC-SHA256) containing: `sub` (user_id), `sid` (session_id), `role`, `name`, `exp`
5. Client stores token in `localStorage`
6. Every subsequent API request includes `Authorization: Bearer <token>`
7. `get_current_user()` dependency decodes JWT, verifies signature, checks session not revoked

**User Roles:**

| Role | Description |
|---|---|
| `admin` | Full system access including user management |
| `manager` | Operational access — manage fleet, routes, schedules, reports |
| `driver` | View schedules/routes, update own GPS location |
| `user` | Read-only access to routes |

**Key Schemas:**

| Schema | Fields |
|---|---|
| `RegisterRequest` | email, password (8–128 chars), full_name (2–100 chars), role |
| `LoginRequest` | email, password |
| `TokenResponse` | access_token, token_type, expires_in, user, session |
| `UserResponse` | id, email, full_name, role, created_at |
| `SessionResponse` | id, user_id, user_email, created_at, expires_at, revoked_at, is_active |

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register new user (first user becomes admin) |
| POST | `/auth/login` | Public | Login; returns JWT + session |
| GET | `/auth/me` | All | Get current user profile |
| PATCH | `/auth/me` | All | Update own profile |
| POST | `/auth/logout` | All | Revoke current session |
| POST | `/auth/logout-all` | All | Revoke all user sessions |
| GET | `/auth/sessions` | All | List own active sessions |
| GET | `/auth/users` | Admin | List all users (paginated, filterable) |
| POST | `/auth/users` | Admin | Create a user |
| GET | `/auth/users/{id}` | Admin | Get specific user |
| PATCH | `/auth/users/{id}` | Admin | Update user (name, role, password) |
| DELETE | `/auth/users/{id}` | Admin | Delete user (cannot delete self) |

---

### 5.2 Routes Module

**Files:** `app/routes/routes.py`, `app/services/route_service.py`, `app/schemas/route.py`

**Responsibilities:**
- Define bus routes with GPS coordinates, stops, service type
- Store path points for polyline rendering on maps
- Validate route codes for uniqueness

**Key Schemas:**

| Field | Type | Validation |
|---|---|---|
| `route_code` | string | 2–30 chars, uppercase, unique |
| `route_name` | string | 3–120 chars |
| `start_point` / `end_point` | string | 2–100 chars |
| `start_latitude/longitude` | float (optional) | lat: −90–90, lon: −180–180 |
| `end_latitude/longitude` | float (optional) | lat: −90–90, lon: −180–180 |
| `distance_km` | float | > 0, max 5000 |
| `estimated_duration_minutes` | int | > 0, max 10080 (1 week) |
| `service_type` | enum | city, suburban, express, intercity, school, special |
| `active` | bool | — |
| `stops` | array | Each stop: name, lat?, lon?, sequence (must be contiguous from 1) |
| `path_points` | array | `[[lat, lon], ...]` for polyline rendering |
| `assigned_vehicle_id` | string (optional) | — |
| `assigned_driver_id` | string (optional) | — |

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/routes` | Admin, Manager | Create route |
| GET | `/routes` | All | List routes (paginated); filter by service_type, active, search |
| GET | `/routes/{id}` | All | Get route detail |
| GET | `/routes/{id}/map` | All | Get map data (start/end coords, stops, path) |
| PATCH | `/routes/{id}` | Admin, Manager | Update route |
| DELETE | `/routes/{id}` | Admin | Delete route |

**Pagination Summary Fields:** `active`, `inactive`, `express`, `city`, `school`, `intercity` counts

---

### 5.3 Vehicles Module

**Files:** `app/routes/vehicles.py`, `app/services/vehicle_service.py`, `app/schemas/vehicle.py`

**Responsibilities:**
- Manage the vehicle fleet (buses, vans, etc.)
- Track assignment status and mileage
- Availability summary for dashboard

**Key Schemas:**

| Field | Type | Validation |
|---|---|---|
| `registration_no` | string | 4–20 chars, uppercase, unique |
| `fleet_number` | string | 2–20 chars, uppercase, unique |
| `model` / `manufacturer` | string | 2–100 chars |
| `capacity` | int | 1–300 passengers |
| `mileage_km` | float | 0–5,000,000 |
| `fuel_type` | enum | diesel, petrol, electric, hybrid, cng |
| `status` | enum | available, assigned, in_service, maintenance, inactive |
| `active` | bool | — |
| `assigned_route_id` | string (optional) | — |
| `assigned_driver_id` | string (optional) | — |
| `notes` | string (optional) | max 500 chars |

**Vehicle Lifecycle:**
```
available → assigned (when assigned to route/driver)
assigned  → in_service (when schedule goes active)
any       → maintenance (when maintenance log created with in_progress status)
maintenance → available (when maintenance log marked completed)
any       → inactive (manually)
```

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/vehicles` | Admin, Manager | Create vehicle |
| GET | `/vehicles` | All | List (filter: status, active, fuel_type, search) |
| GET | `/vehicles/availability` | All | Count by status |
| GET | `/vehicles/{id}` | All | Get vehicle |
| PATCH | `/vehicles/{id}` | Admin, Manager | Update vehicle |
| DELETE | `/vehicles/{id}` | Admin | Delete vehicle |

---

### 5.4 Drivers Module

**Files:** `app/routes/drivers.py`, `app/services/driver_service.py`, `app/schemas/driver.py`

**Responsibilities:**
- Manage driver records including license and contact info
- Track assignment history
- License expiry alerts

**Key Schemas:**

| Field | Type | Validation |
|---|---|---|
| `employee_no` | string | 2–20 chars, uppercase, unique |
| `full_name` | string | 3–120 chars |
| `license_no` | string | 4–40 chars, uppercase, unique |
| `license_expiry_date` | date (optional) | ISO date |
| `phone_number` | string | 7–20 chars |
| `years_of_experience` | int | 0–60 |
| `working_hours` | float | 0–168 (hours/week) |
| `status` | enum | available, assigned, off_duty, on_leave, inactive |
| `active` | bool | — |
| `assigned_route_id` | string (optional) | — |
| `assigned_vehicle_id` | string (optional) | — |
| `hire_date` | date | ISO date |
| `notes` | string (optional) | max 500 chars |
| `assignment_history` | array | `{route_id?, vehicle_id?, assigned_at, released_at?, notes?}` |

**License Expiry Logic:**
- **Expired:** `license_expiry_date < today`
- **Expiring soon:** `license_expiry_date` within next 30 days
- Both counts surfaced in pagination summary and dashboard

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/drivers` | Admin, Manager | Create driver |
| GET | `/drivers` | All | List (filter: status, active, search) |
| GET | `/drivers/availability` | All | Count by status + expiry alerts |
| GET | `/drivers/{id}` | All | Get driver |
| PATCH | `/drivers/{id}` | Admin, Manager | Update driver |
| DELETE | `/drivers/{id}` | Admin | Delete driver |

---

### 5.5 Schedules Module

**Files:** `app/routes/schedules.py`, `app/services/schedule_service.py`, `app/schemas/schedule.py`

**Responsibilities:**
- Create, update, and delete trip schedules
- Conflict detection (same vehicle or driver, overlapping time window)
- Recurring schedule generation (daily / weekly / monthly)
- Emergency updates with status flagging
- Feed the live dashboard window

**Key Schemas:**

| Field | Type | Validation |
|---|---|---|
| `route_id` | string | Must reference existing route |
| `vehicle_id` | string | Must reference existing vehicle |
| `driver_id` | string | Must reference existing driver |
| `departure_time` | datetime | ISO datetime |
| `arrival_time` | datetime | Must be after departure_time |
| `status` | enum | scheduled, active, completed, cancelled, delayed, emergency |
| `emergency_update` | bool | Set by emergency endpoint only |
| `notes` | string (optional) | max 500 chars |

**Conflict Detection Logic:**
```
Two schedules conflict when:
  departure_A < arrival_B  AND  arrival_A > departure_B
  AND (vehicle_A == vehicle_B  OR  driver_A == driver_B)
  AND status of existing != "cancelled"
```
Conflict messages include human-readable details: vehicle registration, driver name, route code, and time window.

**Recurring Schedule Generation:**

| Pattern | Behaviour |
|---|---|
| `daily` | One schedule per calendar day from departure_date to repeat_until |
| `weekly` | One schedule per selected weekday (0=Mon … 6=Sun) in the range |
| `monthly` | One schedule on the same day-of-month each month (capped at month end) |

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/schedules` | Admin, Manager | Create single schedule |
| POST | `/schedules/recurring` | Admin, Manager | Create recurring schedules |
| POST | `/schedules/conflicts` | Admin, Manager | Check conflicts without creating |
| GET | `/schedules` | All | List (filter: route_id, vehicle_id, driver_id, status, date range) |
| GET | `/schedules/{id}` | All | Get schedule |
| PATCH | `/schedules/{id}` | Admin, Manager | Update schedule |
| PATCH | `/schedules/{id}/emergency` | Admin, Manager | Emergency update (flags status + emergency_update) |
| DELETE | `/schedules/{id}` | Admin | Delete schedule |

---

### 5.6 Tracking Module

**Files:** `app/routes/tracking.py`, `app/services/tracking_service.py`, `app/schemas/tracking.py`

**Responsibilities:**
- Accept GPS location updates from drivers/vehicles
- Store the latest position per vehicle
- Serve all vehicle positions for the tracking map

**Key Schemas:**

| Field | Type | Validation |
|---|---|---|
| `latitude` | float | −90 to 90 |
| `longitude` | float | −180 to 180 |
| `speed_kmh` | float (optional) | 0–300 |
| `heading` | float (optional) | 0–360 degrees |

**Storage:** One record per `vehicle_id` — each update overwrites the previous location. Stored with `updated_at` (ISO timestamp) and `updated_by` (user_id).

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/tracking/{vehicle_id}` | All | Update vehicle location |
| GET | `/tracking` | All | Get all current vehicle locations |

---

### 5.7 Maintenance Module

**Files:** `app/routes/maintenance.py`, `app/services/maintenance_service.py`, `app/schemas/maintenance.py`

**Responsibilities:**
- Log fuel refuelling events (volume, cost, odometer)
- Log maintenance/service events (inspection, repair, oil change, etc.)
- Automatic vehicle status sync based on maintenance status
- Due reminder calculation

**Fuel Log Schema:**

| Field | Type | Validation |
|---|---|---|
| `vehicle_id` | string | Must reference existing vehicle |
| `liters` | float | > 0, max 2000 |
| `cost` | float | 0–1,000,000 |
| `odometer_km` | float | 0–5,000,000 |
| `filled_at` | datetime | ISO datetime |
| `station_name` | string (optional) | max 120 chars |
| `notes` | string (optional) | max 300 chars |

**Side Effect:** Creating a fuel log updates `vehicle.mileage_km` to the logged odometer value.

**Maintenance Log Schema:**

| Field | Type | Validation |
|---|---|---|
| `vehicle_id` | string | Must reference existing vehicle |
| `service_type` | enum | inspection, oil_change, repair, engine_service, tire_service, other |
| `status` | enum | scheduled, in_progress, completed, cancelled |
| `service_date` | date | ISO date |
| `next_due_date` | date (optional) | ISO date |
| `cost` | float | 0–1,000,000 |
| `workshop_name` | string (optional) | max 120 chars |
| `description` | string (optional) | max 500 chars |

**Side Effects:**
- Creating/updating a maintenance log with `status = "in_progress"` → sets `vehicle.status = "maintenance"`
- Updating to `status = "completed"` → sets `vehicle.status = "available"`

**Due Reminders:** Returns maintenance logs where `next_due_date` falls within the next N days (default 30). Includes `days_until_due` field.

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/maintenance/fuel-logs` | Admin, Manager | Create fuel log |
| GET | `/maintenance/fuel-logs` | All | List fuel logs (filter: vehicle_id, date range) |
| POST | `/maintenance/maintenance-logs` | Admin, Manager | Create maintenance log |
| GET | `/maintenance/maintenance-logs` | All | List maintenance logs (filter: vehicle_id, status, service_type) |
| GET | `/maintenance/maintenance-logs/{id}` | All | Get maintenance log |
| PATCH | `/maintenance/maintenance-logs/{id}` | Admin, Manager | Update maintenance log |
| GET | `/maintenance/due-reminders` | All | Get upcoming maintenance due |

---

### 5.8 Reports Module

**Files:** `app/routes/reports.py`, `app/services/report_service.py`, `app/schemas/report.py`

**Responsibilities:**
- Aggregate data across schedules, fuel logs, maintenance logs
- Produce per-route, per-driver, per-vehicle performance summaries
- Optional date-range filtering

**Report Sections:**

| Section | Data Points |
|---|---|
| **Route Performance** | trip_count, completed_trips, delayed_trips, emergency_trips, completion_rate % |
| **Fuel Consumption** | total_liters, total_cost, log_count, avg_efficiency (L/100km) |
| **Maintenance Costs** | total_cost, maintenance_count, in_progress_count |
| **Driver Performance** | trip_count, completed_trips, delayed_trips, completion_rate % |
| **Operations Summary** | total_routes, total_schedules, completed/active/delayed/emergency/cancelled counts, total_fuel_cost, total_maintenance_cost |

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/reports/overview` | Admin, Manager | Full analytics report (optional date_from, date_to query params) |

---

### 5.9 Dashboard Module

**Files:** `app/routes/dashboard.py`, `app/services/dashboard_service.py`, `app/schemas/dashboard.py`

**Responsibilities:**
- Aggregate real-time KPIs across all modules
- Return a live schedule window (next 6 hours of activity)
- Compute fleet and driver utilization percentages

**Dashboard Response:**

| Section | Fields |
|---|---|
| **counts** | total_routes, active_routes, total_vehicles, available_buses, assigned_vehicles, total_drivers, assigned_drivers, active_trips, on_time_trips, delayed_trips, completed_trips |
| **utilization** | vehicle_utilization_percent, driver_utilization_percent |
| **live_schedule_window** | Up to 20 schedules with departure in next 6 hours; includes route_code, route_name, vehicle (registration_no), driver (full_name), departure_time, arrival_time, status |

**Utilization Formula:**
```
vehicle_utilization % = (assigned + in_service vehicles) / total_vehicles × 100
driver_utilization %  = assigned_drivers / total_drivers × 100
```

**API Endpoints:**

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/dashboard/overview` | Admin, Manager | Full KPI snapshot |

---

## 6. Frontend Modules

All frontend pages follow the same module contract:

```javascript
export async function mount(container, token) { ... }
```

The SPA router in `app.js` maps URL hashes to page modules and calls `mount()` after each navigation.

---

### 6.1 Login Page

**File:** `frontend/js/login-page.js`

**Functionality:**
- Email + password form with inline error display
- Calls `POST /auth/login`
- Stores `access_token` and user object in `localStorage`
- Role-based redirect after login:
  - `admin` / `manager` → `#dashboard`
  - `driver` → `#schedules`
  - `user` → `#routes`
- Auto-redirects to correct page if already logged in

---

### 6.2 Dashboard Page

**File:** `frontend/js/dashboard-page.js`

**Functionality:**
- Stat cards: total routes, active routes, vehicles (available/assigned), drivers (assigned), active trips, on-time trips, delayed trips, completed trips
- Live schedule window table: next 20 upcoming/active trips with route, vehicle, driver, and time
- Utilization cards: vehicle utilization %, driver utilization %
- Auto-refresh every **30 seconds**
- Access restricted to `admin` and `manager`; other roles see a permission message

---

### 6.3 Routes Page

**File:** `frontend/js/routes-page.js`

**Functionality:**
- Paginated table of routes with search and service_type filter
- **Create/Edit side panel** with:
  - Fields: route code, name, start/end points, distance, duration, service type, active toggle
  - **Leaflet map editor** (center: Sri Lanka `[7.8731, 80.7718]`, zoom 8)
    - Click-to-place Start (S), Stops (numbered), and End (E) markers
    - Mode toolbar: Set Start / Add Stop / Set End
    - Reverse geocoding via Nominatim (auto-fills stop names)
    - Polyline drawn connecting all points in order
  - Manual stop list with drag-reorder and delete
- Delete with confirmation modal
- Summary stats bar: active, inactive, express, city, school, intercity counts

---

### 6.4 Vehicles Page

**File:** `frontend/js/vehicles-page.js`

**Functionality:**
- Paginated table with filters: status, fuel_type, active, search
- Create/Edit side panel with all vehicle fields
- Status badge display (color-coded)
- Summary stats: total, available, assigned, in_service, maintenance, inactive
- Delete with confirmation (admin only)

---

### 6.5 Drivers Page

**File:** `frontend/js/drivers-page.js`

**Functionality:**
- Paginated table with filters: status, active, search
- Create/Edit side panel with all driver fields
- **License expiry warning** indicators in the table
- Summary stats: total active, assigned, expired licenses, expiring soon (30 days)
- Delete with confirmation (admin only)

---

### 6.6 Schedules Page

**File:** `frontend/js/schedules-page.js`

**Functionality:**

**Calendar View (default):**
- 7-column month grid with Monday start
- Events displayed as color-coded pills (route code + departure time)
- Horizontally scrollable calendar grid (`cal-scroll-wrap`) — page does not scroll horizontally
- Max 3 events visible per cell; `+N more` chip switches to list view
- Month navigation: prev / next / Today buttons
- Event status colors: blue (scheduled), green (active), grey (completed), amber (delayed), red (emergency/cancelled)
- On mobile (≤ 480px): events collapse to colored dots only

**List View:**
- Full table with route, vehicle, driver, departure, arrival, status, actions

**Shared Features:**
- Toggle between Calendar / List view
- Filters: status, date-from, date-to
- **Create / Edit side panel:**
  - Route, Vehicle, Driver selects
  - Departure and Arrival datetime pickers
  - Status (edit only)
  - Notes field
  - **Recurring schedule** toggle (create only): daily/weekly (with weekday checkboxes)/monthly + repeat-until date
- **Check Conflicts button:** Calls `/schedules/conflicts` without creating; shows human-readable conflict messages
- Emergency update via dedicated endpoint
- Delete with confirmation (admin only)

---

### 6.7 Tracking Page

**File:** `frontend/js/tracking-page.js` and `frontend/js/driver-tracker-page.js`

**Admin/Manager View (`tracking-page.js`):**
- Leaflet map showing all vehicles with current GPS positions
- Vehicle markers with registration number labels
- Speed and heading info from latest update

**Driver Self-Tracking (`driver-tracker-page.js`):**
- Sends `POST /tracking/{vehicle_id}` with device GPS coords
- Uses `navigator.geolocation.watchPosition()`
- Shows current location on personal map view

---

### 6.8 Maintenance Page

**File:** `frontend/js/maintenance-page.js`

**Functionality:**
- Two tabs: **Fuel Logs** and **Maintenance Logs**
- Fuel Logs: vehicle, liters, cost, odometer, fill date, station name
- Maintenance Logs: vehicle, service type, status, dates, cost, workshop, description
- **Due Reminders** section: highlights upcoming maintenance (within 30 days) with days-until-due
- Filters: vehicle_id, date range (fuel), status/service_type (maintenance)
- Status badges: scheduled, in_progress, completed, cancelled

---

### 6.9 Reports Page

**File:** `frontend/js/reports-page.js`

**Functionality:**
- Date range picker (date_from / date_to)
- Sections: Route Performance, Driver Performance, Fuel Consumption, Maintenance Costs, Operations Summary
- Data tables with sortable columns and calculated metrics
- **Export to PDF** via html2pdf.js (entire report page)

---

### 6.10 Users Page

**File:** `frontend/js/users-page.js`

**Functionality (Admin only):**
- List all users with email, role, created date
- Create user modal: email, password, full name, role
- Edit user: change full name, role, password
- Delete user (cannot delete own account)
- Search and filter by role

---

### 6.11 Profile Page

**File:** `frontend/js/profile-page.js`

**Functionality:**
- Display current user info (name, email, role, member since)
- Edit full name
- Change password
- View all active sessions (device info, created/expires timestamps)
- Logout from current session or all sessions

---

## 7. Database Documentation

### 7.1 Firebase Realtime Database

**Database URL:** `https://srmss-b0cb5-default-rtdb.firebaseio.com/`
**Project ID:** `srmss-b0cb5`

Firebase Realtime Database stores data as a single large JSON tree. Each top-level key is a collection. Records are keyed by UUID.

### 7.2 Local JSON Storage (Development)

When `AUTH_PROVIDER` is not `"firebase"`, data is stored in the `data/` directory as JSON files:

| File | Collection |
|---|---|
| `data/users.json` | User accounts |
| `data/sessions.json` | Auth sessions |
| `data/drivers.json` | Driver records |
| `data/vehicles.json` | Vehicle records |
| `data/routes.json` | Route definitions |
| `data/schedules.json` | Trip schedules |
| `data/fuel_logs.json` | Fuel refuel events |
| `data/maintenance_logs.json` | Maintenance/service events |
| `data/vehicle_locations.json` | Current GPS positions |

Thread safety for local writes is enforced with `threading.Lock` per service.

### 7.3 Collection Schemas

#### `users` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `email` | string | Unique user email |
| `name` | string | Full display name |
| `role` | enum | admin, manager, driver, user |
| `password_hash` | string | PBKDF2-SHA256 hash (local mode only) |
| `created_at` | ISO datetime | Account creation timestamp |

#### `sessions` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Session primary key |
| `user_id` | string | Reference to users collection |
| `user_email` | string | Cached for display |
| `created_at` | ISO datetime | Session start |
| `expires_at` | ISO datetime | Token expiry (created_at + TOKEN_EXPIRE_MINUTES) |
| `revoked_at` | ISO datetime / null | Set on logout; null if still active |

#### `drivers` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `employee_no` | string | Unique employee number (e.g. "DRV-001") |
| `full_name` | string | Driver's full name |
| `license_no` | string | Unique driving license number |
| `license_expiry_date` | ISO date / null | License expiry |
| `phone_number` | string | Contact number |
| `years_of_experience` | int | 0–60 |
| `working_hours` | float | Weekly working hours (0–168) |
| `status` | enum | available, assigned, off_duty, on_leave, inactive |
| `active` | bool | Soft-active flag |
| `hire_date` | ISO date | Employment start date |
| `assigned_route_id` | string / null | Current route assignment |
| `assigned_vehicle_id` | string / null | Current vehicle assignment |
| `notes` | string / null | Free text notes |
| `assignment_history` | array | `[{route_id?, vehicle_id?, assigned_at, released_at?, notes?}]` |
| `created_at` | ISO datetime | — |
| `updated_at` | ISO datetime | — |
| `created_by` | string (user_id) | Who created this record |

#### `vehicles` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `registration_no` | string | Unique license plate (e.g. "ABC-1234") |
| `fleet_number` | string | Internal fleet identifier |
| `model` | string | Vehicle model name |
| `manufacturer` | string | Vehicle manufacturer |
| `capacity` | int | Passenger capacity (1–300) |
| `mileage_km` | float | Odometer reading (updated by fuel logs) |
| `fuel_type` | enum | diesel, petrol, electric, hybrid, cng |
| `status` | enum | available, assigned, in_service, maintenance, inactive |
| `active` | bool | Soft-active flag |
| `assigned_route_id` | string / null | Current route |
| `assigned_driver_id` | string / null | Current driver |
| `notes` | string / null | Free text notes |
| `created_at` | ISO datetime | — |
| `updated_at` | ISO datetime | — |
| `created_by` | string (user_id) | — |

#### `routes` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `route_code` | string | Unique code (e.g. "R-101") |
| `route_name` | string | Human-readable name |
| `start_point` | string | Starting location name |
| `start_latitude` | float / null | GPS latitude of start |
| `start_longitude` | float / null | GPS longitude of start |
| `end_point` | string | Ending location name |
| `end_latitude` | float / null | GPS latitude of end |
| `end_longitude` | float / null | GPS longitude of end |
| `distance_km` | float | Route length in km |
| `estimated_duration_minutes` | int | Expected trip duration |
| `service_type` | enum | city, suburban, express, intercity, school, special |
| `active` | bool | Whether route is currently operational |
| `stops` | array | `[{name, latitude?, longitude?, sequence}]` (sequence starts at 1) |
| `path_points` | array | `[[lat, lon], ...]` for map polyline |
| `assigned_vehicle_id` | string / null | Assigned vehicle |
| `assigned_driver_id` | string / null | Assigned driver |
| `created_at` | ISO datetime | — |
| `updated_at` | ISO datetime | — |
| `created_by` | string (user_id) | — |

#### `schedules` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `route_id` | string | Reference to routes |
| `vehicle_id` | string | Reference to vehicles |
| `driver_id` | string | Reference to drivers |
| `departure_time` | ISO datetime | Scheduled departure |
| `arrival_time` | ISO datetime | Scheduled arrival (must be > departure) |
| `status` | enum | scheduled, active, completed, cancelled, delayed, emergency |
| `emergency_update` | bool | True if patched via emergency endpoint |
| `notes` | string / null | Free text notes |
| `created_at` | ISO datetime | — |
| `updated_at` | ISO datetime | — |
| `created_by` | string (user_id) | — |

#### `fuel_logs` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `vehicle_id` | string | Reference to vehicles |
| `liters` | float | Fuel volume added |
| `cost` | float | Total cost of refuel |
| `odometer_km` | float | Vehicle odometer at time of fill |
| `filled_at` | ISO datetime | Timestamp of refuelling |
| `station_name` | string / null | Fuel station name |
| `notes` | string / null | Free text notes |
| `created_at` | ISO datetime | — |
| `created_by` | string (user_id) | — |

#### `maintenance_logs` Collection

| Field | Type | Description |
|---|---|---|
| `id` (key) | string (UUID) | Primary key |
| `vehicle_id` | string | Reference to vehicles |
| `service_type` | enum | inspection, oil_change, repair, engine_service, tire_service, other |
| `status` | enum | scheduled, in_progress, completed, cancelled |
| `service_date` | ISO date | Date of service |
| `next_due_date` | ISO date / null | When next service is due |
| `cost` | float | Cost of maintenance |
| `workshop_name` | string / null | Service provider name |
| `description` | string / null | Details of work done |
| `created_at` | ISO datetime | — |
| `updated_at` | ISO datetime | — |
| `created_by` | string (user_id) | — |

#### `vehicle_locations` Collection

| Field | Type | Description |
|---|---|---|
| `vehicle_id` (key) | string | Vehicle ID (overwrites on each update) |
| `latitude` | float | Current GPS latitude |
| `longitude` | float | Current GPS longitude |
| `speed_kmh` | float / null | Speed at time of update |
| `heading` | float / null | Compass heading (0–360°) |
| `updated_at` | ISO datetime | Timestamp of last update |
| `updated_by` | string (user_id) | Who submitted the location |

---

## 8. API Reference

### Base URL
```
http://localhost:8000
```

### Common Headers
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Paginated Response Format
```json
{
  "items": [ ... ],
  "total": 100,
  "page": 1,
  "page_size": 15,
  "total_pages": 7,
  "summary": { "active": 45, "inactive": 55 }
}
```

### Error Response Format
```json
{ "detail": "Human-readable error message" }
```

### Validation Error Format
```json
{
  "detail": [
    { "type": "string_too_short", "loc": ["body", "field_name"], "msg": "..." }
  ]
}
```

### All Endpoints Summary

| Method | Path | Min Role | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register user |
| POST | `/auth/login` | Public | Login |
| GET | `/auth/me` | User | Own profile |
| PATCH | `/auth/me` | User | Update own profile |
| POST | `/auth/logout` | User | Logout current session |
| POST | `/auth/logout-all` | User | Logout all sessions |
| GET | `/auth/sessions` | User | List own sessions |
| GET | `/auth/users` | Admin | List all users |
| POST | `/auth/users` | Admin | Create user |
| GET | `/auth/users/{id}` | Admin | Get user |
| PATCH | `/auth/users/{id}` | Admin | Update user |
| DELETE | `/auth/users/{id}` | Admin | Delete user |
| GET | `/dashboard/overview` | Manager | KPI dashboard |
| POST | `/routes` | Manager | Create route |
| GET | `/routes` | User | List routes |
| GET | `/routes/{id}` | User | Get route |
| GET | `/routes/{id}/map` | User | Get route map data |
| PATCH | `/routes/{id}` | Manager | Update route |
| DELETE | `/routes/{id}` | Admin | Delete route |
| POST | `/vehicles` | Manager | Create vehicle |
| GET | `/vehicles` | User | List vehicles |
| GET | `/vehicles/availability` | User | Availability summary |
| GET | `/vehicles/{id}` | User | Get vehicle |
| PATCH | `/vehicles/{id}` | Manager | Update vehicle |
| DELETE | `/vehicles/{id}` | Admin | Delete vehicle |
| POST | `/drivers` | Manager | Create driver |
| GET | `/drivers` | User | List drivers |
| GET | `/drivers/availability` | User | Availability summary |
| GET | `/drivers/{id}` | User | Get driver |
| PATCH | `/drivers/{id}` | Manager | Update driver |
| DELETE | `/drivers/{id}` | Admin | Delete driver |
| POST | `/schedules` | Manager | Create schedule |
| POST | `/schedules/recurring` | Manager | Create recurring schedules |
| POST | `/schedules/conflicts` | Manager | Check conflicts |
| GET | `/schedules` | User | List schedules |
| GET | `/schedules/{id}` | User | Get schedule |
| PATCH | `/schedules/{id}` | Manager | Update schedule |
| PATCH | `/schedules/{id}/emergency` | Manager | Emergency update |
| DELETE | `/schedules/{id}` | Admin | Delete schedule |
| POST | `/tracking/{vehicle_id}` | User | Update GPS location |
| GET | `/tracking` | User | Get all locations |
| POST | `/maintenance/fuel-logs` | Manager | Create fuel log |
| GET | `/maintenance/fuel-logs` | User | List fuel logs |
| POST | `/maintenance/maintenance-logs` | Manager | Create maintenance log |
| GET | `/maintenance/maintenance-logs` | User | List maintenance logs |
| GET | `/maintenance/maintenance-logs/{id}` | User | Get maintenance log |
| PATCH | `/maintenance/maintenance-logs/{id}` | Manager | Update maintenance log |
| GET | `/maintenance/due-reminders` | User | Get upcoming maintenance |
| GET | `/reports/overview` | Manager | Full analytics report |
| GET | `/` | Public | Health check |
| GET | `/health` | Public | Status ping |
| GET | `/api/firebase-config` | Public | Frontend Firebase config |

---

## 9. Role-Based Access Control

| Feature | Admin | Manager | Driver | User |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ❌ | ❌ |
| Routes (view) | ✅ | ✅ | ✅ | ✅ |
| Routes (create/edit) | ✅ | ✅ | ❌ | ❌ |
| Routes (delete) | ✅ | ❌ | ❌ | ❌ |
| Vehicles (view) | ✅ | ✅ | ✅ | ✅ |
| Vehicles (create/edit) | ✅ | ✅ | ❌ | ❌ |
| Vehicles (delete) | ✅ | ❌ | ❌ | ❌ |
| Drivers (view) | ✅ | ✅ | ✅ | ✅ |
| Drivers (create/edit) | ✅ | ✅ | ❌ | ❌ |
| Drivers (delete) | ✅ | ❌ | ❌ | ❌ |
| Schedules (view) | ✅ | ✅ | ✅ | ✅ |
| Schedules (create/edit/conflict check) | ✅ | ✅ | ❌ | ❌ |
| Schedules (delete) | ✅ | ❌ | ❌ | ❌ |
| Tracking (view all) | ✅ | ✅ | ✅ | ✅ |
| Tracking (update location) | ✅ | ✅ | ✅ | ✅ |
| Maintenance (view) | ✅ | ✅ | ✅ | ✅ |
| Maintenance (create/edit) | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ |

---

## 10. Authentication & Session Management

### JWT Token Structure
```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: {
  "sub":  "<user_id>",
  "sid":  "<session_id>",
  "role": "admin|manager|driver|user",
  "name": "Full Name",
  "exp":  <unix_timestamp>
}
```

**Signing:** Custom HMAC-SHA256 implementation using Python's `hmac` + `hashlib` stdlib.

### Token Lifecycle
```
Login → Token issued (60 min default) + Session created
      ↓
Every request → Token decoded → Session checked (not revoked, not expired)
      ↓
Logout → Session revoked_at set → Token becomes invalid immediately
```

### Multi-Session Support
- Multiple devices can be logged in simultaneously
- Each login creates a new independent session
- `POST /auth/logout` revokes only the current session
- `POST /auth/logout-all` revokes all sessions for the user

### Password Security (Local Mode)
- **Algorithm:** PBKDF2-SHA256
- **Iterations:** 100,000
- **Salt:** Cryptographically random, stored with hash

---

## 11. Design System (CSS)

The entire frontend uses a single unified CSS file (`frontend/css/styles.css`) built around CSS custom properties.

### Color Palette

| Variable | Value | Usage |
|---|---|---|
| `--navy` | `#0f1f3d` | Sidebar background, primary dark |
| `--blue` | `#2563eb` | Primary action color, active nav, buttons |
| `--blue-hover` | `#1d4ed8` | Button hover state |
| `--blue-light` | `#dbeafe` | Light blue backgrounds, highlights |
| `--blue-faint` | `#f0f5ff` | Today calendar cell background |
| `--bg` | `#f1f4f9` | Page background |
| `--bg-panel` | `#ffffff` | Card/panel background |
| `--surface` | `#f8fafc` | Subtle surface backgrounds |
| `--line` | `#e2e8f0` | Default borders |
| `--line-strong` | `#cbd5e1` | Emphasized borders |
| `--text` | `#0f172a` | Primary text |
| `--text-soft` | `#64748b` | Secondary/label text |
| `--text-faint` | `#94a3b8` | Disabled/placeholder text |
| `--green` | `#16a34a` | Success, active status |
| `--amber` | `#d97706` | Warning, delayed status |
| `--red` | `#dc2626` | Error, emergency, danger actions |

### Typography

| Font | Weights | Usage |
|---|---|---|
| **Manrope** | 400, 500, 700, 800 | Body text, UI labels, buttons |
| **Space Grotesk** | 500, 700 | Headings, stat numbers, route codes |

### Responsive Breakpoints

| Breakpoint | Target | Key Changes |
|---|---|---|
| `≤ 1200px` | Large tablet | Sidebar narrows to 220px, stats 3-col |
| `≤ 1024px` | Tablet | Sidebar collapses to hamburger overlay |
| `≤ 768px` | Mobile | Single-column layout, smaller text, full-width buttons |
| `≤ 480px` | Small mobile | Calendar shows dots-only, compact padding |

### Status Badge Colors

| Status | Background | Text |
|---|---|---|
| scheduled | `#dbeafe` | `#1d4ed8` |
| active | `#dcfce7` | `#15803d` |
| completed | `#f1f5f9` | `#64748b` |
| delayed | `#fef3c7` | `#d97706` |
| emergency | `#fee2e2` | `#dc2626` |
| cancelled | `#fee2e2` (55% opacity) | `#dc2626` |

---

## 12. Configuration & Environment

### `.env` File

```env
APP_NAME=SRMSS API
AUTH_PROVIDER=firebase          # "firebase" or any other value for local mode
APP_SECRET_KEY=<change-me>      # JWT signing secret — use a long random string in production
TOKEN_EXPIRE_MINUTES=60         # JWT lifetime in minutes
APP_STORAGE_DIR=data            # Directory for local JSON storage (local mode only)

# Firebase credentials (required when AUTH_PROVIDER=firebase)
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_DATABASE_URL=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
```

### Provider Selection Logic

```python
if settings.auth_provider == "firebase":
    self.provider = FirebaseXxxService()   # Uses Pyrebase + Firebase Realtime DB
else:
    self.provider = LocalXxxService(settings.storage_dir)  # Uses JSON files
```

### Running the Application

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --port 8000

# Access
# API:      http://localhost:8000
# Frontend: http://localhost:8000/frontend/index.html
# API Docs: http://localhost:8000/docs
```

---

## 13. Key Features & Business Logic

### Schedule Conflict Detection
When creating or checking a schedule, the system scans all existing non-cancelled schedules for the same vehicle or driver. A conflict exists when:
```
new.departure < existing.arrival  AND  new.arrival > existing.departure
AND (same vehicle  OR  same driver)
```
Conflict messages name the vehicle registration or driver name, the route code/name, and the conflicting time window in human-readable format.

### Recurring Schedule Generation
Three patterns are supported:
- **Daily:** One schedule per day from departure date until `repeat_until`
- **Weekly:** Schedules on selected weekdays (Mon=0 … Sun=6) within the date range
- **Monthly:** Schedules on the same day-of-month each month (adjusts for short months)

Conflicting occurrences are silently skipped; the API returns `{created: N, skipped: M}`.

### Maintenance ↔ Vehicle Status Sync
- Creating/updating a maintenance log with `status = "in_progress"` automatically sets the linked vehicle to `status = "maintenance"`
- When that log is updated to `status = "completed"`, the vehicle reverts to `status = "available"`

### Fuel Log → Odometer Sync
Every fuel log creation updates the vehicle's `mileage_km` field to the logged `odometer_km` value.

### Dashboard Live Window
The dashboard `live_schedule_window` fetches all schedules and returns up to 20 with `departure_time` in the next 6 hours, sorted by departure. Schedules with `status = "completed"` or `"cancelled"` are excluded.

### License Expiry Tracking
The driver availability endpoint and pagination summary automatically flag:
- `expired_licenses`: drivers with `license_expiry_date < today`
- `expiring_licenses`: drivers with expiry within 30 days

### Fuel Efficiency Calculation (Reports)
```
avg_efficiency (L/100km) = total_liters / total_distance_km × 100
```
Distance is estimated from routes assigned to the vehicle during the period.

---

## 14. Testing

Tests use FastAPI's `TestClient` with a temporary local storage directory to run fully isolated from Firebase.

### Test Files

| File | Coverage |
|---|---|
| `tests/test_auth.py` | Registration, login, JWT decode, session management, RBAC enforcement |
| `tests/test_dashboard.py` | Overview KPIs, utilization calculation, live schedule window |
| `tests/test_drivers.py` | CRUD, uniqueness constraints, availability, search/filter |
| `tests/test_maintenance.py` | Fuel logs, maintenance logs, vehicle status sync, due reminders |
| `tests/test_reports.py` | Aggregation accuracy, date range filtering |
| `tests/test_routes.py` | CRUD, route code uniqueness, map data, stop validation |
| `tests/test_schedules.py` | CRUD, conflict detection, recurring generation, emergency update |
| `tests/test_vehicles.py` | CRUD, uniqueness constraints, availability summary |

### Test Pattern

```python
# Setup
import os, tempfile
os.environ["AUTH_PROVIDER"] = "local"
os.environ["APP_STORAGE_DIR"] = tempfile.mkdtemp()

# Use FastAPI TestClient
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

# Authenticate
token = client.post("/auth/login", json={...}).json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Test endpoint
response = client.get("/routes", headers=headers)
assert response.status_code == 200
assert response.json()["total"] == 1
```

### HTTP Client Testing

`test_main.http` contains pre-built HTTP requests for manual API testing using IDE HTTP clients (e.g., JetBrains HTTP Client). Credentials and generated IDs are stored in `http-client.env.json`.

---

*Documentation generated for SRMSS v1.0 — June 2026*
