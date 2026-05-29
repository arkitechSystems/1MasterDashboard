/**
 * PDF text extraction tool. Loads pdf.js from cdnjs at runtime so we
 * don't have to deal with CRA worker config or ship pdfjs-dist in the
 * main bundle. Exports the extracted text to Excel (one row per line).
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const PDFJS_VERSION = '2.10.377';
const PDFJS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

// pdfjsLib lives on window once the CDN script is loaded.
declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
    };
  }
}
interface PdfTextItem { str: string }
interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  }>;
}

const loadPdfJs = (): Promise<NonNullable<Window['pdfjsLib']>> =>
  new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error('pdf.js loaded but pdfjsLib global is missing'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error(`Failed to load pdf.js from ${PDFJS_SRC}`));
    document.head.appendChild(script);
  });

const PDFReaderTool: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!file) {
      setError('Pick a PDF first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pdfjs = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      let out = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        out += content.items.map((it) => it.str).join(' ') + '\n\n';
      }
      setText(out);
    } catch (e: any) {
      setError(e?.message || 'Failed to read PDF');
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    if (!text) {
      setError('Extract text first.');
      return;
    }
    const rows = text.split('\n').map((line) => [line]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'PDF Data');
    XLSX.writeFile(wb, `${(file?.name.replace(/\.pdf$/i, '') || 'pdf_extract')}.xlsx`);
  };

  return (
    <div>
      <h2 className="tk-section-title">PDF → Text → Excel</h2>

      <div className="tk-upload-box">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setText('');
            setError(null);
          }}
        />
        {file && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#6c7a87' }}>
            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>

      <div className="tk-actions">
        <button type="button" className="tk-btn" onClick={handleExtract} disabled={!file || busy}>
          <span className="material-icons">visibility</span>
          {busy ? 'Extracting…' : 'Extract Text'}
        </button>
        <button type="button" className="tk-btn tk-btn-ghost" onClick={exportExcel} disabled={!text}>
          <span className="material-icons">download</span>Export to Excel
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fdecea', color: '#b91c1c', border: '1px solid #f5c6c0',
          padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {text ? (
        <div className="tk-pdf-output">{text}</div>
      ) : (
        <div className="tk-empty">Upload a PDF above and click <em>Extract Text</em>.</div>
      )}
    </div>
  );
};

export default PDFReaderTool;
