import { useEffect, useState } from 'react';
import { fetchImageBlob } from '../api/recognitionApi';

/** <img> pour une photo protégée par JWT (impossible avec un simple src). */
export default function AuthImage({ src, alt = '', className = '', fallback = null }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return undefined;
    let revoked = false;
    let created = null;
    fetchImageBlob(src)
      .then((url) => {
        if (revoked) URL.revokeObjectURL(url);
        else { created = url; setBlobUrl(url); }
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (failed || !src) return fallback;
  if (!blobUrl) return <div className={`${className} bg-[#E7EBEF] animate-pulse`} />;
  return <img src={blobUrl} alt={alt} className={className} />;
}
