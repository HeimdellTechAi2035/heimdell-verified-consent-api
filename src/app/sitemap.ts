import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL ?? "https://telecomcompliance.uk";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/how-it-works", "/pricing", "/contact", "/signup", "/login"];
  const legalRoutes = [
    "/privacy",
    "/terms",
    "/data-processing-agreement",
    "/cooling-off",
    "/cookies",
    "/complaints",
  ];

  return [
    ...routes.map((route) => ({
      url: `${appUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: (route === "" ? "weekly" : "monthly") as "weekly" | "monthly",
      priority: route === "" ? 1 : 0.7,
    })),
    ...legalRoutes.map((route) => ({
      url: `${appUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
