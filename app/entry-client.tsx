import { hydrateRoot } from "react-dom/client";
import { SiteDocument } from "./site-document";
import type { SiteDocumentData } from "./lib/site-metadata";

const bootstrap = document.getElementById("nexus-site-state");
if (bootstrap?.textContent) {
  const data: SiteDocumentData = JSON.parse(bootstrap.textContent);
  hydrateRoot(document, <SiteDocument data={data} />);
}
