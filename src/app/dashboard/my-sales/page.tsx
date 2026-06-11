import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/dashboard/DataTable";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardRoleGate } from "@/components/dashboard/DashboardRoleGate";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { db } from "@/lib/db";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { getAllowedDashboardRoles } from "@/lib/dashboard-role-policy";

export const metadata: Metadata = {
  title: "My Sales - Heimdell",
};

export default function MySalesPage() {
  return (
    <DashboardRoleGate section="my-sales">
      <MySalesContent />
    </DashboardRoleGate>
  );
}

type MySaleRow = {
  id: string;
  clientReference: string | null;
  productName: string;
  priceSummary: string;
  saleStatus: string;
  verificationStatus: string | null;
  createdAt: Date;
};

const SELLER_COLUMNS: DataTableColumn<MySaleRow>[] = [
  {
    header: "Reference",
    cell: (row) => (
      <div>
        <p className="text-sm font-medium text-gray-900">
          {row.clientReference ?? row.id}
        </p>
        {!row.clientReference && (
          <p className="mt-0.5 font-mono text-xs text-gray-400">{row.id}</p>
        )}
      </div>
    ),
  },
  {
    header: "Product",
    cell: (row) => <span className="text-sm text-gray-700">{row.productName}</span>,
  },
  {
    header: "Price",
    cell: (row) => <span className="text-xs text-gray-500">{row.priceSummary}</span>,
  },
  {
    header: "Sale",
    cell: (row) => <StatusBadge status={row.saleStatus} />,
  },
  {
    header: "Verification",
    cell: (row) =>
      row.verificationStatus ? (
        <StatusBadge status={row.verificationStatus} />
      ) : (
        <span className="text-xs text-gray-400">Not created</span>
      ),
  },
  {
    header: "Created",
    cell: (row) => (
      <span className="text-xs text-gray-500">
        {row.createdAt.toLocaleDateString("en-GB")}
      </span>
    ),
  },
];

async function MySalesContent() {
  const context = await requireDashboardRole(getAllowedDashboardRoles("my-sales"));
  const role = context.membership.role;

  if (role === "SELLER") {
    const rows = await getSellerMySalesRows({
      userId: context.user.id,
      organizationId: context.organization.id,
    });

    return (
      <>
        <DashboardHeader
          title="My Sales"
          subtitle="Your seller workspace for consent verification records."
          action={
            <Link
              href="/dashboard/my-sales/new"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              New Verification
            </Link>
          }
        />

        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <svg className="h-6 w-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-6a2 2 0 012-2h8m0 0l-3-3m3 3l-3 3M5 7h4m-4 4h4m-4 4h4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              No submitted sales yet
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
              Sales will appear here only when intake includes your verified
              `seller_email` and the sale is linked to your dashboard user.
            </p>
          </div>
        ) : (
          <DataTable
            columns={SELLER_COLUMNS}
            rows={rows}
            footer={`Showing ${rows.length} sale${rows.length === 1 ? "" : "s"} submitted by your dashboard user.`}
          />
        )}
      </>
    );
  }

  return (
    <>
      <DashboardHeader
        title="My Sales"
        subtitle="Managers can review organization-scoped sales from the protected Sales page."
        action={
          <Link
            href="/dashboard/sales"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Open Sales
          </Link>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-900">
          Organization sales remain on the Sales page
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          This landing page is primarily for seller-safe access. Users with
          manager or admin roles can continue to use the existing tenant-scoped
          Sales dashboard.
        </p>
      </div>
    </>
  );
}

async function getSellerMySalesRows({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}): Promise<MySaleRow[]> {
  const sales = await db.sale.findMany({
    where: {
      submittedByUserId: userId,
      client: {
        organizationId,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      clientReference: true,
      productName: true,
      productPrice: true,
      productFrequency: true,
      status: true,
      createdAt: true,
      verificationSessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
        },
      },
    },
  });

  return sales.map((sale) => ({
    id: sale.id,
    clientReference: sale.clientReference,
    productName: sale.productName,
    priceSummary: formatPriceSummary(
      sale.productPrice.toNumber(),
      sale.productFrequency
    ),
    saleStatus: sale.status,
    verificationStatus: sale.verificationSessions[0]?.status ?? null,
    createdAt: sale.createdAt,
  }));
}

function formatPriceSummary(price: number, frequency: string | null): string {
  const formattedPrice = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(price);

  return frequency ? `${formattedPrice} / ${frequency}` : formattedPrice;
}
