import React from 'react';
import { COLORS } from '../constants.js';

export function InputField({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px',
          background: COLORS.bgTertiary,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          color: COLORS.text,
          fontSize: '13px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontWeight: '500' }}>{value || '—'}</span>
    </div>
  );
}
