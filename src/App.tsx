import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { HostPage } from './pages/HostPage'
import { StationPage } from './pages/StationPage'

function Home() {
  return <main className="station-entry"><div className="entry-card"><p className="eyebrow">권장 검증판</p><h1>독점게임 WebRTC</h1><p>사용할 화면을 선택하세요.</p><div className="home-actions"><Link to="/host">교사 호스트 열기</Link><Link to="/station" className="secondary-link">거래소 태블릿 열기</Link></div></div></main>
}

export default function App() {
  return <Routes><Route path="/" element={<Home />} /><Route path="/host" element={<HostPage />} /><Route path="/station" element={<StationPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}
