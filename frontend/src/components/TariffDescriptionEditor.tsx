import { useEffect, useRef } from "react";
import { Bold, Italic, Strikethrough } from "lucide-react";

interface TariffDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxCharacters?: number;
  placeholder?: string;
  helperText?: string;
}

const DEFAULT_MAX_CHARACTERS = 3000;

function getPlainTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length;
}

/** Compact rich-text field for the description shown in the Telegram invoice. */
export function TariffDescriptionEditor({
  value,
  onChange,
  maxCharacters = DEFAULT_MAX_CHARACTERS,
  placeholder = "Опишите, что входит в тариф...",
  helperText = "Описание для счёта",
}: TariffDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const textLength = getPlainTextLength(value);
  const isOverLimit = textLength > maxCharacters;

  useEffect(() => {
    if (
      editorRef.current &&
      document.activeElement !== editorRef.current &&
      editorRef.current.innerHTML !== value
    ) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const emitValue = () => onChange(editorRef.current?.innerHTML || "");

  const format = (command: "bold" | "italic" | "strikeThrough") => {
    document.execCommand(command, false);
    emitValue();
    editorRef.current?.focus();
  };

  return (
    <div className={`overflow-hidden rounded-xl border bg-[var(--color-surface)] focus-within:border-[var(--color-primary)] ${isOverLimit ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"}`}>
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5">
        <button
          type="button"
          aria-label="Сделать текст жирным"
          title="Жирный"
          onMouseDown={(event) => {
            event.preventDefault();
            format("bold");
          }}
          className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
        >
          <Bold size={14} />
        </button>
        <button
          type="button"
          aria-label="Сделать текст курсивом"
          title="Курсив"
          onMouseDown={(event) => {
            event.preventDefault();
            format("italic");
          }}
          className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
        >
          <Italic size={14} />
        </button>
        <button
          type="button"
          aria-label="Зачеркнуть текст"
          title="Зачёркнутый"
          onMouseDown={(event) => {
            event.preventDefault();
            format("strikeThrough");
          }}
          className="flex size-7 items-center justify-center rounded-md text-[var(--color-foreground-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
        >
          <Strikethrough size={14} />
        </button>
        <span className="ml-2 text-[11px] text-[var(--color-foreground-tertiary)]">
          Форматирование увидит клиент в счёте
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emitValue}
        onBlur={emitValue}
        className="rich-text-editor min-h-[88px] p-3 text-[14px] outline-none"
        style={{
          color: "var(--color-foreground)",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
      <div className={`flex justify-end border-t border-[var(--color-border)] px-3 py-1.5 text-[11px] ${isOverLimit ? "bg-[var(--color-danger-soft)] font-semibold text-[var(--color-danger)]" : "bg-[var(--color-surface-2)] text-[var(--color-foreground-tertiary)]"}`}>
        {isOverLimit ? "Сократите текст: " : `${helperText}: `}
        {textLength} / {maxCharacters}
      </div>
    </div>
  );
}
