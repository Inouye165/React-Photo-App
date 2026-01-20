import type { CSSProperties } from 'react';

export type PriceHistoryRecord = {
  id?: string | number;
  date_seen?: string;
  venue?: string;
  price?: string | number;
  url?: string;
};

export type PriceHistoryListProps = {
  history?: PriceHistoryRecord[];
  loading?: boolean;
  currency?: string;
};

// Shared styles
const headerCellStyle: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: '#475569',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const cellStyle: CSSProperties = {
  padding: '10px 12px',
  color: '#334155',
};

/**
 * PriceHistoryList - Ledger-style display of price history records
 *
 * Shows a scrollable table with:
 * - Date
 * - Venue (source)
 * - Price
 * - View link (external URL)
 */
export default function PriceHistoryList({
  history = [],
  loading = false,
  currency = 'USD',
}: PriceHistoryListProps) {
  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  // Format price with currency
  const formatPrice = (price?: string | number) => {
    if (price === null || price === undefined) return '—';
    const numPrice = typeof price === 'number' ? price : Number.parseFloat(price);
    if (Number.isNaN(numPrice)) return '—';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(numPrice);
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '14px',
        }}
        data-testid="price-history-loading"
      >
        Loading price history...
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '14px',
          fontStyle: 'italic',
        }}
        data-testid="price-history-empty"
      >
        No price history recorded yet.
      </div>
    );
  }

  return (
    <div
      className="price-history-list"
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
      data-testid="price-history-list"
    >
      <table
        style={{
          width: '100%',
          minWidth: '400px',
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '2px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}
          >
            <th style={headerCellStyle}>Date</th>
            <th style={headerCellStyle}>Venue</th>
            <th style={{ ...headerCellStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...headerCellStyle, textAlign: 'center', width: '60px' }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {history.map((record, index) => (
            <tr
              key={record.id ?? index}
              style={{
                backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
              }}
              data-testid={`price-history-row-${index}`}
            >
              <td style={cellStyle}>{formatDate(record.date_seen)}</td>
              <td style={cellStyle}>
                {/* React automatically escapes this - XSS safe */}
                {record.venue || '—'}
              </td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: '#166534' }}>
                {formatPrice(record.price)}
              </td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                {record.url ? (
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'none',
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#eff6ff',
                      display: 'inline-block',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = '#dbeafe';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = '#eff6ff';
                    }}
                  >
                    View
                  </a>
                ) : (
                  <span style={{ color: '#cbd5e1' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}