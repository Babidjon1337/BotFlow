import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import ReactFlow, { Background, Controls, Handle, Position } from "reactflow";
import type { Edge, NodeProps, Node } from "reactflow";
import "reactflow/dist/style.css";
import {
  MessageCircle,
  Bell,
  CreditCard,
  FileBox,
  FileText,
} from "lucide-react";
import { EmptyBotState } from "../EmptyBotState";

import { useAppState } from "../../providers/AppStateProvider";

const BLOCK_COLORS = {
  offer: {
    bg: "var(--color-surface-2)",
    border: "var(--color-border-strong)",
    text: "var(--color-foreground-secondary)",
    icon: FileText,
  },
  message: {
    bg: "var(--color-primary-soft)",
    border: "var(--color-primary)",
    text: "var(--color-primary)",
    icon: MessageCircle,
  },
  reminder: {
    bg: "var(--color-warning-soft)",
    border: "var(--color-warning)",
    text: "var(--color-warning)",
    icon: Bell,
  },
  payment: {
    bg: "var(--color-accent-soft)",
    border: "var(--color-accent)",
    text: "var(--color-accent)",
    icon: CreditCard,
  },
  delivery: {
    bg: "var(--color-success-soft)",
    border: "var(--color-success)",
    text: "var(--color-success)",
    icon: FileBox,
  },
};

