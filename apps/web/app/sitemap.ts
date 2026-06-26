import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://soriopay.com";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/plans`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/create`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}