import { useState } from 'react'

const BackupCodesModal = ({ backupCodes, onClose }) => {
  const [copied, setCopied] = useState(false)

  const copyAllCodes = () => {
    const codesText = backupCodes.join('\n')
    navigator.clipboard.writeText(codesText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const downloadCodes = () => {
    const codesText = backupCodes.join('\n')
    const blob = new Blob([`Broker Eyes 2FA Backup Codes\n\nGenerated: ${new Date().toLocaleString()}\n\nBackup Codes:\n${codesText}\n\nIMPORTANT:\n- Store these codes in a safe place\n- Each code can only be used once\n- Use them if you lose access to your authenticator app\n- Generate new codes if you use all of them`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'broker-eyes-2fa-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const printCodes = () => {
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Broker Eyes 2FA Backup Codes</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #1f2937; margin-bottom: 20px; }
            .date { color: #6b7280; margin-bottom: 30px; }
            .codes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 30px 0; }
            .code { 
              font-family: monospace; 
              font-size: 14px; 
              padding: 8px; 
              border: 1px solid #d1d5db; 
              background: #f9fafb;
              text-align: center;
            }
            .warning { 
              background: #fef3c7; 
              border: 1px solid #f59e0b; 
              padding: 15px; 
              margin-top: 30px;
              border-radius: 4px;
            }
            .warning h3 { color: #d97706; margin-top: 0; }
          </style>
        </head>
        <body>
          <h1>Broker Eyes 2FA Backup Codes</h1>
          <div class="date">Generated: ${new Date().toLocaleString()}</div>
          
          <div class="codes">
            ${backupCodes.map(code => `<div class="code">${code}</div>`).join('')}
          </div>
          
          <div class="warning">
            <h3>⚠️ Important Security Information</h3>
            <ul>
              <li>Store these codes in a safe and secure location</li>
              <li>Each backup code can only be used once</li>
              <li>Use these codes if you lose access to your authenticator app</li>
              <li>Generate new backup codes if you use all of them</li>
              <li>Keep this document confidential</li>
            </ul>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
    printWindow.close()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">2FA Backup Codes</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h3 className="font-medium text-yellow-800 text-sm mb-1">Save These Codes Securely</h3>
                <ul className="text-xs text-yellow-700 space-y-0.5">
                  <li>• Each code can only be used once</li>
                  <li>• Use them if you lose your authenticator device</li>
                  <li>• Store them in a safe, offline location</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Backup Codes */}
          <div className="mb-5">
            <h3 className="font-medium text-gray-900 text-sm mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Your Backup Codes
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-2.5 bg-gray-50 rounded border border-gray-200 font-mono text-xs group hover:bg-gray-100 transition-colors"
                >
                  <span className="text-gray-900 select-all">{code}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="ml-2 text-xs text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy this code"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={copyAllCodes}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-all font-medium text-sm inline-flex items-center justify-center shadow-sm hover:shadow"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Copied!' : 'Copy All'}
            </button>
            
            <button
              onClick={downloadCodes}
              className="flex-1 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg transition-all font-medium text-sm inline-flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download
            </button>
            
            <button
              onClick={printCodes}
              className="flex-1 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg transition-all font-medium text-sm inline-flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Generated: {new Date().toLocaleString()}
            </p>
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BackupCodesModal