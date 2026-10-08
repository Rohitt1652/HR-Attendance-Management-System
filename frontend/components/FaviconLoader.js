'use client';
import { useEffect } from 'react';

export default function FaviconLoader() {
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((data) => {
        const favicon = data?.data?.companyFavicon;
        if (!favicon) return;

        // Find existing favicon link or create a new one — never remove, just update
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }

        link.href = favicon;
        if (favicon.startsWith('data:image/x-icon')) link.type = 'image/x-icon';
        else if (favicon.startsWith('data:image/svg')) link.type = 'image/svg+xml';
        else link.type = 'image/png';
      })
      .catch(() => {});
  }, []);

  return null;
}
