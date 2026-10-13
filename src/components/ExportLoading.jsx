import { createPortal } from 'react-dom'
import LoadingSpinner from './LoadingSpinner'

export default function ExportLoading({ progress = null }) {
  return createPortal(
    <div role="status" aria-live="polite" aria-label="Preparing CSV export" aria-busy="true">
      <LoadingSpinner message="Exporting..." subtitle="Preparing your CSV download" progress={progress} />
    </div>,
    document.body
  )
}
