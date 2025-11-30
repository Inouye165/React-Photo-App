import React from 'react';
import PropTypes from 'prop-types';
import PriceRangeVisual from './PriceRangeVisual';
import PriceHistoryList from './PriceHistoryList';

/**
 * Condition rank to color mapping
 */
const CONDITION_COLORS = {
  5: { bg: '#dcfce7', text: '#166534', border: '#86efac' }, // Mint - Green
  4: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }, // Excellent - Blue  
  3: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' }, // Good - Yellow
  2: { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' }, // Fair - Orange
  1: { bg: '#fecaca', text: '#991b1b', border: '#fca5a5' }, // Poor - Red
};

/**
 * Confidence level to display text
 */
function getConfidenceLabel(confidence) {
  if (confidence >= 0.9) return { text: 'High Confidence', color: '#16a34a' };
  if (confidence >= 0.7) return { text: 'Medium Confidence', color: '#ca8a04' };
  return { text: 'Low Confidence', color: '#dc2626' };
}

/**
 * CollectibleDetailView - Rich display of collectible data
 * 
 * Shows:
 * - AI-generated story/description
 * - Category and identification
 * - Condition assessment with visual indicator
 * - Price valuation with sources (links)
 * - Item specifics
 * - Confidence scores
 * - Expandable price history ledger
 */
