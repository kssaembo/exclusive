import type { AppLog } from '../types'

export function LogPanel({ logs }: { logs: AppLog[] }) {
  return (
    <div className="log-panel">
      {logs.length === 0 && <p className="empty">아직 기록이 없습니다.</p>}
      {logs.map((log) => (
        <div className={`log-row ${log.level}`} key={log.id}>
          <time>{new Date(log.at).toLocaleTimeString('ko-KR', { hour12: false })}</time>
          <div><strong>{log.title}</strong>{log.detail && <small>{log.detail}</small>}</div>
        </div>
      ))}
    </div>
  )
}
