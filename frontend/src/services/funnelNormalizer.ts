import { INITIAL_BLOCKS } from "../constants";
import type { FunnelNode } from "../types";

/**
 * Older funnels may contain only a start node. Keep their content, but restore
 * every required editor step so all fields remain editable.
 */
export function normalizeFunnelNodes(nodes: FunnelNode[]): FunnelNode[] {
  const savedById = new Map(nodes.map(node => [node.id, node]));
  const requiredNodes = INITIAL_BLOCKS.map(defaultNode => ({
    ...defaultNode,
    ...savedById.get(defaultNode.id),
  }));
  const extraNodes = nodes.filter(node => !INITIAL_BLOCKS.some(defaultNode => defaultNode.id === node.id));
  return [...requiredNodes, ...extraNodes];
}
