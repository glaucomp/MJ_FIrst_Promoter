import React from 'react';

interface PercentageSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  icon?: string;
  color?: string;
}

const PercentageSlider: React.FC<PercentageSliderProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  description,
  icon = '📊',
  color = '#667eea'
}) => {
  return (
    <div style={{
      padding: '1.5rem',
      background: 'white',
      borderRadius: '0.5rem',
      border: '1px solid #e2e8f0',
      marginBottom: '1rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{icon}</span>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2d3748', display: 'block' }}>
              {label}
            </label>
            {description && (
              <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem' }}>
                {description}
              </p>
            )}
          </div>
        </div>
        <div style={{
          background: `${color}15`,
          color: color,
          padding: '0.5rem 1rem',
          borderRadius: '0.375rem',
          fontWeight: 'bold',
          fontSize: '1.125rem',
          minWidth: '80px',
          textAlign: 'center'
        }}>
          {value}%
        </div>
      </div>
      
      <div style={{ position: 'relative', marginTop: '1rem' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, ${color} 0%, ${color} ${value}%, #e2e8f0 ${value}%, #e2e8f0 100%)`,
            cursor: 'pointer'
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${color};
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: ${color};
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
        `}</style>
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#718096'
        }}>
          <span>{min}%</span>
          <span>{max}%</span>
        </div>
      </div>
    </div>
  );
};

export default PercentageSlider;
