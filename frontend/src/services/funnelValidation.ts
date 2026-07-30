import type { FunnelNode } from "../types";

const hasMessageContent = (node: FunnelNode | undefined) => Boolean(
  node?.content?.replace(/<[^>]*>/g, "").trim() && node.buttonText?.trim(),
);

/** Shared launch/save readiness check for the four required funnel steps. */
export function isFunnelComplete(nodes: FunnelNode[]): boolean {
  const getNode = (id: string) => nodes.find(node => node.id === id);
  const payment = getNode("payment");
  const tariffs = payment?.tariffs || [];

  return (
    hasMessageContent(getNode("start"))
    && hasMessageContent(getNode("push1"))
    && hasMessageContent(getNode("push2"))
    && tariffs.length > 0
    && tariffs.every(tariff => Boolean(
      tariff.name?.trim() && Number(tariff.price) > 0 && tariff.description?.trim(),
    ))
  );
}
