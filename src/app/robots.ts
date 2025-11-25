import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const productionUrl =
    process.env.NEXT_PUBLIC_PRODUCTION_URL || 'http://localhost:8080';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${productionUrl}/sitemap.xml`,
  };
}
