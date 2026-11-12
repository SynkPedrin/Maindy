import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${publicEnv.siteUrl}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${publicEnv.siteUrl}/privacidade`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${publicEnv.siteUrl}/termos`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
