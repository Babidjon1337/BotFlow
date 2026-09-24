import { INITIAL_BLOCKS } from "../constants";
import type { FunnelNode, NodeMediaAsset } from "../types";

/**
 * Older funnels may contain only a start node. Keep their content, but restore
 * every required editor step so all fields remain editable.
 * Also normalizes mediaAssets so multi-media is always preserved.
 */
export function normalizeFunnelNodes(nodes: FunnelNode[]): FunnelNode[] {
  const savedById = new Map(nodes.map(node => [node.id, node]));

  const normalizeNodeMedia = (node: Partial<FunnelNode>): NodeMediaAsset[] => {
    if (Array.isArray(node.mediaAssets) && node.mediaAssets.length > 0) {
      return node.mediaAssets;
    }
    if (node.mediaAssetId && node.mediaFileId) {
      return [{
        mediaAssetId: node.mediaAssetId,
        mediaFileId: node.mediaFileId,
        mediaType: node.mediaType === "video" || node.mediaType === "document" ? node.mediaType : "photo",
      }];
    }
    return [];
  };

  const startNode = savedById.get('start') || INITIAL_BLOCKS[0];
  const paymentNode = savedById.get('payment') || INITIAL_BLOCKS[1];

  const middleNodes = nodes
    .filter(node => node.id !== 'start' && node.id !== 'payment')
    .map(node => ({
      ...node,
      mediaAssets: normalizeNodeMedia(node),
    }));

  const normalizedStart: FunnelNode = {
    ...INITIAL_BLOCKS[0],
    ...startNode,
    mediaAssets: normalizeNodeMedia(startNode),
  };

  const normalizedPayment: FunnelNode = {
    ...INITIAL_BLOCKS[1],
    ...paymentNode,
    mediaAssets: normalizeNodeMedia(paymentNode),
  };

  return [normalizedStart, ...middleNodes, normalizedPayment];
}
