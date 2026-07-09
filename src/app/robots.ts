import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL ?? "https://telecomcompliance.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/dashboard/",
          "/api/",
          "/login",
          "/login/",
          "/v/",
          "/embed",
          "/embed/",
          "/get-app/",
          "/auth/",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
