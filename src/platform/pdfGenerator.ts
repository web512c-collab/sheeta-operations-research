/**
 * Sheeta Operations Research - Client-Side Binary PDF & Print Engine
 * Generates genuine binary multi-page PDF (%PDF-1.4) documents locally with full
 * Arabic (RTL) and English (LTR) shaping via bundled Canvas fonts, plus clean print HTML.
 */

import type { ReportData } from '../engines/reportBuilder';

export interface PdfPageImage {
  widthPx: number;
  heightPx: number;
  jpegBytes: Uint8Array;
}

function encodeAscii(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Pure binary multi-page %PDF-1.4 document writer from JPEG rasterized A4 pages.
 * Zero external dependencies; safe across Node tests, Web, Desktop, and Android WebView.
 */
export function buildPdfFromJpegPages(pages: PdfPageImage[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error('Cannot build PDF with zero pages.');
  }

  // A4 dimensions in PDF user-space points (72 DPI)
  const PAGE_W_PT = 595.28;
  const PAGE_H_PT = 841.89;

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushStr = (s: string) => pushBytes(encodeAscii(s));

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const numPages = pages.length;
  const totalObjects = 2 + numPages * 3;
  const offsets = new Array<number>(totalObjects + 1).fill(0);

  const pageKids: string[] = [];
  for (let i = 0; i < numPages; i++) {
    pageKids.push(`${3 + i * 3} 0 R`);
  }

  // Object 1: Catalog
  offsets[1] = offset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  offsets[2] = offset;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${numPages} >>\nendobj\n`);

  // Page, Content Stream, and Image XObject triplets
  for (let i = 0; i < numPages; i++) {
    const pObj = 3 + i * 3;
    const cObj = pObj + 1;
    const iObj = pObj + 2;
    const page = pages[i];

    const contentStream = `q\n${PAGE_W_PT} 0 0 ${PAGE_H_PT} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encodeAscii(contentStream);

    // Page object
    offsets[pObj] = offset;
    pushStr(
      `${pObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W_PT} ${PAGE_H_PT}] /Resources << /XObject << /Im0 ${iObj} 0 R >> >> /Contents ${cObj} 0 R >>\nendobj\n`
    );

    // Content stream object
    offsets[cObj] = offset;
    pushStr(`${cObj} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');

    // Image XObject
    offsets[iObj] = offset;
    pushStr(
      `${iObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.widthPx} /Height ${page.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(page.jpegBytes);
    pushStr('\nendstream\nendobj\n');
  }

  // XRef Table
  const xrefOffset = offset;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    pushStr(`${offsets[id].toString().padStart(10, '0')} 00000 n \n`);
  }

  // Trailer & EOF
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const output = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }
  return output;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

interface RenderBlock {
  draw: (ctx: CanvasRenderingContext2D, y: number, width: number, isRtl: boolean) => void;
  height: number;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];
  const rawLines = text.split('\n');
  for (const raw of rawLines) {
    if (!raw.trim()) {
      result.push('');
      continue;
    }
    const words = raw.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

/**
 * Renders structured OR report or HTML text onto crisp A4 Canvas pages using
 * bundled Cairo / Plus Jakarta Sans fonts (proper Arabic RTL shaping via browser Skia/HarfBuzz)
 * and outputs real multi-page %PDF-1.4 bytes.
 */
export async function renderReportToPdfBytes(params: {
  title: string;
  htmlContent?: string;
  reportData?: ReportData;
  isRtl?: boolean;
}): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    throw new Error('DOM Canvas is required to rasterize PDF pages.');
  }
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const isRtl = params.reportData ? params.reportData.language === 'ar' : Boolean(params.isRtl);
  const PAGE_W = 1240; // ~150 DPI A4 width
  const PAGE_H = 1754; // ~150 DPI A4 height
  const MARGIN_X = 72;
  const MARGIN_TOP = 80;
  const MARGIN_BOTTOM = 90;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const fontSans = isRtl
    ? "'Cairo', 'Segoe UI', Tahoma, sans-serif"
    : "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";
  const fontMono = "'JetBrains Mono', monospace";

  // Measurement canvas
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = PAGE_W;
  measureCanvas.height = 100;
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.direction = isRtl ? 'rtl' : 'ltr';

  const blocks: RenderBlock[] = [];
  const addSpacer = (h: number) => {
    blocks.push({ height: h, draw: () => {} });
  };

  const addSectionHeading = (heading: string) => {
    blocks.push({
      height: 48,
      draw: (ctx, y, w, rtl) => {
        ctx.font = `700 24px ${fontSans}`;
        ctx.fillStyle = '#1e1b4b';
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.direction = rtl ? 'rtl' : 'ltr';
        ctx.fillText(heading, rtl ? MARGIN_X + w : MARGIN_X, y + 28);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(MARGIN_X, y + 40);
        ctx.lineTo(MARGIN_X + w, y + 40);
        ctx.stroke();
      },
    });
  };

  const addWarningBox = (msg: string) => {
    mCtx.font = `600 18px ${fontSans}`;
    const lines = wrapTextLines(mCtx, msg, CONTENT_W - 36);
    const boxH = 26 + lines.length * 26;
    blocks.push({
      height: boxH + 10,
      draw: (ctx, y, w, rtl) => {
        ctx.fillStyle = '#fef3c7';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.fillRect(MARGIN_X, y, w, boxH);
        ctx.strokeRect(MARGIN_X, y, w, boxH);
        ctx.font = `600 18px ${fontSans}`;
        ctx.fillStyle = '#92400e';
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.direction = rtl ? 'rtl' : 'ltr';
        lines.forEach((line, idx) => {
          ctx.fillText(
            line,
            rtl ? MARGIN_X + w - 18 : MARGIN_X + 18,
            y + 30 + idx * 26
          );
        });
      },
    });
  };

  const addParagraphBlock = (text: string, mono = false) => {
    const f = mono ? `400 16px ${fontMono}` : `400 18px ${fontSans}`;
    mCtx.font = f;
    const lines = wrapTextLines(mCtx, text, CONTENT_W - 24);
    const lineHeight = 25;
    // Chunk into slices up to 22 lines so long formulations break cleanly across pages
    for (let start = 0; start < lines.length; start += 22) {
      const slice = lines.slice(start, start + 22);
      const h = 20 + slice.length * lineHeight;
      blocks.push({
        height: h + 8,
        draw: (ctx, y, w, rtl) => {
          if (mono) {
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1.5;
            ctx.fillRect(MARGIN_X, y, w, h);
            ctx.strokeRect(MARGIN_X, y, w, h);
          }
          ctx.font = f;
          ctx.fillStyle = '#0f172a';
          const effectiveRtl = mono ? false : rtl;
          ctx.textAlign = effectiveRtl ? 'right' : 'left';
          ctx.direction = effectiveRtl ? 'rtl' : 'ltr';
          slice.forEach((line, idx) => {
            ctx.fillText(
              line,
              effectiveRtl ? MARGIN_X + w - 12 : MARGIN_X + 12,
              y + 26 + idx * lineHeight
            );
          });
        },
      });
    }
  };

  const addTableRows = (headers: string[], rows: string[][], colFractions: number[]) => {
    const rowH = 36;
    const drawRow = (cells: string[], isHeader: boolean, even: boolean): RenderBlock => ({
      height: rowH,
      draw: (ctx, y, w, rtl) => {
        ctx.fillStyle = isHeader ? '#f1f5f9' : even ? '#f8fafc' : '#ffffff';
        ctx.fillRect(MARGIN_X, y, w, rowH);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(MARGIN_X, y, w, rowH);

        let curX = rtl ? MARGIN_X + w : MARGIN_X;
        for (let c = 0; c < cells.length; c++) {
          const colW = w * colFractions[c];
          const cellX = rtl ? curX - colW : curX;
          if (c > 0) {
            ctx.beginPath();
            ctx.moveTo(rtl ? curX : cellX, y);
            ctx.lineTo(rtl ? curX : cellX, y + rowH);
            ctx.stroke();
          }
          ctx.font = isHeader ? `700 16px ${fontSans}` : `500 16px ${fontSans}`;
          ctx.fillStyle = isHeader ? '#1e293b' : '#0f172a';
          ctx.textAlign = rtl ? 'right' : 'left';
          ctx.direction = rtl ? 'rtl' : 'ltr';
          const textX = rtl ? cellX + colW - 10 : cellX + 10;
          const label = cells[c].length > 34 ? `${cells[c].slice(0, 31)}...` : cells[c];
          ctx.fillText(label, textX, y + 24, colW - 20);
          curX = rtl ? curX - colW : curX + colW;
        }
      },
    });

    blocks.push(drawRow(headers, true, false));
    rows.forEach((r, idx) => blocks.push(drawRow(r, false, idx % 2 === 1)));
    addSpacer(14);
  };

  // Build Header Banner Block
  const report = params.reportData;
  const headerTitle = report?.title ?? params.title;
  const headerModule = report?.moduleName ?? 'Operations Research';
  const headerDate = report?.createdAt ?? new Date().toLocaleString(isRtl ? 'ar-SA' : 'en-US');

  blocks.push({
    height: 118,
    draw: (ctx, y, w, rtl) => {
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(MARGIN_X, y, w, 96);

      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 28px ${fontSans}`;
      ctx.fillText('Sheeta Operations Research', rtl ? MARGIN_X + w - 24 : MARGIN_X + 24, y + 40);
      ctx.font = `500 17px ${fontSans}`;
      ctx.fillStyle = '#e0e7ff';
      ctx.fillText(
        `${headerTitle} • ${headerModule}`,
        rtl ? MARGIN_X + w - 24 : MARGIN_X + 24,
        y + 72
      );

      ctx.textAlign = rtl ? 'left' : 'right';
      ctx.fillStyle = '#c7d2fe';
      ctx.font = `500 15px ${fontSans}`;
      ctx.fillText(headerDate, rtl ? MARGIN_X + 24 : MARGIN_X + w - 24, y + 40);
    },
  });

  if (report) {
    if (report.warningMessage) {
      addWarningBox(report.warningMessage);
    }

    addSectionHeading(
      isRtl ? '1. صياغة المسألة والمدخلات' : '1. Problem Formulation & Inputs'
    );
    addParagraphBlock(report.formulation, true);
    addSpacer(10);

    if (report.presolveSummary) {
      addSectionHeading(
        isRtl ? '2. ملخص المعالجة المسبقة (Presolve)' : '2. Multi-Pass Presolve Summary'
      );
      addTableRows(
        [isRtl ? 'البند' : 'Metric', isRtl ? 'القيمة' : 'Value'],
        [
          [
            isRtl ? 'المتغيرات' : 'Variables',
            `${report.presolveSummary.originalVars} -> ${report.presolveSummary.reducedVars}`,
          ],
          [
            isRtl ? 'القيود' : 'Constraints',
            `${report.presolveSummary.originalConstraints} -> ${report.presolveSummary.reducedConstraints}`,
          ],
        ],
        [0.45, 0.55]
      );
    }

    addSectionHeading(
      isRtl ? '3. ملخص الحل وقيم المتغيرات' : '3. Solution Summary & Decision Variables'
    );
    const solSummaryLines = [`${isRtl ? 'حالة الحل:' : 'Status:'} ${report.solutionStatus}`];
    if (report.optimalObjective !== undefined) {
      solSummaryLines.push(
        `${isRtl ? 'قيمة دالة الهدف (Z):' : 'Objective Value (Z):'} ${report.optimalObjective.toFixed(4)}`
      );
    }
    addParagraphBlock(solSummaryLines.join('\n'));

    if (report.variableAssignments && report.variableAssignments.length > 0) {
      addTableRows(
        [isRtl ? 'المتغير' : 'Variable', isRtl ? 'القيمة' : 'Value'],
        report.variableAssignments.map((v) => [v.name, v.value.toFixed(4)]),
        [0.55, 0.45]
      );
    }

    if (report.constraintDetails && report.constraintDetails.length > 0) {
      addSectionHeading(
        isRtl ? '4. تحليل حساسية القيود والأسعار الظلية' : '4. Constraint Slacks & Shadow Prices'
      );
      addTableRows(
        [
          isRtl ? 'القيد' : 'Constraint',
          'LHS',
          'RHS',
          isRtl ? 'الفائض/النقص' : 'Slack/Surplus',
          isRtl ? 'السعر الظلي' : 'Dual Price',
        ],
        report.constraintDetails.map((c) => [
          `${c.name} (${c.op})`,
          c.lhs.toFixed(3),
          c.rhs.toFixed(3),
          c.slackOrSurplus.toFixed(3),
          c.dualValue.toFixed(4),
        ]),
        [0.32, 0.16, 0.16, 0.18, 0.18]
      );
    }

    if (report.comparison) {
      addSectionHeading(
        isRtl ? '5. مقارنة Branch & Bound والحدود' : '5. Branch & Bound Comparison & Limits'
      );
      const rows: string[][] = [
        [
          isRtl ? 'قيمة الاسترخاء الخطي (LP)' : 'LP Relaxation Value',
          report.comparison.lpRelaxationValue.toFixed(4),
        ],
        [
          isRtl ? 'فجوة الحل الصحيح' : 'Integrality Gap',
          `${report.comparison.integralityGapPercent.toFixed(2)}%`,
        ],
        [isRtl ? 'العقد المستكشفة' : 'Explored Nodes', `${report.comparison.exploredNodes}`],
        [
          isRtl ? 'زمن التنفيذ' : 'Execution Time',
          `${report.comparison.executionTimeMs.toFixed(2)} ms`,
        ],
      ];
      if (report.comparison.integerSolutionValue !== undefined) {
        rows.splice(1, 0, [
          isRtl ? 'أفضل حل صحيح (Incumbent)' : 'Best Integer Incumbent',
          report.comparison.integerSolutionValue.toFixed(4),
        ]);
      }
      if (report.comparison.bestBound !== undefined) {
        rows.splice(2, 0, [
          isRtl ? 'الحد الخارجي المتبقي (Best Bound)' : 'Best Remaining Bound',
          report.comparison.bestBound.toFixed(4),
        ]);
      }
      if (report.comparison.limitsUsed) {
        const lu = report.comparison.limitsUsed;
        rows.push([
          isRtl ? 'حدود الخوارزمية المطبقة' : 'Limits Applied',
          `nodes=${lu.maxNodes}, depth=${lu.maxDepth}, timeout=${(lu.timeoutMs / 1000).toFixed(0)}s`,
        ]);
      }
      addTableRows([isRtl ? 'المعيار' : 'Metric', isRtl ? 'القيمة' : 'Value'], rows, [0.5, 0.5]);
    }

    if (report.pertCriticalPaths && report.pertCriticalPaths.length > 0) {
      addSectionHeading(
        isRtl ? 'المسارات الحرجة في الشبكة' : 'Distinct Critical Paths'
      );
      addParagraphBlock(
        report.pertCriticalPaths.map((p, idx) => `${idx + 1}. ${p.join(' -> ')}`).join('\n')
      );
    }

    if (report.simulationStats) {
      addSectionHeading(isRtl ? 'ملخص المحاكاة' : 'Simulation Summary');
      addTableRows(
        [isRtl ? 'الإحصاء' : 'Statistic', isRtl ? 'القيمة' : 'Value'],
        [
          [isRtl ? 'عدد السيناريوهات' : 'Total Scenarios', `${report.simulationStats.totalScenarios}`],
          [isRtl ? 'أفضل قيمة' : 'Best Value', report.simulationStats.bestValue.toFixed(4)],
          [isRtl ? 'أسوأ قيمة' : 'Worst Value', report.simulationStats.worstValue.toFixed(4)],
          [isRtl ? 'المتوسط' : 'Mean Value', report.simulationStats.meanValue.toFixed(4)],
          [isRtl ? 'الانحراف المعياري' : 'Std Dev', report.simulationStats.stdDevValue.toFixed(4)],
        ],
        [0.5, 0.5]
      );
    }
  } else if (params.htmlContent) {
    const plain = params.htmlContent
      .replace(/<\/(p|div|h1|h2|h3|h4|tr|li|pre)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
    addParagraphBlock(plain);
  }

  // Paginate blocks onto A4 canvases
  const canvases: HTMLCanvasElement[] = [];
  const createPageCanvas = () => {
    const c = document.createElement('canvas');
    c.width = PAGE_W;
    c.height = PAGE_H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    return { canvas: c, ctx };
  };

  let current = createPageCanvas();
  canvases.push(current.canvas);
  let cursorY = MARGIN_TOP;

  for (const block of blocks) {
    if (cursorY + block.height > PAGE_H - MARGIN_BOTTOM && cursorY > MARGIN_TOP + 20) {
      current = createPageCanvas();
      canvases.push(current.canvas);
      cursorY = MARGIN_TOP;
    }
    block.draw(current.ctx, cursorY, CONTENT_W, isRtl);
    cursorY += block.height;
  }

  // Stamp footer page numbers
  const totalPages = canvases.length;
  for (let i = 0; i < totalPages; i++) {
    const ctx = canvases[i].getContext('2d')!;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, PAGE_H - 64);
    ctx.lineTo(PAGE_W - MARGIN_X, PAGE_H - 64);
    ctx.stroke();

    ctx.font = `500 14px ${fontSans}`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    const footerText = isRtl
      ? `منظومة شيتة لبحوث العمليات • صفحة ${i + 1} من ${totalPages}`
      : `Sheeta Operations Research • Page ${i + 1} of ${totalPages}`;
    ctx.fillText(footerText, PAGE_W / 2, PAGE_H - 36);
  }

  const pageImages: PdfPageImage[] = [];
  for (const canvas of canvases) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode PDF page JPEG.'))),
        'image/jpeg',
        0.92
      );
    });
    const buffer = await blob.arrayBuffer();
    pageImages.push({
      widthPx: PAGE_W,
      heightPx: PAGE_H,
      jpegBytes: new Uint8Array(buffer),
    });
  }

  return buildPdfFromJpegPages(pageImages);
}

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
    .warning-banner {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-weight: 600;
      font-size: 9.5pt;
    }
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
      <div class="brand-sub">${isRtl ? 'منظومة بحوث العمليات والتحليل الكمي' : 'Quantitative Analysis & Operations Research Suite'}</div>
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
    Sheeta Operations Research • ${isRtl ? 'تم التوليد محلياً 100%' : 'Generated locally • 100% Offline-Capable'}
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
