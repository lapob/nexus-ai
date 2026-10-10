import type { ImgHTMLAttributes } from "react";

type SiteImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
  unoptimized?: boolean;
};

/** Product assets are already sized and compressed; preserve their native URLs. */
export default function SiteImage({ priority, unoptimized, loading, fetchPriority, alt, ...props }: SiteImageProps) {
  void unoptimized;
  return <img {...props} alt={alt ?? ""} decoding="async" loading={priority ? "eager" : loading ?? "lazy"} fetchPriority={priority ? "high" : fetchPriority} />;
}
