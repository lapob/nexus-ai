import { permanentRedirect } from "next/navigation";

// Preserve old bookmarks without advertising plans that are not available.
export default function PricingRedirect() {
  permanentRedirect("/downloads");
}
