/**
 * CollectiblePendingReview Component
 * 
 * HITL (Human-In-The-Loop) review interface for pending collectible identifications.
 * Displays AI's suggested identification from Google Lens and allows user to approve or edit.
 * 
 * Features:
 * - Shows AI identification suggestion
 * - Displays Google Lens visual matches with thumbnails and links
 * - Confidence score indicator
 * - Approve button - confirms identification and proceeds to valuation
 * - Edit button - switches to edit mode to modify before confirming
 */

import React from 'react';
import type { CollectibleAiAnalysis } from '../types/collectibles';
import styles from './CollectiblePendingReview.module.css';

export interface CollectiblePendingReviewProps {
  aiAnalysis: CollectibleAiAnalysis;
  onApprove: () => void;
  onEdit: () => void;
}

/**
 * Format confidence as percentage
 */
function formatConfidence(confidence?: number): string {
  if (confidence === undefined || confidence === null) return 'Unknown';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get confidence color
 */
function getConfidenceColor(confidence?: number): string {
  if (!confidence) return '#94a3b8';
  if (confidence >= 0.9) return '#16a34a'; // High - Green
  if (confidence >= 0.7) return '#ca8a04'; // Medium - Yellow
  return '#dc2626'; // Low - Red
}

export default function CollectiblePendingReview({
  aiAnalysis,
  onApprove,
  onEdit,
}: CollectiblePendingReviewProps) {
  const identification = aiAnalysis.identification;
  const visualMatches = aiAnalysis.visualMatches || [];
  const confidence = identification?.confidence || aiAnalysis.review?.confidence;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>🔍 Review AI Identification</h3>
        <span className={styles.statusBadge}>Pending Review</span>
      </div>

      {/* Info Message */}
      <div className={styles.infoBox}>
        <p className={styles.infoText}>
          The AI has identified this collectible using Google Lens. Please review the suggestion below and either approve it to continue to valuation, or edit it if corrections are needed.
        </p>
      </div>

      {/* AI Identification */}
      {identification && (
        <div className={styles.identificationCard}>
          <div className={styles.cardHeader}>
            <h4 className={styles.cardTitle}>AI Suggestion</h4>
            <span 
              className={styles.confidenceBadge}
              style={{ color: getConfidenceColor(confidence) }}
            >
              {formatConfidence(confidence)} Confidence
            </span>
          </div>
          
          <div className={styles.identificationDetails}>
            {identification.id && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Identified As:</span>
                <span className={styles.detailValue}>{identification.id}</span>
              </div>
            )}
            {identification.category && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Category:</span>
                <span className={styles.detailValue}>{identification.category}</span>
              </div>
            )}
            {identification.fields && Object.keys(identification.fields).length > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Additional Info:</span>
                <div className={styles.fieldsGrid}>
                  {Object.entries(identification.fields).map(([key, value]) => (
                    <div key={key} className={styles.fieldItem}>
                      <span className={styles.fieldKey}>{key}:</span>
                      <span className={styles.fieldValue}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Lens Visual Matches */}
      {visualMatches.length > 0 && (
        <div className={styles.visualMatchesSection}>
          <h4 className={styles.sectionTitle}>Google Lens Results</h4>
          <div className={styles.matchesGrid}>
            {visualMatches.slice(0, 6).map((match, index) => (
              <a
                key={index}
                href={match.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.matchCard}
              >
                {match.thumbnail && (
                  <img
                    src={match.thumbnail}
                    alt={match.title}
                    className={styles.matchThumbnail}
                  />
                )}
                <div className={styles.matchInfo}>
                  <p className={styles.matchTitle}>{match.title}</p>
                  {match.source && (
                    <p className={styles.matchSource}>{match.source}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button
          onClick={onEdit}
          className={`${styles.button} ${styles.buttonSecondary}`}
        >
          ✏️ Edit Identification
        </button>
        <button
          onClick={onApprove}
          className={`${styles.button} ${styles.buttonPrimary}`}
        >
          ✓ Approve & Continue to Valuation
        </button>
      </div>
    </div>
  );
}