export default function CollectibleDetailView({ 
  photo,
  collectibleData,
  aiInsights 
}) {
  // State for collapsible valuation ledger
  const [ledgerExpanded, setLedgerExpanded] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyData, setHistoryData] = React.useState(null);
  const [historyError, setHistoryError] = React.useState(null);

  // Get insights from either the collectible data or directly from photo
  const insights = aiInsights || 
                   collectibleData?.ai_analysis_history?.[0]?.result ||
                   photo?.poi_analysis ||
                   null;

  // Parse poi_analysis if it's a string
  const parsedInsights = React.useMemo(() => {
    if (!insights) return null;
    if (typeof insights === 'string') {
      try {
        return JSON.parse(insights);
      } catch {
        return null;
      }
    }
    return insights;
  }, [insights]);

  const description = photo?.description || '';
  const _caption = photo?.caption || 'Collectible Item';
  
  // Extract valuation data - memoized to prevent dependency issues
  const valuation = React.useMemo(() => {
    return parsedInsights?.valuation || {};
  }, [parsedInsights]);
  
  const priceSources = valuation?.priceSources || [];
  const condition = parsedInsights?.condition || collectibleData?.condition_label;
  const conditionRank = parsedInsights?.condition?.rank || collectibleData?.condition_rank || 3;
  const category = parsedInsights?.category || collectibleData?.category || 'Unknown';
  const specifics = parsedInsights?.specifics || collectibleData?.specifics || {};
  const confidences = parsedInsights?.confidences || {};

  const conditionColors = CONDITION_COLORS[conditionRank] || CONDITION_COLORS[3];

  // Fetch price history when ledger is expanded
  const fetchHistory = React.useCallback(async () => {
    if (!collectibleData?.id) return;
    
    setHistoryLoading(true);
    setHistoryError(null);
    
    try {
      const response = await fetch(`/api/collectibles/${collectibleData.id}/history`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load price history');
      }
      
      const data = await response.json();
      setHistoryData(data.history || []);
    } catch (err) {
      console.error('[CollectibleDetailView] History fetch error:', err);
      setHistoryError(err.message || 'Failed to load price history');
    } finally {
      setHistoryLoading(false);
    }
  }, [collectibleData?.id]);

  // Toggle ledger and fetch data on first expand
  const handleLedgerToggle = () => {
    const willExpand = !ledgerExpanded;
    setLedgerExpanded(willExpand);
    
    // Fetch data on first expand
    if (willExpand && historyData === null && !historyLoading) {
      fetchHistory();
    }
  };

  // Calculate average value for the range visual
  const currentValue = React.useMemo(() => {
    const min = valuation.lowEstimateUSD || collectibleData?.value_min;
    const max = valuation.highEstimateUSD || collectibleData?.value_max;
    if (min && max) {
      return (parseFloat(min) + parseFloat(max)) / 2;
    }
    return min || max || 0;
  }, [valuation, collectibleData]);

  return (
    <div className="collectible-detail-view" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      padding: '20px',
      height: '100%',
      overflowY: 'auto',
    }}>
      {/* Header with Category Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <span style={{
          backgroundColor: '#f1f5f9',
          color: '#475569',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {category}
        </span>
        {confidences.category && (
          <span style={{
            fontSize: '11px',
            color: getConfidenceLabel(confidences.category).color,
          }}>
            {getConfidenceLabel(confidences.category).text}
          </span>
        )}
      </div>

      {/* Story / Description */}
      <div style={{
        backgroundColor: '#f8fafc',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #e2e8f0',
      }}>
        <h4 style={{
          margin: '0 0 12px 0',
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          📖 Story
        </h4>
        <p style={{
          margin: 0,
          fontSize: '15px',
          lineHeight: 1.7,
          color: '#334155',
        }}>
          {description || 'No description available.'}
        </p>
      </div>

      {/* Condition Card */}
      <div style={{
        backgroundColor: conditionColors.bg,
        borderRadius: '16px',
        padding: '16px 20px',
        border: `1px solid ${conditionColors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h4 style={{
            margin: '0 0 4px 0',
            fontSize: '11px',
            fontWeight: 700,
            color: conditionColors.text,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            opacity: 0.8,
          }}>
            Condition
          </h4>
          <p style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: conditionColors.text,
          }}>
            {typeof condition === 'object' ? condition.label : condition || 'Unknown'}
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: '4px',
        }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div
              key={n}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: n <= conditionRank ? conditionColors.text : 'rgba(0,0,0,0.1)',
                opacity: n <= conditionRank ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Valuation Card */}
      <div style={{
        backgroundColor: '#fefce8',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid #fef08a',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <h4 style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 700,
            color: '#854d0e',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            💰 Estimated Value
          </h4>
          {confidences.value && (
            <span style={{
              fontSize: '11px',
              color: getConfidenceLabel(confidences.value).color,
            }}>
              {getConfidenceLabel(confidences.value).text}
            </span>
          )}
        </div>
        
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '28px',
          fontWeight: 700,
          color: '#713f12',
        }}>
          ${valuation.lowEstimateUSD || collectibleData?.value_min || '?'} - ${valuation.highEstimateUSD || collectibleData?.value_max || '?'} 
          <span style={{ fontSize: '14px', fontWeight: 500, marginLeft: '4px' }}>
            {valuation.currency || 'USD'}
          </span>
        </p>

        {/* Valuation Reasoning */}
        {valuation.reasoning && (
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '13px',
            color: '#a16207',
            fontStyle: 'italic',
          }}>
            {valuation.reasoning}
          </p>
        )}

        {/* Price Sources */}
        {priceSources.length > 0 && (
          <div style={{
            borderTop: '1px solid #fde047',
            paddingTop: '16px',
          }}>
            <h5 style={{
              margin: '0 0 12px 0',
              fontSize: '11px',
              fontWeight: 600,
              color: '#a16207',
              textTransform: 'uppercase',
            }}>
              Sources
            </h5>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              {priceSources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    color: '#1e40af',
                    fontSize: '13px',
                    border: '1px solid #fef08a',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.borderColor = '#93c5fd';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#fef08a';
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{source.source}</span>
                    {source.notes && (
                      <span style={{ color: '#64748b', marginLeft: '8px' }}>
                        — {source.notes}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontWeight: 700,
                    color: '#16a34a',
                  }}>
                    {source.priceFound}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {priceSources.length === 0 && (
          <p style={{
            margin: 0,
            fontSize: '12px',
            color: '#a16207',
          }}>
            No external price sources found. Value estimated using AI knowledge.
          </p>
        )}
      </div>

      {/* Item Specifics */}
      {Object.keys(specifics).length > 0 && (
        <div style={{
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #e2e8f0',
        }}>
          <h4 style={{
            margin: '0 0 16px 0',
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            🔍 Item Details
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px',
          }}>
            {Object.entries(specifics).map(([key, value]) => {
              // Handle both simple values and {value, confidence} objects
              const displayValue = typeof value === 'object' && value !== null 
                ? value.value 
                : value;
              const confidence = typeof value === 'object' && value !== null 
                ? value.confidence 
                : null;
              
              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: 'white',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                  }}>
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#1e293b',
                  }}>
                    {displayValue || '—'}
                  </p>
                  {confidence !== null && (
                    <span style={{
                      fontSize: '10px',
                      color: getConfidenceLabel(confidence).color,
                    }}>
                      {Math.round(confidence * 100)}% confident
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Analysis Info */}
      {parsedInsights?.searchResultsUsed > 0 && (
        <div style={{
          fontSize: '11px',
          color: '#94a3b8',
          textAlign: 'center',
          padding: '8px',
        }}>
          Analysis used {parsedInsights.searchResultsUsed} search results from Google
        </div>
      )}

      {/* Valuation Ledger - Collapsible Price History Section */}
      {collectibleData?.id && (
        <div 
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}
          data-testid="valuation-ledger"
        >
          {/* Collapsible Header */}
          <button
            onClick={handleLedgerToggle}
            style={{
              width: '100%',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            aria-expanded={ledgerExpanded}
            data-testid="valuation-ledger-toggle"
          >
            <h4 style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              📜 Valuation Ledger
            </h4>
            <span style={{
              fontSize: '18px',
              color: '#94a3b8',
              transform: ledgerExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}>
              ▼
            </span>
          </button>

          {/* Collapsible Content */}
          {ledgerExpanded && (
            <div 
              style={{
                padding: '0 20px 20px 20px',
                borderTop: '1px solid #e2e8f0'
              }}
              data-testid="valuation-ledger-content"
            >
              {/* Price Range Visual */}
              {(valuation.lowEstimateUSD || collectibleData?.value_min) && (
                <div style={{ marginTop: '16px' }}>
                  <PriceRangeVisual
                    min={valuation.lowEstimateUSD || collectibleData?.value_min || 0}
                    max={valuation.highEstimateUSD || collectibleData?.value_max || 0}
                    value={currentValue}
                    currency={valuation.currency || 'USD'}
                    label="Estimated Value"
                  />
                </div>
              )}

              {/* Error State */}
              {historyError && (
                <div 
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '13px',
                    marginTop: '8px'
                  }}
                  data-testid="valuation-ledger-error"
                >
                  ⚠️ {historyError}
                </div>
              )}

              {/* Price History List */}
              <PriceHistoryList 
                history={historyData || []}
                loading={historyLoading}
                currency={valuation.currency || 'USD'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

CollectibleDetailView.propTypes = {
  photo: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    caption: PropTypes.string,
    description: PropTypes.string,
    poi_analysis: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  }),
  collectibleData: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    category: PropTypes.string,
    condition_label: PropTypes.string,
    condition_rank: PropTypes.number,
    value_min: PropTypes.number,
    value_max: PropTypes.number,
    specifics: PropTypes.object,
    ai_analysis_history: PropTypes.array,
  }),
  aiInsights: PropTypes.object,
};
