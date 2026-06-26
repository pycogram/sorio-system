import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/app pages out of search results
      disallow: ["/admin", "/api/", "/dashboard", "/history", "/paychecks", "/subscriptions", "/bonus"],
    },
    sitemap: "https://soriopay.com/sitemap.xml",
  };
}