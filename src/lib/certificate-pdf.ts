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

export function buildCertificatePdfLines(
  detail: DashboardCertificateDetail
): string[] {
  const lines: string[] = [
    "Heimdell Verified Consent",
    "Protected Certificate Evidence Summary",
    "",
    "Verification outcome",
    `Certificate ID: ${detail.id}`,
    `Verification session ID: ${detail.verification.sessionId}`,
    `Verification status: ${detail.verification.status}`,
    `Certificate created: ${formatDateTime(detail.createdAt)}`,
    `Completed: ${formatDateTime(detail.verification.completedAt)}`,
    "",
    "Sale details",
    `Sale ID: ${detail.sale.id}`,
    `Client reference: ${detail.sale.clientReference}`,
    `Sale status: ${detail.sale.status}`,
    `Product: ${detail.sale.productName}`,
    `Price summary: ${detail.sale.priceSummary}`,
    `Cooling-off summary: ${detail.sale.coolingOffSummary ?? "Not recorded"}`,
    "",
    "Terms acknowledged",
    `Terms summary: ${detail.sale.termsSummary ?? "Not recorded"}`,
    `Policies summary: ${detail.sale.policiesSummary ?? "Not recorded"}`,
    "",
    "Consent confirmations",
    ...detail.confirmations.map(
      (confirmation) =>
        `${confirmation.label}: ${formatConfirmation(confirmation.value)}`
    ),
    "",
    "Payment confirmation summary",
    `Account: ${detail.paymentSummary.accountEnding ?? "Not recorded"}`,
    `Sort code: ${detail.paymentSummary.sortCodeMasked ?? "Not recorded"}`,
    "",
    "Timeline",
    ...detail.timeline.map((item) => `${formatDateTime(item.at)} - ${item.type}`),
    "",
    "Integrity fingerprint",
    `Proof hash fingerprint: ${detail.proofHashFingerprint}`,
    `Full proof hash: ${detail.proofHash}`,
    `Certificate version: ${detail.certificateVersion ?? "Not recorded"}`,
    "",
    "Footer",
    "This PDF is a protected evidence summary generated from Heimdell Verified Consent records. It is not legal advice.",
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
