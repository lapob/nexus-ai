import type { ComponentPropsWithoutRef } from "react";

type HardNavigationLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
};

/**
 * Full document navigation is intentional: it stays compatible with the
 * service-worker offline shell and cannot leave a stale client router waiting.
 */
export function HardNavigationLink({ href, children, ...props }: HardNavigationLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
