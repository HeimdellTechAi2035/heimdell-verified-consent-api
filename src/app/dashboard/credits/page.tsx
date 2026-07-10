// Dashboard -- Credits page.
// Live tenant-scoped credit balance and purchase ledger.

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { BuyCreditsForm } from "@/components/dashboard/BuyCreditsForm";
import { requireOrganizationMembership } from "@/lib/dashboard-auth";
import { CREDIT_PURCHASE_ROLES } from "@/lib/dashboard-role-policy";
import {
  getDashboardCreditsData,
  normalizeDashboardCreditsPage,
  type DashboardCreditLedgerRow,
  type DashboardCreditsData,
} from "@/lib/dashboard-credits";
import { CREDIT_PACKS, CREDIT_COST_LINK, CREDIT_COST_PHONE_CALL } from "@/lib/credit-pricing";
import type { Role } from "@prisma/client";

type CreditsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Purchase",
  VERIFICATION_CHARGE: "Verification charge",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

const COLUMNS: DataTableColumn<DashboardCreditLedgerRow>[] = [
  {
    header: "Type",
    cell: (r) => (
      <span className="text-xs font-semibold text-gray-700">
        {TYPE_LABELS[r.type] ?? r.type}
      </span>
    ),
  },
  {
    header: "Amount",
    cell: (r) => (
      <span className={`text-sm font-semibold ${r.amount >= 0 ? "text-green-700" : "text-gray-700"}`}>
        {r.amount >= 0 ? `+${r.amount}` : r.amount}
      </span>
    ),
  },
  {
    header: "Balance after",
    cell: (r) => <span className="text-sm text-gray-600">{r.balanceAfter}</span>,
  },
  {
    header: "Reference",
    cell: (r) => (
      <div className="text-xs text-gray-500">
        {r.relatedSaleId && <p className="font-mono">Sale {r.relatedSaleId}</p>}
        {r.description && <p className="mt-0.5">{r.description}</p>}
      </div>
    ),
  },
  {
    header: "Date",
    cell: (r) => (
      <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
    ),
  },
];

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <h3 className="text-sm font-semibold text-gray-700">No credit activity yet</h3>
      <p className="text-xs text-gray-400 mt-1">
        Purchases and verification charges will appear here once they happen.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-red-700 mb-2">Credit data unavailable</h3>
      <p className="text-xs text-gray-500">
        Heimdell could not load live credit balance data right now. Check the server logs and database connection.
      </p>
    </div>
  );
}

function PaginationControls({ data }: { data: DashboardCreditsData }) {
  const previousHref = data.pagination.page > 2 ? `/dashboard/credits?page=${data.pagination.page - 1}` : "/dashboard/credits";
  const nextHref = `/dashboard/credits?page=${data.pagination.page + 1}`;

  return (
    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-gray-500">
      <span>
        Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.totalRows} entries
      </span>
      <div className="flex items-center gap-2">
        {data.pagination.hasPreviousPage ? (
          <Link className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700" href={previousHref}>
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-300">Previous</span>
        )}
        {data.pagination.hasNextPage ? (
          <Link className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700" href={nextHref}>
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-300">Next</span>
        )}
      </div>
    </div>
  );
}

async function loadCreditsData(
  page: number
): Promise<{ role: Role; data: DashboardCreditsData | null }> {
  const context = await requireOrganizationMembership();

  try {
    const data = await getDashboardCreditsData(context, { page });
    return { role: context.membership.role, data };
  } catch (error) {
    console.error("Dashboard credits load failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { role: context.membership.role, data: null };
  }
}

async function CreditsContent({ searchParams }: CreditsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const page = normalizeDashboardCreditsPage(Number(firstQueryValue(resolvedSearchParams.page)));
  const purchaseResult = firstQueryValue(resolvedSearchParams.purchase);
  const { role, data } = await loadCreditsData(page);
  const canBuyCredits = (CREDIT_PURCHASE_ROLES as readonly Role[]).includes(role);
  const canViewLedger = role !== "SELLER";

  return (
    <>
      <DashboardHeader
        title="Credits"
        subtitle="Buy verification credits and see exactly what your organization has used them on."
      />

      {purchaseResult === "success" && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Payment received — credits will appear below shortly.
        </div>
      )}
      {purchaseResult === "cancelled" && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {!data ? (
        <ErrorState />
      ) : (
        <>
          <div className={`mb-6 grid grid-cols-1 gap-4 ${canBuyCredits ? "sm:grid-cols-2" : ""}`}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current balance</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{data.balance} credits</p>
              <p className="mt-2 text-xs text-gray-500">
                A link verification costs {CREDIT_COST_LINK} credit
                {CREDIT_COST_LINK === 1 ? "" : "s"}. A phone-call verification costs{" "}
                {CREDIT_COST_PHONE_CALL} credits.
              </p>
              {role === "SELLER" && (
                <p className="mt-3 text-xs text-gray-400">
                  Ask your organization owner or manager to top up if this runs low.
                </p>
              )}
            </div>
            {canBuyCredits && <BuyCreditsForm packs={CREDIT_PACKS} />}
          </div>

          {canViewLedger &&
            (data.rows.length > 0 ? (
              <>
                <DataTable columns={COLUMNS} rows={data.rows} footer="Every purchase and charge is recorded permanently for audit." />
                <PaginationControls data={data} />
              </>
            ) : (
              <EmptyState />
            ))}
        </>
      )}
    </>
  );
}

export default function CreditsPage({ searchParams }: CreditsPageProps) {
  return (
    <DashboardRoleGate section="credits">
      <CreditsContent searchParams={searchParams} />
    </DashboardRoleGate>
  );
}
