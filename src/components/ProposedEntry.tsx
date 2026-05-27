import React, { useState } from 'react';

interface ProposedEntryProps {
  onBack: () => void;
}

interface EntryRow {
  month: string;
  glAccountNumber: string;
  glAccountDescription: string;
  debit: string;
  credit: string;
  description: string;
}

const EMPTY_ROW: EntryRow = {
  month: '',
  glAccountNumber: '',
  glAccountDescription: '',
  debit: '',
  credit: '',
  description: '',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d0d7de',
  borderRadius: '4px',
  fontSize: '13px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: '#fff',
};

const numericInputStyle: React.CSSProperties = {
  ...inputStyle,
  textAlign: 'right',
};

const headerCellStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: '#f0f3f7',
  borderBottom: '2px solid #1abc9c',
  fontSize: '12px',
  fontWeight: 600,
  color: '#2c5364',
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  whiteSpace: 'nowrap',
};

const bodyCellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid #eef1f5',
  verticalAlign: 'middle',
};

const ProposedEntry: React.FC<ProposedEntryProps> = ({ onBack }) => {
  const [rows, setRows] = useState<EntryRow[]>(
    Array.from({ length: 5 }, () => ({ ...EMPTY_ROW }))
  );
  const [debitTotal, setDebitTotal] = useState<string>('');
  const [creditTotal, setCreditTotal] = useState<string>('');

  const updateRow = (index: number, field: keyof EntryRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  };

  return (
    <div className="proposed-entry">
      <h1 style={{ margin: '0 0 4px 0' }}>Proposed Entry</h1>
      <hr style={{ margin: '4px 0 20px 0' }} />

      <div style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: '#e8e8e8',
              color: '#202020',
              border: '1.5px solid #b8b8b8',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-icons" style={{ fontSize: '18px' }}>
              arrow_back
            </span>
            <span>Back</span>
          </button>

          <button
            onClick={addRow}
            style={{
              background: 'linear-gradient(145deg, #1abc9c, #16a085)',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
          >
            <span className="material-icons" style={{ fontSize: '18px' }}>
              add
            </span>
            <span>Add Row</span>
          </button>
        </div>

        <div
          style={{
            border: '1px solid #e1e6ec',
            borderRadius: '8px',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '130px' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={headerCellStyle}>Month</th>
                <th style={headerCellStyle}>GL Account #</th>
                <th style={headerCellStyle}>GL Account Description</th>
                <th style={{ ...headerCellStyle, textAlign: 'right' }}>Debit</th>
                <th style={{ ...headerCellStyle, textAlign: 'right' }}>Credit</th>
                <th style={headerCellStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={bodyCellStyle}>
                    <input
                      type="month"
                      value={row.month}
                      onChange={(e) => updateRow(idx, 'month', e.target.value)}
                      style={inputStyle}
                    />
                  </td>
                  <td style={bodyCellStyle}>
                    <input
                      type="text"
                      value={row.glAccountNumber}
                      onChange={(e) =>
                        updateRow(idx, 'glAccountNumber', e.target.value)
                      }
                      style={inputStyle}
                      placeholder="e.g. 1010"
                    />
                  </td>
                  <td style={bodyCellStyle}>
                    <input
                      type="text"
                      value={row.glAccountDescription}
                      onChange={(e) =>
                        updateRow(idx, 'glAccountDescription', e.target.value)
                      }
                      style={inputStyle}
                      placeholder="e.g. Cash - Operating"
                    />
                  </td>
                  <td style={bodyCellStyle}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.debit}
                      onChange={(e) => updateRow(idx, 'debit', e.target.value)}
                      style={numericInputStyle}
                      placeholder="0.00"
                    />
                  </td>
                  <td style={bodyCellStyle}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.credit}
                      onChange={(e) => updateRow(idx, 'credit', e.target.value)}
                      style={numericInputStyle}
                      placeholder="0.00"
                    />
                  </td>
                  <td style={bodyCellStyle}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(idx, 'description', e.target.value)
                      }
                      style={inputStyle}
                      placeholder="Memo / description"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: '10px 12px',
                    background: '#f7f9fc',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#2c5364',
                    textAlign: 'right',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    borderTop: '2px solid #1abc9c',
                  }}
                >
                  Totals
                </td>
                <td
                  style={{
                    padding: '6px 8px',
                    background: '#f7f9fc',
                    borderTop: '2px solid #1abc9c',
                  }}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={debitTotal}
                    onChange={(e) => setDebitTotal(e.target.value)}
                    style={{ ...numericInputStyle, fontWeight: 600 }}
                    placeholder="0.00"
                  />
                </td>
                <td
                  style={{
                    padding: '6px 8px',
                    background: '#f7f9fc',
                    borderTop: '2px solid #1abc9c',
                  }}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={creditTotal}
                    onChange={(e) => setCreditTotal(e.target.value)}
                    style={{ ...numericInputStyle, fontWeight: 600 }}
                    placeholder="0.00"
                  />
                </td>
                <td
                  style={{
                    padding: '6px 8px',
                    background: '#f7f9fc',
                    borderTop: '2px solid #1abc9c',
                  }}
                />
              </tr>
            </tbody>
          </table>
        </div>

        <p
          style={{
            marginTop: '24px',
            fontSize: '13px',
            color: '#666',
            lineHeight: 1.6,
            padding: '15px 20px',
            background: '#f7f9fc',
            borderRadius: '8px',
            borderLeft: '4px solid #1abc9c',
            fontStyle: 'italic',
          }}
        >
          Future development will allow you to see the effects of this journal
          entry on the reconciliation, and to add GL account numbers on the
          recon that will create a reconciling journal entry.
        </p>
      </div>

      <footer
        style={{
          marginTop: '24px',
          padding: '16px 20px',
          borderTop: '1px solid #e1e6ec',
          color: '#888',
          fontSize: '12px',
          textAlign: 'center',
        }}
      >
        Proposed Entry — Impact Preview
      </footer>
    </div>
  );
};

export default ProposedEntry;
