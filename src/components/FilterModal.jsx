import React, { useState, useEffect } from 'react';

const FilterModal = ({ 
  isOpen, 
  onClose, 
  onApply,
  filters = {},
  onPendingChange
}) => {
  const [hasFloating, setHasFloating] = useState(filters.hasFloating || false);
  const [hasCredit, setHasCredit] = useState(filters.hasCredit || false);
  const [noDeposit, setNoDeposit] = useState(filters.noDeposit || false);

  // Sync state with filters prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setHasFloating(filters.hasFloating || false);
      setHasCredit(filters.hasCredit || false);
      setNoDeposit(filters.noDeposit || false);
    }
  }, [isOpen, filters]);

  // Notify parent when there are pending changes
  useEffect(() => {
    if (isOpen && onPendingChange) {
      const hasPending = hasFloating !== (filters.hasFloating || false) || 
                        hasCredit !== (filters.hasCredit || false) || 
                        noDeposit !== (filters.noDeposit || false);
      const draft = { hasFloating, hasCredit, noDeposit }
      try {
        onPendingChange(hasPending, draft)
      } catch {
        // backward compatibility if consumer only expects boolean
        onPendingChange(hasPending)
      }
    }
  }, [isOpen, hasFloating, hasCredit, noDeposit, filters, onPendingChange]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({
      hasFloating,
      hasCredit,
      noDeposit
    });
    onClose();
  };

  const handleReset = () => {
    setHasFloating(false);
    setHasCredit(false);
    setNoDeposit(false);
    onApply({
      hasFloating: false,
      hasCredit: false,
      noDeposit: false
    });
    onClose();
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '412px',
          height: 'auto',
          background: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top indicator line */}
        <div
          style={{
            width: '47px',
            height: '2px',
            background: 'rgba(71, 84, 103, 0.55)',
            borderRadius: '2px',
            margin: '10px auto',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            marginBottom: '10px',
          }}
        >
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                const ev = new CustomEvent('openCustomizeView')
                window.dispatchEvent(ev)
              }
              onClose()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
            }}
          >
            <svg
              width="8"
              height="14"
              viewBox="0 0 8 14"
              fill="none"
              style={{ transform: 'rotate(180deg)' }}
            >
              <path
                d="M1 1L7 7L1 13"
                stroke="#4B4B4B"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <h2
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: '18px',
              lineHeight: '24px',
              color: '#4B4B4B',
              letterSpacing: '-0.0041em',
              margin: 0,
            }}
          >
            Filter
          </h2>

          <div style={{ width: '18px' }} /> {/* Spacer for centering */}
        </div>

        {/* Divider line */}
        <div
          style={{
            width: '100%',
            height: '1px',
            background: '#F2F2F7',
            marginBottom: '20px',
          }}
        />

        {/* Filter options */}
        <div style={{ flex: 1, padding: '0 20px', marginBottom: '20px' }}>
          {/* Has Floating */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={hasFloating}
              onChange={(e) => setHasFloating(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                accentColor: '#2563EB',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
              }}
            >
              Has Floating
            </span>
          </label>

          {/* Has Credit */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={hasCredit}
              onChange={(e) => setHasCredit(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                accentColor: '#2563EB',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
              }}
            >
              Has Credit
            </span>
          </label>

          {/* No Deposit */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 0',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={noDeposit}
              onChange={(e) => setNoDeposit(e.target.checked)}
              style={{
                width: '20px',
                height: '20px',
                accentColor: '#2563EB',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
              }}
            >
              No Deposit
            </span>
          </label>
        </div>

        {/* Bottom divider */}
        <div
          style={{
            width: '100%',
            height: '1px',
            background: '#F2F2F7',
            margin: '20px 0',
          }}
        />

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            padding: '0 20px 20px',
          }}
        >
          {/* Reset button */}
          <button
            onClick={handleReset}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 16px',
              background: '#E5E7EB',
              border: '1px solid #D1D5DB',
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: '#6B7280',
            }}
          >
            Reset
          </button>

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={!hasFloating && !hasCredit && !noDeposit}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 27px',
              background: (hasFloating || hasCredit || noDeposit) ? '#2563EB' : '#E5E7EB',
              border: '1px solid ' + ((hasFloating || hasCredit || noDeposit) ? '#2563EB' : '#D1D5DB'),
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: (hasFloating || hasCredit || noDeposit) ? 'pointer' : 'not-allowed',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: (hasFloating || hasCredit || noDeposit) ? '#FFFFFF' : '#6B7280',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
};

export default FilterModal;
