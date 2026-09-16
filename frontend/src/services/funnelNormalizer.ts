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

  const requiredNodes = INITIAL_BLOCKS.map(defaultNode => {
    const saved = savedById.get(defaultNode.id);
    const merged = { ...defaultNode, ...saved };
    merged.mediaAssets = normalizeNodeMedia(merged);
    return merged;
  });

  const extraNodes = nodes
    .filter(node => !INITIAL_BLOCKS.some(defaultNode => defaultNode.id === node.id))
    .map(node => ({
      ...node,
      mediaAssets: normalizeNodeMedia(node),
    }));

  return [...requiredNodes, ...extraNodes];
}
