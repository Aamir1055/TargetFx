import React, { useState } from 'react';

const ShowHideColumnsModal = ({ 
  isOpen, 
  onClose, 
  columns = [],
  visibleColumns = [],
  onApply
}) => {
  const [selectedColumns, setSelectedColumns] = useState(visibleColumns);
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const handleToggleColumn = (columnId) => {
    setSelectedColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        return [...prev, columnId];
      }
    });
  };

  const handleApply = () => {
    onApply(selectedColumns);
    onClose();
  };

  const handleReset = () => {
    setSelectedColumns([]);
  };

  const filteredColumns = columns.filter(col =>
    col.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          maxHeight: '80vh',
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
            Show/Hide Columns
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

        {/* Search bar */}
        <div style={{ padding: '0 20px', marginBottom: '20px' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
            }}
          >
            <input
              type="text"
              placeholder="Search Columns"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 45px',
                background: '#FFFFFF',
                border: '1px solid #E6EEF8',
                borderRadius: '12px',
                fontFamily: 'Outfit, sans-serif',
                fontSize: '14px',
                color: '#1B2D45',
                outline: 'none',
              }}
            />
            <svg
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
            >
              <circle cx="8" cy="8" r="6.5" stroke="#999999" strokeWidth="1.5"/>
              <path d="M13 13L16 16" stroke="#999999" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>

        {/* Columns list */}
        <div 
          style={{ 
            flex: 1, 
            padding: '0 20px', 
            overflowY: 'auto',
            marginBottom: '20px',
            maxHeight: '400px'
          }}
        >
          {filteredColumns.map((column) => (
            <label
              key={column.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 0',
                cursor: 'pointer',
                borderBottom: '1px solid #F2F2F7',
              }}
            >
              <input
                type="checkbox"
                checked={selectedColumns.includes(column.id)}
                onChange={() => handleToggleColumn(column.id)}
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
                  color: '#000000',
                }}
              >
                {column.label}
              </span>
            </label>
          ))}
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
              background: '#F4F8FC',
              border: '1px solid #F2F2F7',
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: '#2563EB',
            }}
          >
            Reset
          </button>

          {/* Apply button */}
          <button
            onClick={handleApply}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px 27px',
              background: '#FFFFFF',
              border: '1px solid #F2F2F7',
              borderRadius: '20px',
              boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '20px',
              letterSpacing: '0.06em',
              textTransform: 'capitalize',
              color: '#4B4B4B',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
};

export default ShowHideColumnsModal;
