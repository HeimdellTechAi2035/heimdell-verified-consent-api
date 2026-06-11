export const LEGAL_FOOTER_TEXT =
  "© 2026 Heimdell Tech Ai Ltd. Registered in England & Wales. Company No. 16478408. ICO Reg: ZC079121.";

export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`px-4 py-4 text-center text-xs leading-relaxed text-gray-500 ${className}`}
    >
      {LEGAL_FOOTER_TEXT}
    </footer>
  );
}
