# NeoAccountingZ

A multi-tenant SaaS accounting application (Next.js 14 + PostgreSQL), modeled on the
menu structure of Zoho Books: **Items, Sales, Purchases, Time Tracking, Banking,
Accountant, Reports, Documents.**

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **PostgreSQL** via `pg` (no ORM — a small generic query layer, see below)
- **node-pg-migrate** for schema migrations
- **Auth.js (NextAuth v5)** with a Credentials provider (email + password), JWT sessions
- **Multi-tenancy**: shared database, every business table has an `organization_id`
  column; every query is scoped to the signed-in user's active organization

## Getting started

```bash
npm install
cp .env.example .env          # edit DATABASE_URL if needed
createdb neoaccountingz        # or: psql -c "CREATE DATABASE neoaccountingz"
npm run migrate:up             # creates all tables
npm run seed                   # optional: demo org + sample data
npm run dev                    # http://localhost:3000
```

### Demo login (after `npm run seed`)

- Organization: **NeoProp Technologies**
- Email: **aditya.kishor@gmail.com**
- Password: **Password123!**

Or click "Create one" on the login page to sign up your own organization from
scratch — every new signup gets its own isolated tenant with a starter chart of
accounts and a default cash account.

## Menu structure

| Menu | Sub-items |
|---|---|
| Home | Dashboard with KPIs, recent invoices, quick actions |
| Items | Items |
| Sales | Customers, Quotes, Invoices, Recurring Invoices, Delivery Challans, Payments Received, Credit Notes |
| Purchases | Vendors, Expenses, Recurring Expenses, Bills, Recurring Bills, Payments Made, Vendor Credits |
| Time Tracking | (placeholder) |
| Banking | Bank / Credit Card accounts, "Add Bank or Credit Card" modal |
| Accountant | Manual Journals, Bulk Update, Currency Adjustments, Chart of Accounts, Budgets, Transaction Locking |
| Reports | (placeholder) |
| Documents | (placeholder) |

## Architecture notes

**Entity registry, not hand-written CRUD per module.** `src/lib/entities.ts` declares
every simple ("flat") entity once — its table, fields, field types, select options,
and which other entity a field references (e.g. an Invoice's `customer_id` points at
`customers`). One generic API route (`/api/entities/[entity]`), one generic list page,
and one generic form component then serve *all* of Items, Customers, Vendors,
Recurring Invoices, Delivery Challans, Payments Received/Made, Credit/Vendor Notes,
Expenses, Chart of Accounts, Budgets, Currency Adjustments and Transaction Locking.
Add a new flat entity by adding one object to that file — no new routes or pages
required (the `[slug]` dynamic route picks it up automatically).

**Documents with line items** (Quotes, Invoices, Bills) and **Manual Journals** (debit/
credit lines) don't fit the flat pattern, so they get their own small, dedicated API
routes (`/api/documents/[entity]`, `/api/journals`) and form components
(`DocumentForm`, `JournalForm`), but still share the same list page and the same
entity metadata for their header fields.

**Multi-tenancy.** Every table has `organization_id`. `requireActiveContext()`
(`src/lib/session.ts`) resolves the signed-in user's active organization from their
JWT session on every server-rendered page; every API route re-derives it via
`getApiOrgContext()` and includes it in every `WHERE` clause and `INSERT`. A user can
belong to multiple organizations (multiple `memberships` rows) and switch between them
from the organization picker in the top bar — this updates the JWT via
`useSession().update()` without a full re-login.

**Auth split for the Edge runtime.** `src/lib/auth.config.ts` is a DB-free config
used by `middleware.ts` (which runs on the Edge runtime and can't bundle `pg`).
`src/lib/auth.ts` extends it with the Credentials provider and the DB-backed
`jwt`/`session` callbacks, and is only ever imported from Node.js-runtime code
(route handlers, server components).

## Project layout

```
migrations/                  node-pg-migrate schema (one file, all tables)
scripts/seed.ts               demo data
src/lib/entities.ts            entity registry (the heart of the generic CRUD engine)
src/lib/documents.ts           config for line-item documents (quotes/invoices/bills)
src/lib/crud.ts                generic list/get/create/update/delete for flat entities
src/lib/auth.ts, auth.config.ts, session.ts   auth + multi-tenant session context
src/components/crud/           generic list page, form, data table, document/journal forms
src/components/banking/        Banking page + "Add Bank or Credit Card" modal
src/app/(app)/[slug]/          dynamic list/new/edit routes for every flat & document entity
src/app/(app)/banking, reports, documents, time-tracking, bulk-update   dedicated pages
src/app/api/entities/[entity]  generic REST API for flat entities
src/app/api/documents/[entity] transactional API for quotes/invoices/bills (+ line items)
src/app/api/journals           transactional API for manual journals (+ debit/credit lines)
```

## What's not built yet

This is a solid, working first version — full multi-tenant auth, org switching, and
real create/edit/delete for every module in the menu, backed by Postgres. It does not
yet include: PDF invoice generation/emailing, a payment gateway, running bank
reconciliation, real Profit & Loss / Balance Sheet reports (the Reports page is a
placeholder), file attachments (Documents page is a placeholder), or recurring
invoice/bill/expense auto-generation on schedule (the recurring profiles are stored,
but nothing currently runs them). All of these fit cleanly into the existing
patterns (entity registry for simple additions, a dedicated route for anything
transactional) if you want to extend it.
