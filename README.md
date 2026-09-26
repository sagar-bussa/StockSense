# StockSense — Smart Inventory Management System

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0_Passing-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/RLS-Row_Level_Security-blue?logo=auth0&logoColor=white)](https://supabase.com/docs/guides/auth/row-level-security)

**StockSense** is an enterprise-grade, real-time B2B inventory control platform engineered to replace scattered spreadsheets, paper logs, and fragmented stock registers with a single centralized source of truth. Built with React 19, TypeScript, Tailwind CSS v4, and backed by a hardened PostgreSQL database with Row-Level Security (RLS) and immutable audit ledgering.

---

## 🌟 Key Features

### 1. Executive Control Dashboard
- **Real-Time KPIs**: Live tracking of total units on hand, low-stock items, out-of-stock SKUs, pending intake receipts, customer deliveries, and internal transfers.
- **Stock Movement Velocity**: Interactive dual-area charts comparing daily inbound receipts vs outbound dispatches over 7, 14, or 30-day windows.
- **Category & Warehouse Breakdown**: Visual inventory distribution across product categories (Raw Materials, Fasteners, Electronics, Finished Goods) and warehouse facilities.
- **Low Stock Priority Alerts**: Instant warnings for items below minimum reorder thresholds with one-click procurement actions.

### 2. Products & Multi-Location Stock
- **Catalog Management**: Detailed SKU tracking, barcode support, unit of measure (units, kg, meters, liters, boxes), and configurable reorder points.
- **Granular Warehouse Breakdown**: Inspect on-hand, reserved, and available stock down to the specific warehouse, rack, shelf, and bin.
- **Live Search & Metric Pills**: Filter instantly by "All", "In Stock", "Low Stock", or "Out of Stock" with CSV data export.

### 3. Inbound Receipts (Procurement Intake)
- **Supplier Order Intake**: Log vendor deliveries with multi-line item tracking, unit costs, and receiving notes.
- **Two-Phase Confirmation**: Receipts start in `draft` / `waiting` state and are posted to `done` via atomic PostgreSQL RPCs (`validate_receipt`), preventing duplicate intake.
- **Auto-Ledger Entry**: Every validated receipt atomically increments inventory and writes an immutable audit record to the `stock_ledger`.

### 4. Outbound Deliveries (Fulfillment & Dispatch)
- **Customer Shipments**: Create dispatch orders with automated stock availability verification (`check_delivery_availability` RPC).
- **Insufficient Stock Guard**: Hardened validation prevents overselling or drafting dispatches beyond physically accessible stock.
- **Validation Modal**: Review quantities and destination customers before executing atomic stock decrement.

### 5. Internal Cross-Warehouse Transfers
- **Facility Movements**: Shift stock seamlessly between warehouses (e.g., Manchester Central to Leeds Distribution Hub) or between internal zones (bulk store to active pick rack).
- **Zero-Sum Balance Guarantee**: Company-wide stock remains strictly conserved; origin location is decremented and target location is incremented in a single database transaction.

### 6. Physical Stock Counts & Adjustments
- **Audit Reconciliation**: Prefetches system quantities directly from the database (`get_location_stock` RPC).
- **Auto-Variance Calculation**: Automatically computes physical delta (gain/loss) and enforces mandatory auditor reasoning (e.g., cycle count, shrinkage, damaged goods).
- **Immutable Posting**: Instantly writes adjustments to status `done`, recalculating inventory balances and logging auditor attribution.

### 7. Immutable Stock Ledger (Audit Trail)
- **Financial-Grade Traceability**: Append-only transaction log recording timestamp, document type, reference number, SKU, source location, destination location, quantity delta, and running stock balance.
- **Database Trigger Enforced**: Application code cannot update or delete rows in `stock_ledger`; direct writes are blocked at the database engine level.

### 8. Real-Time Alert Center & RBAC
- **Live Notification Hub**: Instant WebSocket/PostgreSQL changes channel pushes alerts for critical stock depletion and operational changes.
- **Role-Based Access Control**:
  - `Admin`: Full organizational control, warehouse configurations, user management.
  - `Inventory Manager`: Product catalog administration and full operational oversight.
  - `Warehouse Staff`: Scoped access to assigned warehouses for day-to-day intake, picking, and transfers.

---

## 🛠️ Architecture & Tech Stack

```
StockSense Client (React 19 + TypeScript + Tailwind CSS v4)
      │
      ├── UI Layer: shadcn/ui + Radix UI + Lucide Icons + Recharts
      ├── State & Cache: TanStack Query v5 + Warehouse Scope Context
      └── Router: React Router v7 with route code-splitting & guards
            │
            ▼
Supabase PostgreSQL Engine
      ├── Row Level Security (RLS) on all 18 tables
      ├── Immutable Stock Ledger (blocked direct table updates/deletes)
      ├── PostgreSQL RPC Functions (Atomic State Transitions)
      └── Realtime WebSockets for Instant Notifications
```

### PostgreSQL Transactional RPCs
All inventory movements strictly bypass raw table updates and execute via validated database functions:
- `create_product`: Validates SKU uniqueness and initial stock allocations.
- `validate_receipt`: Atomically verifies receipt lines, increases warehouse stock, creates ledger lines, and marks receipt `done`.
- `check_delivery_availability`: Evaluates if requested lines can be fulfilled by warehouse stock.
- `validate_delivery`: Atomically deducts stock and records outbound ledger entries.
- `validate_transfer`: Executes paired decrement/increment across locations in a single transaction.
- `post_adjustment`: Reconciles physical counts against system records and logs audit deltas.
- `get_location_stock`: Returns current on-hand stock for a specific SKU and location.
- `mark_notification_read` / `mark_all_notifications_read`: Manages user alert states.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- npm or pnpm
- A Supabase project (or local Supabase instance via Docker)

### 1. Clone & Install
```bash
git clone https://github.com/sagar-bussa/StockSense.git
cd StockSense
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase project credentials:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Database Verification Suite
StockSense includes an end-to-end database verification script that tests all 18 migrations, RLS policies, trigger constraints, and RPC mutation behaviors:
```bash
npm run db:verify
```
*Expected: 96 passed, 0 failed.*

Ensure generated TypeScript database types match the schema:
```bash
npm run db:types:check
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing Suite

StockSense features comprehensive unit, component, and route smoke test coverage powered by Vitest and Testing Library:

```bash
# Run complete test suite (71 tests across all features and routes)
npm test

# Run typecheck
npm run typecheck

# Run linter
npm run lint

# Build production bundle
npm run build
```

---

## 👥 Demo Accounts (Evaluation Credentials)

Seed data provides three pre-configured accounts representing each tier of the RBAC hierarchy:

| Role | Email | Password | Scope & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@stocksense.app` | `StockSense123!` | Global access; manage warehouses, users, products, all operations |
| **Inventory Manager** | `manager@stocksense.app` | `StockSense123!` | Catalog management, all inbound/outbound operations, adjustments, ledger |
| **Warehouse Staff** | `staff@stocksense.app` | `StockSense123!` | Scoped to assigned warehouse; intake receipts, deliveries, internal counts |

---

## 🔄 Hourly Automated Push System

StockSense includes an automated backup and hourly push engine configured to safeguard work during production sprints:
- **Automation Script**: `scripts/auto-push.mjs` executes git status, scans for accidental secrets (`.env`, private keys), stages modified files, generates descriptive commit messages, and pushes to `origin/main`.
- **Scheduled Task**: Configured in Windows Task Scheduler via `scripts/install-hourly-push.ps1` to run once every hour (~:45 of each hour).
- **Execution Logs**: Stored under `.git/push-logs/` (e.g. `push-YYYYMMDD-HHMMSS.log`).
- **Manual Trigger**: Run at any time via:
  ```bash
  npm run push:hourly
  ```

---

## 📄 License
StockSense is licensed under the [MIT License](LICENSE).
