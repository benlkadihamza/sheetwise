// Pure client-side PDF generator for Sheetwise layouts (zero external dependencies)
function createClientPdfBlob(result, parts, stock, kerf) {
  const sheets = (result && result.sheets) || [];
  if (!sheets.length) return new Blob(['%PDF-1.4\n%Empty\n%%EOF'], { type: 'application/pdf' });
  
  const W = 792, H = 612; // Landscape Letter (points)
  const colors = [
    [0.77, 0.83, 0.69],
    [0.91, 0.84, 0.68],
    [0.73, 0.81, 0.80],
    [0.85, 0.78, 0.74],
    [0.79, 0.78, 0.86],
    [0.87, 0.80, 0.63]
  ];

  const escapePdf = str => String(str || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const pagesData = [];

  for (let idx = 0; idx < sheets.length; idx++) {
    const s = sheets[idx];
    const sw = Number(s.w) || 244, sh = Number(s.h) || 122;
    let stream = '';

    // Header banner
    stream += '0.14 0.24 0.21 rg 36 572 720 2 re f\n';
    stream += 'BT /F1 16 Tf 0.14 0.24 0.21 rg 36 580 Td (SHEETWISE CUTTING PLAN) Tj ET\n';
    stream += 'BT /F1 11 Tf 0.16 0.22 0.18 rg 36 554 Td (Sheet ' + (idx + 1) + ' of ' + sheets.length + ': ' + escapePdf(s.label || 'Stock sheet') + ' - ' + sw + ' x ' + sh + ' cm) Tj ET\n';
    stream += 'BT /F1 9 Tf 0.45 0.49 0.44 rg 36 538 Td (' + (s.pieces ? s.pieces.length : 0) + ' pieces placed  |  Saw kerf: ' + (Number(kerf || 0.4) * 10).toFixed(1) + ' mm) Tj ET\n';

    // Sheet Diagram Area
    const dwMax = 470, dhMax = 270;
    const scale = Math.min(dwMax / sw, dhMax / sh);
    const dw = sw * scale, dh = sh * scale;
    const ox = 36, oy = 240;

    // Background sheet board
    stream += '0.91 0.92 0.87 rg 0.65 0.70 0.60 RG 1 w ' + ox.toFixed(1) + ' ' + oy.toFixed(1) + ' ' + dw.toFixed(1) + ' ' + dh.toFixed(1) + ' re B\n';

    // Draw pieces
    if (s.pieces) {
      for (const p of s.pieces) {
        const px = ox + Number(p.x) * scale;
        const py = oy + dh - (Number(p.y) + Number(p.h)) * scale;
        const pw = Number(p.w) * scale;
        const ph = Number(p.h) * scale;
        const col = colors[(Number(p.color) || 0) % colors.length];

        stream += col[0] + ' ' + col[1] + ' ' + col[2] + ' rg 1 1 1 RG 0.5 w ' + px.toFixed(1) + ' ' + py.toFixed(1) + ' ' + pw.toFixed(1) + ' ' + ph.toFixed(1) + ' re B\n';

        if (pw > 18 && ph > 12) {
          const lbl = escapePdf(p.label).slice(0, 14);
          stream += 'BT /F1 8 Tf 0.20 0.28 0.22 rg ' + (px + 4).toFixed(1) + ' ' + (py + ph / 2 + 1).toFixed(1) + ' Td (' + lbl + ') Tj ET\n';
          const dim = p.w + 'x' + p.h + (p.turn ? ' R' : '');
          stream += 'BT /F1 7 Tf 0.33 0.40 0.30 rg ' + (px + 4).toFixed(1) + ' ' + (py + ph / 2 - 8).toFixed(1) + ' Td (' + dim + ') Tj ET\n';
        }
      }
    }

    // Cut guide lines for free offcuts
    if (s.free) {
      stream += '0.64 0.65 0.62 RG 0.5 w [2 2] 0 d\n';
      for (const f of s.free) {
        const fx = ox + f.x * scale, fy = oy + dh - (f.y + f.h) * scale;
        const fw = f.w * scale, fh = f.h * scale;
        stream += fx.toFixed(1) + ' ' + fy.toFixed(1) + ' ' + fw.toFixed(1) + ' ' + fh.toFixed(1) + ' re S\n';
      }
      stream += '[] 0 d\n';
    }

    // Sheet dimension markers
    stream += 'BT /F1 8 Tf 0.55 0.59 0.51 rg ' + (ox + dw / 2 - 15).toFixed(1) + ' ' + (oy + dh + 4).toFixed(1) + ' Td (' + sw + ' cm) Tj ET\n';
    stream += 'BT /F1 8 Tf 0.55 0.59 0.51 rg ' + (ox + dw + 4).toFixed(1) + ' ' + (oy + dh / 2).toFixed(1) + ' Td (' + sh + ' cm) Tj ET\n';

    // Parts Table on right side
    const tx = 530, ty = 540;
    stream += '0.94 0.96 0.93 rg 0.75 0.78 0.72 RG 0.5 w ' + tx + ' ' + (ty - 16) + ' 226 16 re B\n';
    stream += 'BT /F1 8 Tf 0.2 0.25 0.2 rg ' + (tx + 6) + ' ' + (ty - 12) + ' Td (PART LABEL) Tj ' + (tx + 105) + ' ' + (ty - 12) + ' Td (W x H (cm)) Tj ' + (tx + 185) + ' ' + (ty - 12) + ' Td (QTY) Tj ET\n';

    const groups = {};
    if (s.pieces) {
      for (const p of s.pieces) {
        const k = p.label + '|' + p.w + '|' + p.h;
        if (!groups[k]) groups[k] = { label: p.label, w: p.w, h: p.h, count: 0 };
        groups[k].count++;
      }
    }

    let rowY = ty - 32;
    for (const g of Object.values(groups)) {
      if (rowY < 40) break;
      stream += '0.88 0.90 0.86 RG 0.5 w ' + tx + ' ' + (rowY - 4) + ' m ' + (tx + 226) + ' ' + (rowY - 4) + ' l S\n';
      stream += 'BT /F1 8 Tf 0.18 0.22 0.18 rg ' + (tx + 6) + ' ' + rowY + ' Td (' + escapePdf(g.label).slice(0, 16) + ') Tj ' + (tx + 105) + ' ' + rowY + ' Td (' + g.w + ' x ' + g.h + ') Tj ' + (tx + 195) + ' ' + rowY + ' Td (' + g.count + ') Tj ET\n';
      rowY -= 17;
    }

    // Footer
    stream += '0.85 0.88 0.83 RG 0.5 w 36 25 720 0.1 re S\n';
    stream += 'BT /F1 7 Tf 0.55 0.59 0.51 rg 36 15 Td (Sheetwise Cut Planner  -  Page ' + (idx + 1) + ' of ' + sheets.length + ') Tj ET\n';

    pagesData.push(stream);
  }

  // Construct PDF 1.4 file
  let out = '%PDF-1.4\n';
  let nextId = 4;
  const pageIds = [];
  const streamBodies = [];

  for (const pStream of pagesData) {
    const sId = nextId++;
    const pId = nextId++;
    pageIds.push(pId);
    streamBodies.push({ sId, pId, stream: pStream });
  }

  // Obj 1: Catalog
  out += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  // Obj 2: Pages
  out += '2 0 obj\n<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>\nendobj\n';
  // Obj 3: Font
  out += '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  for (const item of streamBodies) {
    out += item.sId + ' 0 obj\n<< /Length ' + item.stream.length + ' >>\nstream\n' + item.stream + '\nendstream\nendobj\n';
    out += item.pId + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Contents ' + item.sId + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n';
  }

  // Calculate object byte offsets
  const lines = out.split('\n');
  const offsets = {};
  let cur = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d+) 0 obj$/);
    if (m) offsets[Number(m[1])] = cur;
    cur += lines[i].length + 1; // plus \n
  }

  const xrefOffset = out.length;
  out += 'xref\n0 ' + nextId + '\n0000000000 65535 f \n';
  for (let id = 1; id < nextId; id++) {
    const off = offsets[id] || 0;
    out += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  out += 'trailer\n<< /Size ' + nextId + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';

  return new Blob([out], { type: 'application/pdf' });
}
if (typeof module !== 'undefined') module.exports = { createClientPdfBlob };
