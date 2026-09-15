"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Code2, Copy, FileDown, KeyRound, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/format";
import { generatePdfBlob, downloadPdfBlob } from "@/lib/pdf-export";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

interface EndpointDef {
  method: "GET" | "POST" | "PATCH";
  path: string;
  note: string;
  // Omitted for endpoints that take no request body (GET, and void).
  request?: string;
  response: string;
}

// Every request/response example below reflects the actual current behavior of the
// /api/v1/* routes (see src/app/api/v1/**), not hand-typed guesses — kept in sync with
// claude/api-reference-v1.md. Every create/update/apply/unapply/void endpoint returns the
// FULL resulting record (not just its id) precisely so organization_id is always visible in
// the response — a caller can confirm which tenant a record landed in on every single write,
// not only on GET. Every entity is tenant-scoped server-side via the API key's own
// organization (see getApiKeyContext in src/lib/api-context.ts) — a caller never supplies or
// overrides organization_id; it's always the API key's own org, both when writing and when
// reading (a request for another org's id or org's ID always 404s "Not found", never a 403,
// so a key can never even detect that a foreign-org record exists).
const ENDPOINTS: EndpointDef[] = [
  {
    method: "GET",
    path: "/api/v1/invoices",
    note: "List invoices (query: limit, offset)",
    response: `{
  "data": [
    {
      "id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "invoice_number": "INV-000001",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "status": "sent",
      "total": "1000",
      "balance_due": "1000",
      "invoice_date": "2026-09-01T00:00:00.000Z"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/invoices",
    note: "Create an invoice",
    request: `{
  "header": {
    "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
    "invoice_date": "2026-09-01",
    "due_date": "2026-09-15",
    "status": "sent",
    "notes": "Thank you for your business"
  },
  "lines": [
    { "description": "Consulting", "quantity": 1, "rate": 1000 }
  ],
  "taxPercent": 0
}`,
    response: `{
  "data": {
    "header": {
      "id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "invoice_number": "INV-000002",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "status": "sent",
      "subtotal": "1000",
      "tax_total": "0",
      "total": "1000",
      "balance_due": "1000",
      "invoice_date": "2026-09-01T00:00:00.000Z",
      "due_date": "2026-09-15T00:00:00.000Z"
    },
    "lines": [
      { "id": "4215840e-36df-4668-91dd-be7f937e22a6", "description": "Consulting", "quantity": "1", "rate": "1000", "amount": "1000" }
    ],
    "taxPercent": 0
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/invoices/{id}",
    note: "Get one invoice (header + lines)",
    response: `{
  "data": {
    "header": {
      "id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "invoice_number": "INV-000002",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "status": "sent",
      "subtotal": "1000",
      "tax_total": "0",
      "total": "1000",
      "balance_due": "1000"
    },
    "lines": [
      { "id": "4215840e-36df-4668-91dd-be7f937e22a6", "description": "Consulting", "quantity": "1", "rate": "1000", "amount": "1000" }
    ],
    "taxPercent": 0
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/invoices/{id}",
    note: "Update an invoice (any field omitted is left unchanged)",
    request: `{
  "header": { "status": "sent", "notes": "Revised total" },
  "lines": [
    { "description": "Consulting (revised)", "quantity": 1, "rate": 1200 }
  ]
}`,
    response: `{
  "data": {
    "header": {
      "id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "invoice_number": "INV-000002",
      "status": "sent",
      "total": "1200",
      "balance_due": "1200",
      "notes": "Revised total"
    },
    "lines": [
      { "id": "6a1f...", "description": "Consulting (revised)", "quantity": "1", "rate": "1200", "amount": "1200" }
    ],
    "taxPercent": 0
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/receipts",
    note: "List payment receipts (query: limit, offset)",
    response: `{
  "data": [
    {
      "id": "b85df141-9739-45bc-8b64-099704255520",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "amount": "1500",
      "status": "paid",
      "payment_date": "2026-09-10T00:00:00.000Z"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/receipts",
    note: "Record a payment / receipt",
    request: `{
  "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
  "amount": 1500,
  "bank_account_id": "08c46dd9-221c-4fe9-88e0-5086fcd420e5",
  "payment_date": "2026-09-10",
  "payment_mode": "bank_transfer",
  "status": "paid",
  "allocations": [
    { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "amount": 1000 }
  ]
}`,
    response: `{
  "data": {
    "header": {
      "id": "b85df141-9739-45bc-8b64-099704255520",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "amount": "1500",
      "status": "paid",
      "payment_date": "2026-09-10T00:00:00.000Z"
    },
    "allocations": [
      { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "invoice_number": "INV-000002", "amount": "1000" }
    ]
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/receipts/{id}",
    note: "Get one receipt (header + allocations)",
    response: `{
  "data": {
    "header": {
      "id": "b85df141-9739-45bc-8b64-099704255520",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "amount": "1500",
      "status": "paid"
    },
    "allocations": [
      { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "invoice_number": "INV-000002", "amount": "1000" }
    ]
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/receipts/{id}",
    note: "Update metadata only (not amount / allocations / status)",
    request: `{ "reference_number": "TXN-88213-corrected", "notes": "Corrected ref #" }`,
    response: `{
  "data": {
    "header": {
      "id": "b85df141-9739-45bc-8b64-099704255520",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "reference_number": "TXN-88213-corrected",
      "notes": "Corrected ref #"
    },
    "allocations": [
      { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "invoice_number": "INV-000002", "amount": "1000" }
    ]
  }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/receipts/{id}/apply",
    note: "Apply more of a Paid receipt to an invoice",
    request: `{ "invoice_id": "ad60bf94-810b-41bd-85f0-71087ffd5d5e", "amount": 500 }`,
    response: `{
  "data": {
    "header": { "id": "b85df141-9739-45bc-8b64-099704255520", "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760", "status": "paid" },
    "allocations": [
      { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "invoice_number": "INV-000002", "amount": "1000" },
      { "invoice_id": "ad60bf94-810b-41bd-85f0-71087ffd5d5e", "invoice_number": "INV-000003", "amount": "500" }
    ]
  }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/receipts/{id}/unapply",
    note: "Reverse one invoice's allocation",
    request: `{ "invoice_id": "ad60bf94-810b-41bd-85f0-71087ffd5d5e" }`,
    response: `{
  "data": {
    "header": { "id": "b85df141-9739-45bc-8b64-099704255520", "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760", "status": "paid" },
    "allocations": [
      { "invoice_id": "9d8e22b8-f29e-45c0-9d9f-cb171e730cf2", "invoice_number": "INV-000002", "amount": "1000" }
    ]
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/customers",
    note: "List customers",
    response: `{
  "data": [
    {
      "id": "05dfee68-f504-4694-83b0-471c251676ab",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "display_name": "Test Customer Co",
      "email": "cust@example.com",
      "currency": "AED",
      "is_active": true
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/customers",
    note: "Create a customer",
    request: `{
  "display_name": "Test Customer Co",
  "email": "cust@example.com",
  "currency": "AED",
  "billing_address": "123 Main St"
}`,
    response: `{
  "data": {
    "id": "05dfee68-f504-4694-83b0-471c251676ab",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Customer Co",
    "email": "cust@example.com",
    "currency": "AED",
    "is_active": false,
    "created_at": "2026-09-10T18:32:16.099Z"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/customers/{id}",
    note: "Get one customer",
    response: `{
  "data": {
    "id": "05dfee68-f504-4694-83b0-471c251676ab",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Customer Co",
    "email": "cust@example.com",
    "currency": "AED",
    "is_active": true
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/customers/{id}",
    note: "Update a customer (any subset of create fields)",
    request: `{ "is_active": true, "work_phone": "555-1000" }`,
    response: `{
  "data": {
    "id": "05dfee68-f504-4694-83b0-471c251676ab",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Customer Co",
    "is_active": true,
    "work_phone": "555-1000"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/vendors",
    note: "List vendors",
    response: `{
  "data": [
    {
      "id": "9e499ef0-bd64-4454-8649-b7d79f8fdbd7",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "display_name": "Test Vendor Co",
      "email": "vendor@example.com",
      "currency": "AED",
      "is_active": true
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/vendors",
    note: "Create a vendor",
    request: `{ "display_name": "Test Vendor Co", "email": "vendor@example.com", "currency": "AED" }`,
    response: `{
  "data": {
    "id": "9e499ef0-bd64-4454-8649-b7d79f8fdbd7",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Vendor Co",
    "email": "vendor@example.com",
    "currency": "AED",
    "is_active": false,
    "created_at": "2026-09-10T18:32:02.285Z"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/vendors/{id}",
    note: "Get one vendor",
    response: `{
  "data": {
    "id": "9e499ef0-bd64-4454-8649-b7d79f8fdbd7",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Vendor Co",
    "is_active": true
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/vendors/{id}",
    note: "Update a vendor",
    request: `{ "is_active": true, "phone": "555-1234" }`,
    response: `{
  "data": {
    "id": "9e499ef0-bd64-4454-8649-b7d79f8fdbd7",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "display_name": "Test Vendor Co",
    "is_active": true,
    "phone": "555-1234"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/sales-orders",
    note: "List sales orders (query: limit, offset)",
    response: `{
  "data": [
    {
      "id": "3c0a...",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "so_number": "SO-000001",
      "customer_id": "05dfee68-f504-4694-83b0-471c251676ab",
      "status": "sent",
      "total": "500"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/sales-orders",
    note: "Create a sales order",
    request: `{
  "header": { "customer_id": "...", "order_date": "2026-09-10", "shipment_date": "2026-09-20", "status": "sent" },
  "lines": [ { "description": "Widgets", "quantity": 10, "rate": 50 } ],
  "taxPercent": 5
}`,
    response: `{
  "data": {
    "header": {
      "id": "3c0a...",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "so_number": "SO-000001",
      "status": "sent",
      "subtotal": "500",
      "tax_total": "25",
      "total": "525"
    },
    "lines": [
      { "id": "7bf1...", "description": "Widgets", "quantity": "10", "rate": "50", "amount": "500" }
    ],
    "taxPercent": 5
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/sales-orders/{id}",
    note: "Get one sales order (header + lines)",
    response: `{
  "data": {
    "header": { "id": "3c0a...", "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760", "so_number": "SO-000001", "status": "sent", "total": "525" },
    "lines": [ { "id": "7bf1...", "description": "Widgets", "quantity": "10", "rate": "50", "amount": "500" } ],
    "taxPercent": 5
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/sales-orders/{id}",
    note: "Update a sales order (any field omitted is left unchanged)",
    request: `{ "header": { "status": "sent" } }`,
    response: `{
  "data": {
    "header": { "id": "3c0a...", "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760", "so_number": "SO-000001", "status": "sent", "total": "525" },
    "lines": [ { "id": "7bf1...", "description": "Widgets", "quantity": "10", "rate": "50", "amount": "500" } ],
    "taxPercent": 5
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/credit-notes",
    note: "List credit memos",
    response: `{
  "data": [
    {
      "id": "225a4bbc-5e4c-44aa-835b-989e3d98eb9d",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "number": "CN-000001",
      "invoice_id": "392da528-fea4-4bfb-85e2-1d46029c361c",
      "status": "open",
      "total": "300",
      "balance_applied": "300"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/credit-notes",
    note: "Create a credit memo against an invoice — this is \"apply\"",
    request: `{
  "invoice_id": "392da528-fea4-4bfb-85e2-1d46029c361c",
  "note_date": "2026-09-10",
  "reason": "Damaged goods",
  "taxPercent": 0,
  "lines": [
    { "description": "Damaged widget refund", "quantity": 1, "rate": 300 }
  ]
}`,
    response: `{
  "data": {
    "id": "225a4bbc-5e4c-44aa-835b-989e3d98eb9d",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "number": "CN-000001",
    "invoice_id": "392da528-fea4-4bfb-85e2-1d46029c361c",
    "status": "open",
    "total": "300",
    "balance_applied": "300",
    "reason": "Damaged goods",
    "line_items": [
      { "id": "855ba2bd-e174-4bb8-8df6-77d6052dfb1c", "description": "Damaged widget refund", "quantity": "1", "rate": "300", "amount": "300" }
    ]
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/credit-notes/{id}",
    note: "Get one credit memo (includes line items)",
    response: `{
  "data": {
    "id": "225a4bbc-5e4c-44aa-835b-989e3d98eb9d",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "number": "CN-000001",
    "status": "open",
    "total": "300",
    "balance_applied": "300",
    "line_items": [
      { "id": "855ba2bd-e174-4bb8-8df6-77d6052dfb1c", "description": "Damaged widget refund", "quantity": "1", "rate": "300", "amount": "300" }
    ]
  }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/credit-notes/{id}/void",
    note: "Void a credit memo — this is \"unapply\" (no request body)",
    response: `{
  "data": {
    "id": "225a4bbc-5e4c-44aa-835b-989e3d98eb9d",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "number": "CN-000001",
    "status": "void",
    "total": "300",
    "balance_applied": "300"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/units",
    note: "List units",
    response: `{
  "data": [
    {
      "id": "7c1f9e2a-3d5b-4c8e-9a1f-2b6d8e4c0a7f",
      "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
      "name": "Unit 402",
      "project_id": "5a2e8b3e-1c4f-4a9d-9e2b-7f6d4c1a8b30",
      "building_id": null,
      "status": "available"
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/v1/units",
    note: "Create a unit — building_id is optional (unlike the in-app New Unit form)",
    request: `{ "name": "Unit 402", "project_id": "5a2e8b3e-1c4f-4a9d-9e2b-7f6d4c1a8b30", "area": 1250, "listed_price": 950000 }`,
    response: `{
  "data": {
    "id": "7c1f9e2a-3d5b-4c8e-9a1f-2b6d8e4c0a7f",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "name": "Unit 402",
    "project_id": "5a2e8b3e-1c4f-4a9d-9e2b-7f6d4c1a8b30",
    "building_id": null,
    "area": "1250",
    "listed_price": "950000",
    "created_at": "2026-09-12T18:32:16.099Z"
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/units/{id}",
    note: "Get one unit",
    response: `{
  "data": {
    "id": "7c1f9e2a-3d5b-4c8e-9a1f-2b6d8e4c0a7f",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "name": "Unit 402",
    "project_id": "5a2e8b3e-1c4f-4a9d-9e2b-7f6d4c1a8b30",
    "building_id": null,
    "status": "available"
  }
}`,
  },
  {
    method: "PATCH",
    path: "/api/v1/units/{id}",
    note: "Update a unit (project_id can't be cleared to null)",
    request: `{ "building_id": "8b7c1a2e-5f3d-4e9a-b1c6-3d8f2a4e6c19", "status": "reserved" }`,
    response: `{
  "data": {
    "id": "7c1f9e2a-3d5b-4c8e-9a1f-2b6d8e4c0a7f",
    "organization_id": "bb52a4a8-54b2-4ccf-947a-4a2555136760",
    "name": "Unit 402",
    "project_id": "5a2e8b3e-1c4f-4a9d-9e2b-7f6d4c1a8b30",
    "building_id": "8b7c1a2e-5f3d-4e9a-b1c6-3d8f2a4e6c19",
    "status": "reserved"
  }
}`,
  },
];

const methodColor: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-emerald-100 text-emerald-700",
  PATCH: "bg-amber-100 text-amber-700",
};

export default function ApiKeysManager({ keys, canManage = true }: { keys: ApiKeyRow[]; canManage?: boolean }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Which REST API Reference row has its request/response body expanded, keyed by
  // "METHOD path" — at most one open at a time keeps the reference list scannable.
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  // "Download PDF" renders a separate, always-fully-expanded copy of the reference (every
  // endpoint's request/response body, not just whichever one is open in the accordion above)
  // off-screen via apiRefPrintRef, then feeds that element to the same html2canvas+jsPDF
  // pipeline the Invoice/Sales Order/Statement "Download PDF" buttons already use (see
  // src/lib/pdf-export.ts) — a reference doc where only one endpoint's body was visible
  // wouldn't be much of a reference.
  const apiRefPrintRef = useRef<HTMLDivElement>(null);
  const [downloadingApiRef, setDownloadingApiRef] = useState(false);

  async function downloadApiReferencePdf() {
    if (!apiRefPrintRef.current) return;
    setDownloadingApiRef(true);
    try {
      const blob = await generatePdfBlob(apiRefPrintRef.current);
      downloadPdfBlob(blob, "NeoAccounting-API-Reference.pdf");
    } finally {
      setDownloadingApiRef(false);
    }
  }

  function openNew() {
    setName("");
    setError(null);
    setCreatedKey(null);
    setCopied(false);
    setModalOpen(true);
  }

  async function onToggle(k: ApiKeyRow) {
    if (!canManage) return;
    await fetch(`/api/settings/api-keys/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !k.is_active }),
    });
    router.refresh();
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setConfirmId(null);
    router.refresh();
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Key name is required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not create this API key.");
      return;
    }
    const data = await res.json();
    setCreatedKey(data.rawKey);
    router.refresh();
  }

  async function onCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can be unavailable (e.g. non-HTTPS); the text is still selectable.
    }
  }

  return (
    <div>
      {!canManage && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only owners, admins, and Super Admin can generate or revoke API keys. You can view the keys below.
        </div>
      )}
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">API Keys</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Let external systems send invoices, receipts, customers, vendors, sales orders, credit memos and units
            into NeoAccounting over REST.
          </p>
        </div>
        {canManage && (
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Generate API Key
          </button>
        )}
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
            <KeyRound size={36} className="text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-ink-800">Connect a Third-Party System</h2>
          <p className="max-w-md text-sm text-gray-500">
            Generate a key and pass it as a bearer token to read and write invoices, receipts, customers, vendors,
            sales orders, credit memos and units from another application.
          </p>
          {canManage && (
            <button onClick={openNew} className="btn-primary">
              Generate API Key
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Key</th>
                <th className="px-4 py-2.5">Requests</th>
                <th className="px-4 py-2.5">Last Used</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5 text-ink-800">{k.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-700">{k.key_prefix}••••••••</td>
                  <td className="px-4 py-2.5 text-ink-700">{k.request_count}</td>
                  <td className="px-4 py-2.5 text-ink-700">{k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => onToggle(k)}
                      disabled={!canManage}
                      className={`relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${k.is_active ? "bg-brand-600" : "bg-gray-300"}`}
                      title={k.is_active ? "On" : "Off"}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          k.is_active ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!canManage ? null : confirmId === k.id ? (
                        <button
                          onClick={() => onDelete(k.id)}
                          disabled={deletingId === k.id}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          {deletingId === k.id ? "..." : "Confirm"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(k.id)}
                          className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title="Revoke"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <Code2 size={14} className="text-gray-400" /> REST API Reference
          </p>
          <button
            type="button"
            onClick={downloadApiReferencePdf}
            disabled={downloadingApiRef}
            className="btn-secondary shrink-0 !py-1 text-xs"
            title="Download the full API reference (every endpoint, request and response body) as a PDF"
          >
            <FileDown size={14} />
            {downloadingApiRef ? "Preparing PDF..." : "Download PDF"}
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Authenticate every request with{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">Authorization: Bearer &lt;your key&gt;</code> (or an{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">X-API-Key</code> header). Click any row to see an
          example request and response body.
        </p>
        <div className="space-y-1.5">
          {ENDPOINTS.map((e) => {
            const key = `${e.method} ${e.path}`;
            const isOpen = expandedEndpoint === key;
            return (
              <div key={key} className="rounded-md border border-gray-100">
                <button
                  type="button"
                  onClick={() => setExpandedEndpoint(isOpen ? null : key)}
                  className="flex w-full items-center gap-3 px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                >
                  <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono font-semibold ${methodColor[e.method]}`}>
                    {e.method}
                  </span>
                  <code className="w-56 shrink-0 text-ink-700">{e.path}</code>
                  <span className="flex-1 text-gray-500">{e.note}</span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 py-3">
                    {e.request && (
                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          Request Body
                        </p>
                        <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                          <code>{e.request}</code>
                        </pre>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        Response Body
                      </p>
                      <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                        <code>{e.response}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Off-screen, always-fully-expanded copy of the reference above, rendered only as the
          source for downloadApiReferencePdf's html2canvas snapshot — never shown on the page.
          Positioned far off-canvas (not display:none/hidden) because html2canvas needs the
          element actually laid out to capture it. Fixed width keeps every PDF the same layout
          regardless of the viewer's own window size. */}
      <div className="pointer-events-none absolute left-[-99999px] top-0 w-[760px]" aria-hidden="true">
        <div ref={apiRefPrintRef} className="bg-white p-8">
          <p className="mb-1 text-lg font-bold text-ink-900">NeoAccounting REST API Reference</p>
          <p className="mb-5 text-xs text-gray-500">
            Authenticate every request with <code className="rounded bg-gray-100 px-1 py-0.5">Authorization: Bearer &lt;your key&gt;</code>{" "}
            (or an <code className="rounded bg-gray-100 px-1 py-0.5">X-API-Key</code> header). Every endpoint is scoped to the
            calling API key&apos;s own organization.
          </p>
          <div className="space-y-4">
            {ENDPOINTS.map((e) => (
              <div key={`${e.method} ${e.path}`} className="rounded-md border border-gray-200">
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <span className={`w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs font-semibold ${methodColor[e.method]}`}>
                    {e.method}
                  </span>
                  <code className="w-56 shrink-0 text-xs text-ink-700">{e.path}</code>
                  <span className="flex-1 text-xs text-gray-500">{e.note}</span>
                </div>
                <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 py-3">
                  {e.request && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Request Body</p>
                      <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                        <code>{e.request}</code>
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Response Body</p>
                    <pre className="overflow-x-auto rounded bg-ink-900 p-2.5 text-[11px] leading-relaxed text-gray-100">
                      <code>{e.response}</code>
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Generate API Key">
        {createdKey ? (
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <p className="mb-2 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={14} /> Copy this key now — you won&apos;t be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <input readOnly value={createdKey} className="input flex-1 bg-white font-mono text-xs" />
                <button type="button" onClick={() => onCopy(createdKey)} className="btn-secondary shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label">
                Key Name<span className="text-red-500"> *</span>
              </label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Order Management System"
              />
            </div>
            <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
              <button onClick={onSave} disabled={saving} className="btn-primary">
                {saving ? "Generating..." : "Generate Key"}
              </button>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
