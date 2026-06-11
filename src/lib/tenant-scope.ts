// Tenant-scoped data access patterns for future dashboard/API wiring.
// These helpers intentionally return only records that belong to the supplied
// organization through Client.organizationId.

import { db } from "@/lib/db";

export async function getOrganizationScopedSale(params: {
  organizationId: string;
  saleId: string;
}) {
  return db.sale.findFirst({
    where: {
      id: params.saleId,
      client: {
        organizationId: params.organizationId,
      },
    },
  });
}

export async function getOrganizationScopedVerificationSession(params: {
  organizationId: string;
  verificationSessionId: string;
}) {
  return db.verificationSession.findFirst({
    where: {
      id: params.verificationSessionId,
      sale: {
        client: {
          organizationId: params.organizationId,
        },
      },
    },
  });
}

export async function getOrganizationScopedCertificate(params: {
  organizationId: string;
  certificateId: string;
}) {
  return db.certificate.findFirst({
    where: {
      id: params.certificateId,
      verificationSession: {
        sale: {
          client: {
            organizationId: params.organizationId,
          },
        },
      },
    },
  });
}
