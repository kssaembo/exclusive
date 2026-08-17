import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { RulesPage } from './pages/RulesPage'
import { SetupPage } from './pages/SetupPage'
import { HostPage } from './pages/HostPage'
import { StationPage } from './pages/StationPage'
import { BoardPage } from './pages/BoardPage'
import { LearningIntroPage } from './pages/LearningIntroPage'
import { audioFiles, BackgroundAudio, ButtonClickAudio } from './audio'

export default function App() {
  const { pathname } = useLocation()
  const lobbyRoute = ['/', '/intro', '/rules', '/setup'].includes(pathname)
  return <><ButtonClickAudio />{lobbyRoute && <BackgroundAudio src={audioFiles.lobby} label="BGM" />}<Routes><Route path="/" element={<HomePage />} /><Route path="/intro" element={<LearningIntroPage />} /><Route path="/rules" element={<RulesPage />} /><Route path="/setup" element={<SetupPage />} /><Route path="/host" element={<HostPage />} /><Route path="/board" element={<BoardPage />} /><Route path="/station" element={<StationPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></>
}
