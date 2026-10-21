"""Generates styled HTML from the master platform offer docx file."""

import io
from pathlib import Path
import mammoth

LEGAL_DIR = Path(__file__).resolve().parents[1] / "static" / "legal"
DOCX_PATH = LEGAL_DIR / "platform_offer.docx"
HTML_PATH = LEGAL_DIR / "platform_offer.html"


def build_platform_offer_html() -> str:
    if not DOCX_PATH.exists():
        raise FileNotFoundError(f"Platform offer docx not found at {DOCX_PATH}")

    with open(DOCX_PATH, "rb") as f:
        body_res = mammoth.convert_to_html(io.BytesIO(f.read()))

    body_html = body_res.value

    html_template = f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Публичная оферта сервиса BotFlow | ИП Медоян А.А.</title>
  <meta name="description" content="Официальный договор публичной оферты на предоставление доступа к сервису создания и обслуживания ботов для продаж BotFlow.">
  <style>
    :root {{
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #475569;
      --border: #e2e8f0;
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --primary-soft: #eef2ff;
      --table-header: #f1f5f9;
      --table-row-alt: #f8fafc;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #090d16;
        --card-bg: #111827;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #1e293b;
        --primary: #6366f1;
        --primary-hover: #818cf8;
        --primary-soft: rgba(99, 102, 241, 0.15);
        --table-header: #1e293b;
        --table-row-alt: rgba(30, 41, 59, 0.4);
      }}
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }}
    .top-bar {{
      position: sticky;
      top: 0;
      z-index: 50;
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(12px);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .brand {{
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
      text-decoration: none;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--primary-soft);
      color: var(--primary);
    }}
    .download-btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      background: var(--primary);
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.15s ease;
    }}
    .download-btn:hover {{
      background: var(--primary-hover);
    }}
    .container {{
      max-width: 820px;
      margin: 28px auto 60px;
      padding: 40px 32px;
      background: var(--card-bg);
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
    }}
    @media (max-width: 640px) {{
      .container {{
        margin: 0;
        border-radius: 0;
        border: none;
        padding: 24px 16px;
      }}
      .top-bar {{
        padding: 10px 14px;
      }}
    }}
    h1 {{
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      margin-top: 36px;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
      letter-spacing: -0.01em;
    }}
    p {{
      margin-bottom: 14px;
      color: var(--text);
      font-size: 15px;
    }}
    p:first-of-type {{
      font-size: 22px;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.02em;
      margin-bottom: 6px;
      color: var(--text);
    }}
    p:nth-of-type(2) {{
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      color: var(--text-muted);
      margin-bottom: 24px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0 28px;
      font-size: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }}
    thead th {{
      background: var(--table-header);
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      color: var(--text);
      border-bottom: 1px solid var(--border);
    }}
    tbody td {{
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }}
    tbody tr:last-child td {{
      border-bottom: none;
    }}
    tbody tr:nth-child(even) {{
      background: var(--table-row-alt);
    }}
    tbody td:first-child {{
      font-weight: 600;
      color: var(--text-muted);
      width: 35%;
    }}
    .footer-note {{
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }}
  </style>
</head>
<body>
  <header class="top-bar">
    <div class="brand">
      <span>BotFlow</span>
      <span class="badge">Официальная оферта</span>
    </div>
    <a href="/api/legal/offer?download=1" class="download-btn" download="Оферта_сервиса_ботов_ИП_Медоян.docx">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Скачать .DOCX</span>
    </a>
  </header>
  <main class="container">
    {body_html}
    <div class="footer-note">
      Официальный документ сервиса BotFlow. Индивидуальный предприниматель Медоян Арам Гагикович, ОГРНИП 321619600251571, ИНН 613302383615.
    </div>
  </main>
</body>
</html>"""

    LEGAL_DIR.mkdir(parents=True, exist_ok=True)
    with open(HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html_template)

    return html_template


if __name__ == "__main__":
    content = build_platform_offer_html()
    print(f"Generated platform offer HTML ({len(content)} chars) at {HTML_PATH}")
