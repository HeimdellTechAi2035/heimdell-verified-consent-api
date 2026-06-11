// Phase 3/4 — Customer verification page (server component)
// Handles session lookup and error states server-side.
// Delegates the interactive consent form to ConsentForm (client component).

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LegalFooter } from "@/components/LegalFooter";
import { hashToken } from "@/lib/crypto";
import {
  checkRateLimitShared,
  logRateLimitStoreError,
  logRateLimitEvent,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  safeFingerprint,
  shouldFailOpenOnRateLimitStoreError,
  type RateLimitPolicy,
} from "@/lib/rate-limit";
import { getRequestIpFromHeaders } from "@/lib/request-ip";
import { lookupVerificationSession } from "@/lib/session-lookup";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = {
  title: "Secure Verification — Heimdell",
  description: "Complete your secure consent verification",
};

type Props = { params: Promise<{ token: string }> };

// ---------------------------------------------------------------------------
// Error / status cards — server-rendered
// ---------------------------------------------------------------------------

function StatusCard({
  icon,
  iconBg,
  iconColor,
  borderColor,
  title,
  message,
}: {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  borderColor: string;
  title: string;
  message: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div
          className={`bg-white rounded-2xl shadow-sm border ${borderColor} max-w-md w-full p-8 text-center`}
        >
          <div
            className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${iconBg} mb-4`}
          >
            <span className={iconColor}>{icon}</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

const AlertIcon = (
  <svg
    className="w-7 h-7"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const ClockIcon = (
  <svg
    className="w-7 h-7"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const CheckIcon = (
  <svg
    className="w-7 h-7"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

async function checkPageRateLimit(params: {
  policy: RateLimitPolicy;
  route: string;
  ip: string;
  identifiers: readonly string[];
}) {
  try {
    return await checkRateLimitShared(params.policy, [
      params.route,
      params.ip,
      ...params.identifiers,
    ]);
  } catch (error) {
    logRateLimitStoreError({
      policy: params.policy,
      route: params.route,
      ip: params.ip,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    if (shouldFailOpenOnRateLimitStoreError()) {
      return {
        allowed: true,
        limit: params.policy.limit,
        remaining: params.policy.limit,
        resetAt: Date.now() + params.policy.windowMs,
        retryAfterSeconds: 0,
        key: `${params.policy.name}:store-unavailable`,
      };
    }

    const response = rateLimitResponse({
      allowed: false,
      limit: params.policy.limit,
      remaining: 0,
      resetAt: Date.now() + params.policy.windowMs,
      retryAfterSeconds: Math.max(1, Math.ceil(params.policy.windowMs / 1000)),
      key: `${params.policy.name}:store-unavailable`,
    });

    return {
      allowed: false,
      limit: params.policy.limit,
      remaining: 0,
      resetAt: Date.now() + params.policy.windowMs,
      retryAfterSeconds: Number(response.headers.get("Retry-After") ?? "60"),
      key: `${params.policy.name}:store-unavailable`,
    };
  }
}

// ---------------------------------------------------------------------------
// Page entry point
// ---------------------------------------------------------------------------

export default async function VerificationPage({ params }: Props) {
  const { token } = await params;
  const requestHeaders = await headers();
  const ip = getRequestIpFromHeaders(requestHeaders);
  const tokenFingerprint = safeFingerprint(hashToken(token), 16);
  const pageLimit = await checkPageRateLimit({
    policy: RATE_LIMIT_POLICIES.publicTokenLookup,
    route: "GET /v/[token]",
    ip,
    identifiers: [tokenFingerprint],
  });

  if (!pageLimit.allowed) {
    logRateLimitEvent({
      policy: RATE_LIMIT_POLICIES.publicTokenLookup,
      route: "GET /v/[token]",
      ip,
      key: pageLimit.key,
    });
    return (
      <StatusCard
        icon={AlertIcon}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        borderColor="border-red-100"
        title="Please Try Again Later"
        message="Too many verification requests have been made recently. Please wait a moment and try again."
      />
    );
  }

  let result: Awaited<ReturnType<typeof lookupVerificationSession>> | null =
    null;
  let serverError = false;

  try {
    result = await lookupVerificationSession(token);
  } catch {
    serverError = true;
  }

  if (serverError || !result) {
    return (
      <StatusCard
        icon={AlertIcon}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        borderColor="border-red-100"
        title="Something went wrong"
        message="We were unable to load your verification. Please try again or contact support."
      />
    );
  }

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      const invalidLimit = await checkPageRateLimit({
        policy: RATE_LIMIT_POLICIES.invalidTokenAttempt,
        route: "GET /v/[token]:invalid",
        ip,
        identifiers: [tokenFingerprint],
      });
      if (!invalidLimit.allowed) {
        logRateLimitEvent({
          policy: RATE_LIMIT_POLICIES.invalidTokenAttempt,
          route: "GET /v/[token]:invalid",
          ip,
          key: invalidLimit.key,
        });
        return (
          <StatusCard
            icon={AlertIcon}
            iconBg="bg-red-50"
            iconColor="text-red-500"
            borderColor="border-red-100"
            title="Please Try Again Later"
            message="Too many verification requests have been made recently. Please wait a moment and try again."
          />
        );
      }
    }

    switch (result.reason) {
      case "EXPIRED":
        return (
          <StatusCard
            icon={ClockIcon}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
            borderColor="border-amber-100"
            title="Verification Link Expired"
            message="This verification link has expired. Please contact us to receive a new link."
          />
        );

      case "COMPLETED":
        return (
          <StatusCard
            icon={CheckIcon}
            iconBg="bg-green-50"
            iconColor="text-green-500"
            borderColor="border-green-100"
            title="Already Verified"
            message="This verification has already been completed. No further action is needed."
          />
        );

      case "DECLINED":
        return (
          <StatusCard
            icon={AlertIcon}
            iconBg="bg-red-50"
            iconColor="text-red-500"
            borderColor="border-red-100"
            title="Verification Declined"
            message="This verification was previously declined. Please contact us if you have any questions."
          />
        );

      case "NOT_FOUND":
      default:
        return (
          <StatusCard
            icon={AlertIcon}
            iconBg="bg-red-50"
            iconColor="text-red-500"
            borderColor="border-red-100"
            title="Verification Not Found"
            message="This verification link is invalid or has expired. Please contact us for assistance."
          />
        );
    }
  }

  return <ConsentForm data={result.data} />;
}

