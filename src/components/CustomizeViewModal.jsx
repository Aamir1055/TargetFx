import React, { useState, useEffect } from 'react';

const CustomizeViewModal = ({ 
  isOpen, 
  onClose, 
  onFilterClick,
  onDealsClick,
  onDateFilterClick,
  onIBFilterClick,
  onGroupsClick,
  onReset,
  onApply,
  hasPendingChanges = false
}) => {
  const [hasInteracted, setHasInteracted] = useState(false);

  // Reset interaction state when modal opens
  useEffect(() => {
    if (isOpen) {
      setHasInteracted(false);
    }
  }, [isOpen]);

  const handleOptionClick = (callback) => {
    setHasInteracted(true);
    if (callback) callback();
  };

  const handleReset = () => {
    setHasInteracted(false);
    if (onReset) onReset();
  };

  if (!isOpen) return null;

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
          maxHeight: '90vh',
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
            onClick={onClose}
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
            Customize view
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

        {/* Menu options */}
        <div style={{ flex: 1, padding: '0 20px' }}>
          {/* Filter option */}
          {onFilterClick && (
            <>
              <button
                onClick={() => handleOptionClick(onFilterClick)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    background: 'rgba(230, 238, 248, 0.44)',
                    borderRadius: '8px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M4 6h10M2 3h14M6 9h6"
                      stroke="#999999"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: '20px',
                    color: '#1B2D45',
                    textAlign: 'left',
                  }}
                >
                  Filter
                </span>
              </button>

              {/* Divider */}
              <div
                style={{
                  width: '100%',
                  height: '1px',
                  background: '#F2F2F7',
                  margin: '12px 0',
                }}
              />
            </>
          )}

          {/* Deals option */}
          {onDealsClick && (
            <>
              <button
                onClick={onDealsClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    background: 'rgba(230, 238, 248, 0.44)',
                    borderRadius: '8px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M3 6L7.5 2L12 6L16.5 2"
                      stroke="#999999"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="2"
                  y="8"
                  width="4"
                  height="8"
                  rx="1"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <rect
                  x="7"
                  y="6"
                  width="4"
                  height="10"
                  rx="1"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <rect
                  x="12"
                  y="10"
                  width="4"
                  height="6"
                  rx="1"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
                textAlign: 'left',
              }}
            >
              Deals
            </span>
          </button>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              background: '#F2F2F7',
              margin: '12px 0',
            }}
          />
            </>
          )}

          {/* Date Filter option */}
          {onDateFilterClick && (
            <>
              <button
                onClick={() => handleOptionClick(onDateFilterClick)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    background: 'rgba(230, 238, 248, 0.44)',
                    borderRadius: '8px',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect x="3" y="4" width="12" height="11" rx="2" stroke="#999999" strokeWidth="1.5" />
                    <path d="M3 7h12M6 2v3M12 2v3" stroke="#999999" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <span
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 400,
                    fontSize: '16px',
                    lineHeight: '20px',
                    color: '#1B2D45',
                    textAlign: 'left',
                  }}
                >
                  Date Filter
                </span>
              </button>

              {/* Divider */}
              <div
                style={{
                  width: '100%',
                  height: '1px',
                  background: '#F2F2F7',
                  margin: '12px 0',
                }}
              />
            </>
          )}

          {/* IB Filter option */}
          {onIBFilterClick && (
            <>
              <button
                onClick={() => handleOptionClick(onIBFilterClick)}
                style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'rgba(230, 238, 248, 0.44)',
                borderRadius: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 9.75C11.0711 9.75 12.75 8.07107 12.75 6C12.75 3.92893 11.0711 2.25 9 2.25C6.92893 2.25 5.25 3.92893 5.25 6C5.25 8.07107 6.92893 9.75 9 9.75Z"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <path
                  d="M3 15.75C3 12.8505 5.68629 10.5 9 10.5C12.3137 10.5 15 12.8505 15 15.75"
                  stroke="#999999"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
                textAlign: 'left',
              }}
            >
              IB Filter
            </span>
          </button>

          {/* Divider */}
          <div
            style={{
              width: '100%',
              height: '1px',
              background: '#F2F2F7',
              margin: '12px 0',
            }}
          />
            </>
          )}

          {/* Groups option */}
          {onGroupsClick && (
            <>
              <button
                onClick={() => handleOptionClick(onGroupsClick)}
                style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '10px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'rgba(230, 238, 248, 0.44)',
                borderRadius: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M6 7.5C7.65685 7.5 9 6.15685 9 4.5C9 2.84315 7.65685 1.5 6 1.5C4.34315 1.5 3 2.84315 3 4.5C3 6.15685 4.34315 7.5 6 7.5Z"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 7.5C13.6569 7.5 15 6.15685 15 4.5C15 2.84315 13.6569 1.5 12 1.5C10.3431 1.5 9 2.84315 9 4.5C9 6.15685 10.3431 7.5 12 7.5Z"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <path
                  d="M6 16.5C7.65685 16.5 9 15.1569 9 13.5C9 11.8431 7.65685 10.5 6 10.5C4.34315 10.5 3 11.8431 3 13.5C3 15.1569 4.34315 16.5 6 16.5Z"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
                <path
                  d="M12 16.5C13.6569 16.5 15 15.1569 15 13.5C15 11.8431 13.6569 10.5 12 10.5C10.3431 10.5 9 11.8431 9 13.5C9 15.1569 10.3431 16.5 12 16.5Z"
                  stroke="#999999"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <span
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '20px',
                color: '#1B2D45',
                textAlign: 'left',
              }}
            >
              Groups
            </span>
          </button>
            </>
          )}
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

        {/* Action buttons: match exactly with Filter modal */}
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
            onClick={onApply}
            disabled={!hasInteracted && !hasPendingChanges}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 27px',
              background: (hasInteracted || hasPendingChanges) ? '#2563EB' : '#E5E7EB',
              border: '1px solid ' + ((hasInteracted || hasPendingChanges) ? '#2563EB' : '#D1D5DB'),
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: (hasInteracted || hasPendingChanges) ? 'pointer' : 'not-allowed',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: (hasInteracted || hasPendingChanges) ? '#FFFFFF' : '#6B7280',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
};

export default CustomizeViewModal;
