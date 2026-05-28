import React, { useState } from 'react';
import { runRecon, ReconResponse, ReconTier } from '../../services/ai';

interface AiReconProps {
  selectedMonth: string;
}

const TIERS: { id: ReconTier; label: string; description: string }[] = [
  {
    id: 'tier1',
    label: 'Tier 1 · Rule-based + AI tiebreaker',
    description:
      'Deterministic matcher handles the easy 70–85%. Unmatched lines go to Claude with candidate sets; structured-output JSON comes back. Cheapest and fastest.',
  },
  {
    id: 'tier2',
    label: 'Tier 2 · Claude drives via tool use',
    description:
      'Deterministic pre-pass first, then Claude uses search tools (find_gl_by_amount / description / journal) to investigate each unmatched line and proposes matches itself. Handles split transactions and batched deposits.',
  },
  {
    id: 'tier3',
    label: 'Tier 3 · Fully autonomous run',
    description:
      'No pre-pass — Claude reconciles every bank line from scratch using the same tools and writes a full report. Most expensive but closest to "Claude in Excel does it for you".',
  },
];

const CONF_COLOR: Record<string, string> = {
  high: '#16a085',
  medium: '#b45309',
  low: '#6c7a87',
};

const AiRecon: React.FC<AiReconProps> = ({ selectedMonth }) => {
  const [tier, setTier] = useState<ReconTier>('tier1');
  const [result, setResult] = useState<ReconResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthEnd = selectedMonth; // expected mm/dd/yyyy

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runRecon(tier, monthEnd);
      setResult(res);
    } catch (err: any) {
      if (err?.status === 503) {
        setError(
          'AI reconciliation isn’t available yet — the backend doesn’t have ANTHROPIC_API_KEY set. Add it on Render and redeploy.',
        );
      } else {
        setError(err?.message || 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5ebf2',
          borderRadius: 10,
          padding: 18,
          marginBottom: 14,
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>AI Reconciliation</h2>
        <p style={{ margin: '0 0 16px', color: '#6c7a87', fontSize: 13 }}>
          Pick a tier and run against the selected month. All three use the same
          Claude Sonnet 4.6 backend and the same data — they differ in how much
          autonomy the model gets.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 8,
                cursor: 'pointer',
                border:
                  tier === t.id
                    ? '1px solid rgba(26, 188, 156, 0.45)'
                    : '1px solid #e5ebf2',
                background: tier === t.id ? '#e8f8f4' : '#fff',
                font: 'inherit',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: tier === t.id ? '#16a085' : '#222',
                  marginBottom: 4,
                }}
              >
                {t.label}
              </div>
              <div style={{ fontSize: 12, color: '#6c7a87', lineHeight: 1.45 }}>
                {t.description}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={run}
            disabled={!monthEnd || loading}
            style={{
              background: '#1abc9c',
              color: '#fff',
              border: '1px solid #16a085',
              padding: '8px 16px',
              borderRadius: 8,
              cursor: monthEnd && !loading ? 'pointer' : 'not-allowed',
              opacity: !monthEnd || loading ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              {loading ? 'sync' : 'auto_awesome'}
            </span>
            {loading ? 'Running…' : `Run ${tier.toUpperCase()} reconciliation`}
          </button>
          {!monthEnd && (
            <span style={{ fontSize: 12, color: '#b45309' }}>
              Select a reporting month on the Reconciliation tab first.
            </span>
          )}
          {monthEnd && (
            <span style={{ fontSize: 12, color: '#6c7a87' }}>
              Month: <strong>{monthEnd}</strong>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fdecea',
            border: '1px solid #f5c6cb',
            color: '#b71c1c',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Stats strip */}
          <div
            style={{
              display: 'flex',
              gap: 22,
              padding: '14px 18px',
              background: '#fff',
              border: '1px solid #e5ebf2',
              borderRadius: 10,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <Stat label="Bank rows" value={result.stats.bankRows} />
            <Stat label="GL rows" value={result.stats.glRows} />
            <Stat label="Matched (rules)" value={result.stats.matchedRows} color="#16a085" />
            <Stat label="Suggested (AI)" value={result.stats.suggestedRows} color="#1abc9c" />
            <Stat label="Unmatched bank" value={result.stats.unmatchedBank} color="#e74c3c" />
            <Stat label="Exceptions" value={result.exceptions.length} color="#b45309" />
            {result.iterations != null && (
              <Stat label="AI iterations" value={result.iterations} />
            )}
          </div>

          {/* Deterministic matches */}
          {result.matches.length > 0 && (
            <Section title={`Deterministic matches (${result.matches.length})`}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bank #</th>
                    <th style={thStyle}>GL #(s)</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m, i) => (
                    <tr key={`m-${i}`}>
                      <td style={tdMonoStyle}>{m.bankId}</td>
                      <td style={tdMonoStyle}>{m.glIds.join(', ')}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: CONF_COLOR[m.confidence],
                          fontWeight: 600,
                        }}
                      >
                        {m.confidence}
                      </td>
                      <td style={tdStyle}>{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* AI suggestions */}
          {result.suggestions.length > 0 && (
            <Section title={`AI suggestions (${result.suggestions.length})`}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bank #</th>
                    <th style={thStyle}>GL #(s)</th>
                    <th style={thStyle}>Confidence</th>
                    <th style={thStyle}>Reason</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.suggestions.map((m, i) => (
                    <tr key={`s-${i}`}>
                      <td style={tdMonoStyle}>{m.bankId}</td>
                      <td style={tdMonoStyle}>{m.glIds.join(', ')}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: CONF_COLOR[m.confidence],
                          fontWeight: 600,
                        }}
                      >
                        {m.confidence}
                      </td>
                      <td style={tdStyle}>{m.reason}</td>
                      <td style={tdStyle}>
                        <em style={{ color: '#6c7a87', fontSize: 11 }}>
                          accept / reject — wire to Matches tab
                        </em>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Exceptions */}
          {result.exceptions.length > 0 && (
            <Section title={`Exceptions (${result.exceptions.length})`}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bank #</th>
                    <th style={thStyle}>GL #</th>
                    <th style={thStyle}>Kind</th>
                    <th style={thStyle}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {result.exceptions.map((e, i) => (
                    <tr key={`e-${i}`}>
                      <td style={tdMonoStyle}>{e.bankId ?? '—'}</td>
                      <td style={tdMonoStyle}>{e.glId ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#b45309', fontWeight: 600 }}>
                        {e.kind}
                      </td>
                      <td style={tdStyle}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Empty state */}
          {result.matches.length === 0 &&
            result.suggestions.length === 0 &&
            result.exceptions.length === 0 && (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  background: '#fff',
                  border: '1px solid #e5ebf2',
                  borderRadius: 10,
                  color: '#6c7a87',
                }}
              >
                No data returned. Make sure GL Detail is loaded for this month
                and bank transactions exist for that period.
              </div>
            )}
        </>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: '#6c7a87',
        fontWeight: 600,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 18,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: color || '#222',
      }}
    >
      {value}
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div
    style={{
      background: '#fff',
      border: '1px solid #e5ebf2',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 14,
    }}
  >
    <div
      style={{
        padding: '12px 18px',
        borderBottom: '1px solid #e5ebf2',
        background: '#f4f7fb',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {title}
    </div>
    <div style={{ overflowX: 'auto' }}>{children}</div>
  </div>
);

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12.5,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 500,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#6c7a87',
  padding: '10px 12px',
  borderBottom: '1px solid #e5ebf2',
  background: '#f4f7fb',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #eef2f7',
  color: '#222',
};
const tdMonoStyle: React.CSSProperties = {
  ...tdStyle,
  fontVariantNumeric: 'tabular-nums',
};

export default AiRecon;
