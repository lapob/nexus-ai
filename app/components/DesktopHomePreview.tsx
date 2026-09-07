import Image from "next/image";
import { InteractiveVisualizer } from "./InteractiveVisualizer";

export function DesktopHomePreview() {
  return <div className="desktop-home-preview">
    <Image src="/products/desktop-home.png" alt="Schermata principale di NexusNXS per PC, con anteprima animata del Core condiviso con Android" width={1090} height={613} sizes="(max-width: 900px) 92vw, 760px" draggable={false} unoptimized />
    <div className="desktop-home-preview__core" aria-hidden="true"><InteractiveVisualizer variant="android" compact /></div>
  </div>;
}
