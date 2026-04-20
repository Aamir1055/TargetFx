import { useState } from 'react'

const QRCodeSetup = ({ 
  setupData, 
  verificationCode, 
  setVerificationCode, 
  onEnable, 
  onCancel, 
  loading 
}) => {
  const [showManualEntry, setShowManualEntry] = useState(false)

  const handleCodeChange = (e) => {
    // Only allow numbers and remove any non-numeric characters
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 6) {
      setVerificationCode(value)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!')
    })
  }

  if (!setupData) {
    return (
      <div className="text-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 text-sm mt-3">Loading 2FA setup...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-blue-900 text-sm mb-2">Setup Instructions</h3>
            <ol className="list-decimal list-inside space-y-1 text-xs text-blue-800">
              <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
              <li>Scan the QR code with your authenticator app</li>
              <li>Enter the 6-digit code to complete setup</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* QR Code Section */}
        <div className="text-center bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 text-sm mb-3 flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan QR Code
          </h3>
          
          {setupData.qr_code_uri ? (
            <div className="bg-white p-3 rounded-lg inline-block border border-blue-100">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setupData.qr_code_uri)}`}
                alt="2FA QR Code" 
                className="w-40 h-40 mx-auto"
              />
            </div>
          ) : (
            <div className="bg-gray-100 p-4 rounded-lg w-40 h-40 mx-auto flex items-center justify-center">
              <p className="text-gray-500 text-xs">QR Code not available</p>
            </div>
          )}

          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="mt-3 text-xs text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showManualEntry ? "M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" : "M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"} />
            </svg>
            {showManualEntry ? 'Hide' : 'Show'} manual code
          </button>

          {showManualEntry && setupData.secret && (
            <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs text-blue-700 mb-1.5 font-medium">Manual Entry:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={setupData.secret}
                  readOnly
                  className="flex-1 text-xs font-mono bg-white px-2 py-1.5 rounded border border-blue-200 select-all break-all text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => copyToClipboard(setupData.secret)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Verification Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 text-sm mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Verification Code
          </h3>
          
          <div className="space-y-3">
            <div>
              <label htmlFor="verification-code" className="block text-xs font-medium text-gray-700 mb-1.5">
                Enter 6-digit code from your app
              </label>
              <input
                id="verification-code"
                type="text"
                value={verificationCode}
                onChange={handleCodeChange}
                placeholder="000000"
                maxLength="6"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg font-mono bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={onEnable}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-all font-medium text-sm shadow-sm hover:shadow inline-flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enabling...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Enable 2FA
                  </>
                )}
              </button>
              
              <button
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>

            <div className="mt-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-xs text-yellow-800">
                  You'll receive backup codes after enabling 2FA. Store them securely!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QRCodeSetup