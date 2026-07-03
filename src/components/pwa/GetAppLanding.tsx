import Link from "next/link";
import { InstallButton } from "@/components/pwa/InstallButton";
import { PWA_APP_IDENTITIES, type PwaAppKey } from "@/lib/pwa-identity";

export function GetAppLanding({ appKey }: { appKey: PwaAppKey }) {
  const identity = PWA_APP_IDENTITIES[appKey];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <img
        src={identity.icons[0].src}
        alt=""
        aria-hidden="true"
        width={96}
        height={96}
        className="mb-6 h-24 w-24 rounded-2xl shadow-sm"
      />
      <h1 className="text-2xl font-semibold text-gray-900">{identity.name}</h1>
      <p className="mt-2 text-sm text-gray-600">{identity.description}</p>

      <div className="mt-8">
        <InstallButton label={`Install ${identity.shortName}`} />
      </div>

      <Link
        href={`/login/${appKey}`}
        className="mt-6 text-sm font-medium hover:opacity-80"
        style={{ color: identity.themeColor }}
      >
        Already installed? Sign in
      </Link>
    </div>
  );
}
