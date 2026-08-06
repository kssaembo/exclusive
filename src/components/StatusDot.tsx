import type { ConnectionLevel } from '../types'

export function StatusDot({ status }: { status: ConnectionLevel }) {
  const label = status === 'connected' ? '연결됨' : status === 'connecting' ? '연결 중' : '끊김'
  return <span className={`status-pill ${status}`}><i />{label}</span>
}
