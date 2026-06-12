import { NextResponse } from "next/server";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import {
  DashboardCertificateDetailNotFoundError,
  getDashboardCertificateDetail,
} from "@/lib/dashboard-certificate-detail";
import { createCertificatePdf } from "@/lib/certificate-pdf";
import { logDashboardAuditEvent } from "@/lib/dashboard-audit";

type Params = { params: Promise<{ id: string }> };

const CERTIFICATE_EXPORT_ROLES = [
  "PLATFORM_ADMIN",
  "CLIENT_OWNER",
  "CLIENT_MANAGER",
  "OWNER",
  "ADMIN",
  "MANAGER",
  "COMPLIANCE_VIEWER",
  "SELLER",
] as const;

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const context = await requireDashboardRole(CERTIFICATE_EXPORT_ROLES);

  try {
    const detail = await getDashboardCertificateDetail(context, id);
    const pdf = createCertificatePdf(detail);
    const pdfBytes = Buffer.from(pdf.bytes);
    const filename = `heimdell-certificate-${detail.id}.pdf`;

    logDashboardAuditEvent({
      organizationId: context.organization.id,
      userId: context.user.id,
      action: "certificate.pdf_exported",
      entityType: "certificate",
      entityId: detail.id,
      metadata: {
        certificateId: detail.id,
      },
    }).catch(() => {
      // Audit logging must not expose certificate content or block export.
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": String(pdfBytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof DashboardCertificateDetailNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Certificate not available",
          },
        },
        { status: 404, headers: { "Cache-Control": "no-store, private" } }
      );
    }

    console.error("Certificate PDF export failed", {
      organizationId: context.organization.id,
      userId: context.user.id,
      certificateId: id,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Certificate PDF export unavailable",
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store, private" } }
    );
  }
}
