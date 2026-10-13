import { useSyncExternalStore } from 'react'
import { getExportLoading, subscribeExportLoading } from '../utils/exportLoading'
import ExportLoading from './ExportLoading'

export default function GlobalExportLoading() {
  const active = useSyncExternalStore(subscribeExportLoading, getExportLoading)
  return active ? <ExportLoading /> : null
}
