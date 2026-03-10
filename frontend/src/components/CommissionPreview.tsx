import React from 'react';

interface CommissionPreviewProps {
  commissionRate: number;
  secondaryRate: number;
  recurringRate: number;
  exampleRevenue?: number;
}

const CommissionPreview: React.FC<CommissionPreviewProps> = ({
  commissionRate,
  secondaryRate,
  recurringRate,
  exampleRevenue = 100
}) => {
  const level1 = (exampleRevenue * commissionRate) / 100;
  const level2 = (exampleRevenue * secondaryRate) / 100;
  const recurring = (exampleRevenue * recurringRate) / 100;

  return (
    <div style={{
      padding: '1.5rem',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '0.75rem',
      color: 'white',
      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '1.5rem' }}>💡</span>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0 }}>
          Commission Preview
        </h3>
      </div>
      
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '1rem',
        borderRadius: '0.5rem',
        marginBottom: '1rem'
      }}>
        <p style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
          Example: Customer pays ${exampleRevenue.toFixed(2)}
        </p>
        <div style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: '#ffd700'
        }}>
          ${exampleRevenue.toFixed(2)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Level 1 Commission */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '1rem',
          borderRadius: '0.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Level 1 Promoter</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
              Direct referral commission
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              ${level1.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
              ({commissionRate}%)
            </div>
          </div>
        </div>

        {/* Level 2 Commission */}
        {secondaryRate > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Level 2 Promoter</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                Sub-referral commission
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                ${level2.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                ({secondaryRate}%)
              </div>
            </div>
          </div>
        )}

        {/* Recurring Commission */}
        {recurringRate > 0 && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Recurring (Monthly)</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                Per subscription renewal
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                ${recurring.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                ({recurringRate}%)
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
          Total First Month
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffd700' }}>
          ${(level1 + level2).toFixed(2)}
        </div>
      </div>
    </div>
  );
};

export default CommissionPreview;
