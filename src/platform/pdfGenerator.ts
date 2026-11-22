/**
 * Sheeta Operations Research - Client-Side PDF & Print Engine
 * Generates standalone, print-perfect documents for all 6 targets with full
 * Arabic (RTL) and English (LTR) bidirectional layout support.
 */

export function generatePrintableHtml(
  title: string,
  bodyContent: string,
  isRtl: boolean = false
): string {
  const dir = isRtl ? 'rtl' : 'ltr';
  const lang = isRtl ? 'ar' : 'en';
  const fontPrimary = isRtl
    ? "'Cairo', 'Segoe UI', 'Noto Sans Arabic', Tahoma, sans-serif"
    : "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(title)} - Sheeta Operations Research</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: ${fontPrimary};
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
      font-size: 11pt;
      direction: ${dir};
    }
    .header-bar {
      border-bottom: 2px solid #4f46e5;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-title {
      font-size: 18pt;
      font-weight: 800;
      color: #4f46e5;
      margin: 0;
    }
    .brand-sub {
      font-size: 9pt;
      color: #64748b;
      margin-top: 2px;
    }
    .meta-box {
      text-align: ${isRtl ? 'left' : 'right'};
      font-size: 8.5pt;
      color: #475569;
    }
    h1, h2, h3, h4 {
      color: #1e1b4b;
      page-break-after: avoid;
      break-after: avoid;
    }
    h1 { font-size: 16pt; margin: 16px 0 8px 0; }
    h2 { font-size: 13pt; margin: 14px 0 6px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 11pt; margin: 12px 0 4px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      text-align: ${isRtl ? 'right' : 'left'};
    }
    th {
      background-color: #f1f5f9;
      font-weight: 600;
      color: #1e293b;
    }
    tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
    }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-primary { background: #e0e7ff; color: #3730a3; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .page-break {
      page-break-before: always;
      break-before: always;
    }
    .footer {
      margin-top: 32px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <div class="brand-title">Sheeta Operations Research</div>
      <div class="brand-sub">${isRtl ? 'منصة بحوث العمليات والتحليل الكمي' : 'Quantitative Analysis & Operations Research Suite'}</div>
    </div>
    <div class="meta-box">
      <div><strong>${escapeXml(title)}</strong></div>
      <div>${new Date().toLocaleString(isRtl ? 'ar-SA' : 'en-US')}</div>
    </div>
  </div>

  <div class="content-body">
    ${bodyContent}
  </div>

  <div class="footer">
    Sheeta Operations Research • ${isRtl ? 'تم التوليد بنجاح محلياً 100%' : 'Generated locally • 100% Offline-Capable'}
  </div>
</body>
</html>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Executes a clean browser print via an invisible sandboxed iframe.
 */
export function executePrint(printableHtml: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      resolve();
      return;
    }

    doc.open();
    doc.write(printableHtml);
    doc.close();

    // Allow resources & fonts to render then print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          resolve();
        }, 1000);
      }
    }, 250);
  });
}
