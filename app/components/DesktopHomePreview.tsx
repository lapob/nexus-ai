import Image from "next/image";

export function DesktopHomePreview() {
  return <div className="desktop-home-preview">
    <Image src="/products/desktop-home.png" alt="Schermata principale reale di NexusNXS per PC con il suo Core desktop originale" width={1090} height={613} sizes="(max-width: 900px) 92vw, 760px" draggable={false} unoptimized />
  </div>;
}