const CustomNode = ({ data, selected }: NodeProps) => {
  const { title, subtitle, kind, content, buttonText } = data;
  const colors =
    BLOCK_COLORS[kind as keyof typeof BLOCK_COLORS] || BLOCK_COLORS.message;
  const Icon = colors.icon;

  return (
    <div
      className="relative transition-all duration-300 group"
      style={{
        background: "var(--color-surface)",
        border: selected
          ? `2px solid ${colors.border}`
          : `1px solid var(--color-border)`,
        borderRadius: "24px",
        width: "320px",
        boxShadow: selected
          ? `0 16px 32px -12px ${colors.border}40, 0 4px 12px -4px rgba(0,0,0,0.05)`
          : "0 8px 24px -12px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      {/* Soft header background */}
      <div
        style={{
          background: `linear-gradient(135deg, ${colors.bg}, transparent)`,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          className="shadow-sm"
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "14px",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${colors.border}30`,
          }}
        >
          <Icon size={20} style={{ color: colors.text }} />
        </div>
        <div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 800,
              color: "var(--color-foreground)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--color-foreground-secondary)",
              marginTop: "2px",
              fontWeight: 500,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {content && (
          <div
            style={{
              background: "var(--color-surface-2)",
              padding: "12px 16px",
              borderRadius: "16px",
              fontSize: "14px",
              color: "var(--color-foreground)",
              lineHeight: 1.5,
              borderBottomLeftRadius: "6px",
              position: "relative",
              border: "1px solid var(--color-border)",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
            dangerouslySetInnerHTML={{
              __html:
                content.length > 80
                  ? content.substring(0, 80) + "..."
                  : content,
            }}
          />
        )}

        {buttonText && (
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              padding: "12px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 700,
              textAlign: "center",
              color: "var(--color-foreground)",
              boxShadow: "0 2px 8px -4px rgba(0,0,0,0.05)",
            }}
          >
            {buttonText}
          </div>
        )}

        {!content && !buttonText && (
          <div
            style={{
              fontSize: "14px",
              color: "var(--color-foreground-tertiary)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "12px 0",
            }}
          >
            Нет контента
          </div>
        )}
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="transition-transform group-hover:scale-125"
        style={{
          background: colors.border,
          width: "12px",
          height: "12px",
          border: "2px solid var(--color-surface)",
          opacity: selected ? 1 : 0.5,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="transition-transform group-hover:scale-125"
        style={{
          background: colors.border,
          width: "12px",
          height: "12px",
          border: "2px solid var(--color-surface)",
          opacity: selected ? 1 : 0.5,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="transition-transform group-hover:scale-125"
        style={{
          background: colors.border,
          width: "12px",
          height: "12px",
          border: "2px solid var(--color-surface)",
          opacity: selected ? 1 : 0.5,
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="transition-transform group-hover:scale-125"
        style={{
          background: colors.border,
          width: "12px",
          height: "12px",
          border: "2px solid var(--color-surface)",
          opacity: selected ? 1 : 0.5,
        }}
      />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export const Flow = () => {
  const {
    blocks,
    appState,
    setSelectedBlockId,
    setActiveTab,
    handleCreateBotClick: onCreateBot,
    theme,
  } = useAppState();

  const getBlock = useCallback((id: string) => blocks.find((block) => block.id === id), [blocks]);

  const flowNodes: Node[] = useMemo(
    () => [
      {
        id: "start",
        type: "custom",
        position: { x: 250, y: 50 },
        data: {
          title: "Первое сообщение",
          subtitle: "Мгновенно",
          kind: "message",
          content: getBlock("start")?.content,
          buttonText: getBlock("start")?.buttonText,
        },
      },
      {
        id: "push1",
        type: "custom",
        position: { x: 250, y: 400 },
        data: {
          title: "Дожим 1",
          subtitle: getBlock("push1")?.delay || "1 час",
          kind: "reminder",
          content: getBlock("push1")?.content,
          buttonText: getBlock("push1")?.buttonText,
        },
      },
      {
        id: "push2",
        type: "custom",
        position: { x: 250, y: 750 },
        data: {
          title: "Дожим 2",
          subtitle: getBlock("push2")?.delay || "24 часа",
          kind: "reminder",
          content: getBlock("push2")?.content,
          buttonText: getBlock("push2")?.buttonText,
        },
      },
      {
        id: "payment",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          title: "Оплата",
          subtitle: "Мгновенно",
          kind: "payment",
          content: getBlock("payment")?.content || "Счет на оплату сформирован.",
          buttonText: getBlock("payment")?.buttonText || "Оплатить",
        },
      },
      {
        id: "delivery",
        type: "custom",
        position: { x: 750, y: 400 },
        data: {
          title: "Выдача",
          subtitle: "После оплаты",
          kind: "delivery",
          content: getBlock("delivery")?.content,
        },
      },
    ],
    [getBlock],
  );

  const flowEdges: Edge[] = useMemo(
    () => [
      {
        id: "e-start-push1",
        source: "start",
        sourceHandle: "bottom",
        target: "push1",
        targetHandle: "top",
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--color-border-strong)", strokeWidth: 3 },
      },
      {
        id: "e-push1-push2",
        source: "push1",
        sourceHandle: "bottom",
        target: "push2",
        targetHandle: "top",
        type: "smoothstep",
        animated: true,
        style: { stroke: "var(--color-border-strong)", strokeWidth: 3 },
      },
      {
        id: "e-start-payment",
        source: "start",
        sourceHandle: "right",
        target: "payment",
        targetHandle: "left",
        type: "smoothstep",
        style: { stroke: "var(--color-primary)", strokeWidth: 3, opacity: 0.8 },
      },
      {
        id: "e-push1-payment",
        source: "push1",
        sourceHandle: "right",
        target: "payment",
        targetHandle: "left",
        type: "smoothstep",
        style: { stroke: "var(--color-warning)", strokeWidth: 3, opacity: 0.8 },
      },
      {
        id: "e-push2-payment",
        source: "push2",
        sourceHandle: "right",
        target: "payment",
        targetHandle: "left",
        type: "smoothstep",
        style: { stroke: "var(--color-warning)", strokeWidth: 3, opacity: 0.8 },
      },
      {
        id: "e-payment-delivery",
        source: "payment",
        sourceHandle: "bottom",
        target: "delivery",
        targetHandle: "top",
        type: "smoothstep",
        style: { stroke: "var(--color-accent)", strokeWidth: 3, opacity: 0.8 },
      },
    ],
    [],
  );

  if (!appState.activeBot) {
    return (
      <EmptyBotState
        onCreateBot={onCreateBot}
        title="Схема недоступна"
        description="Чтобы увидеть структуру воронки, необходимо подключить Telegram-бота."
      />
    );
  }

  return (
    <motion.div
      key="flow"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 w-full"
      style={{
        background: "var(--color-surface-2)",
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (style: "light") => void } } } }).Telegram?.WebApp;
          tg?.HapticFeedback?.impactOccurred("light");
          setSelectedBlockId(
            node.id === "delivery" ? "after_payment" : node.id,
          );
          setActiveTab("build");
        }}
        className="touch-none"
      >
        <Background
          color={theme === "dark" ? "#52525B" : "#CBD5E1"}
          gap={24}
          size={1.5}
        />
        <Controls
          position="bottom-left"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            background: "var(--color-surface)",
            padding: "8px",
            borderRadius: "16px",
            boxShadow: "0 8px 24px -8px rgba(0,0,0,0.1)",
            border: "1px solid var(--color-border)",
            margin: "0 0 24px 40px", // Increased from 16px to 80px to avoid nav overlap
          }}
          showInteractive={false}
        />
      </ReactFlow>
    </motion.div>
  );
};
