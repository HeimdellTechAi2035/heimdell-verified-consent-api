import type { DashboardCertificateDetail } from "@/lib/dashboard-certificate-detail";

export type CertificatePdfResult = {
  bytes: Uint8Array;
  filename: string;
};

function pdfEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toISOString();
}

function formatConfirmation(value: boolean | string | null): string {
  if (typeof value === "boolean") {
    return value ? "Confirmed" : "Not confirmed";
  }

  return value ?? "Not recorded";
}

function wrapLine(line: string, maxLength = 92): string[] {
  if (line.includes("\n")) {
    return line.split(/\r?\n/).flatMap((part) => wrapLine(part, maxLength));
  }

  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function section(title: string, lines: string[]): string[] {
  return ["", title, ...lines];
}

export function buildCertificatePdfLines(
  detail: DashboardCertificateDetail
): string[] {
  const lines: string[] = [
    "Heimdell Verified Consent",
    "Certificate evidence record",
    ...section("Certificate reference", [
      `Certificate reference: ${detail.id}`,
      `Certificate status: ${detail.verification.status}`,
      `Certificate version: ${detail.certificateVersion ?? "Not recorded"}`,
      `Proof hash: ${detail.proofHash}`,
      `Created: ${formatDateTime(detail.createdAt)}`,
    ]),
    ...section("Client and seller", [
      `Client company: ${detail.sale.clientCompanyName}`,
      `Client account/name: ${detail.sale.clientCompanyName}`,
      `Seller name: ${detail.sale.sellerName ?? "Not recorded"}`,
      `Seller email: ${detail.sale.sellerEmail ?? "Not recorded"}`,
      `Client reference: ${detail.sale.clientReference}`,
    ]),
    ...section("Customer details", [
      `Customer full name: ${detail.sale.customerName}`,
      `Customer phone: ${detail.sale.customerPhone ?? "Not recorded"}`,
      `Customer email: ${detail.sale.customerEmail ?? "Not recorded"}`,
      `Customer address: ${detail.sale.customerAddress ?? "Not recorded"}`,
      `Customer IP: ${detail.verification.customerIpAddress ?? "Not recorded"}`,
      `Customer user agent: ${detail.verification.customerUserAgent ?? "Not recorded"}`,
    ]),
    ...section("Product and sale", [
      `Product/service: ${detail.sale.productName}`,
      `Subscription price: ${detail.sale.subscriptionPrice}`,
      `Subscription frequency: ${detail.sale.subscriptionFrequency ?? "Not recorded"}`,
      `Contract length: ${detail.sale.contractLength ?? "Not recorded"}`,
      `Sale channel: ${detail.sale.salesChannel ?? "Not recorded"}`,
      `Sale status: ${detail.sale.status}`,
    ]),
    ...section("Verification timestamps", [
      `Verification session: ${detail.verification.sessionId}`,
      `Session created: ${formatDateTime(detail.verification.createdAt)}`,
      `Completed: ${formatDateTime(detail.verification.completedAt)}`,
      `Declined: ${formatDateTime(detail.verification.declinedAt)}`,
      `Expires: ${formatDateTime(detail.verification.expiresAt)}`,
    ]),
    ...section("Payment evidence masked", [
      `Bank: ${detail.paymentSummary.bankName ?? "Not recorded"}`,
      `Account holder: ${detail.paymentSummary.accountHolderName ?? "Not recorded"}`,
      `Sort code: ${detail.paymentSummary.sortCodeMasked ?? "Not recorded"}`,
      `Account number: ${detail.paymentSummary.accountEnding ?? "Not recorded"}`,
      `Direct Debit wording: ${detail.policy.directDebitGuaranteeWording}`,
    ]),
    ...section("Subscription and policy summaries", [
      `Subscription terms summary: ${detail.sale.termsSummary ?? "Not recorded"}`,
      `Policies summary: ${detail.sale.policiesSummary ?? "Not recorded"}`,
      `Legacy record: ${detail.policy.isLegacyFallback ? "Yes - fallback wording shown" : "No"}`,
      `Policy version: ${detail.policy.policyVersion}`,
      `Policy captured at: ${formatDateTime(detail.policy.capturedAt)}`,
    ]),
    ...section("Full Terms and Conditions snapshot", [
      detail.policy.termsAndConditions,
    ]),
    ...section("Full Cooling-off Policy snapshot", [
      detail.policy.coolingOffPolicy,
    ]),
    ...section("Full Cancellation Instructions snapshot", [
      detail.policy.cancellationInstructions,
    ]),
    ...section("Full Privacy and Evidence Storage snapshot", [
      detail.policy.privacyEvidenceWording,
    ]),
    ...section("Full Direct Debit Guarantee snapshot", [
      detail.policy.directDebitGuaranteeWording,
    ]),
    ...section("Consent confirmations", [
      ...detail.confirmations.map(
        (confirmation) =>
          `${confirmation.label}: ${formatConfirmation(confirmation.value)}`
      ),
    ]),
    ...section("Timeline", [
      ...detail.timeline.map((item) => `${formatDateTime(item.at)} - ${item.type}`),
    ]),
    ...section("Footer", [
      "This certificate is a human-readable evidence record of the Heimdell Verified Consent verification. It summarises the customer, sale, payment mandate, policy wording, consent confirmations, timestamps, and proof hash captured for audit and dispute resolution.",
    ]),
  ];

  return lines.flatMap((line) => wrapLine(line));
}

export function buildSafeCertificatePdfFilename(certificateId: string): string {
  const safeId = certificateId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return `heimdell-certificate-${safeId || "export"}.pdf`;
}

function buildPdfDocument(lines: string[]): Uint8Array {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 50;
  const startY = 792;
  const lineHeight = 14;
  const linesPerPage = Math.floor((startY - 50) / lineHeight);
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectId = 3 + pageIndex * 2;
    const contentObjectId = pageObjectId + 1;
    const contentLines = [
      "BT",
      "/F1 11 Tf",
      "14 TL",
      `${marginX} ${startY} Td`,
      ...pageLines.map((line, lineIndex) =>
        lineIndex === 0
          ? `(${pdfEscape(line)}) Tj`
          : `T* (${pdfEscape(line)}) Tj`
      ),
      "ET",
    ];
    const stream = contentLines.join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

export function createCertificatePdf(
  detail: DashboardCertificateDetail
): CertificatePdfResult {
  return {
    bytes: buildPdfDocument(buildCertificatePdfLines(detail)),
    filename: buildSafeCertificatePdfFilename(detail.id),
  };
}
