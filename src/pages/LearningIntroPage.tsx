import { useNavigate } from 'react-router-dom'
import { LearningIntro } from '../components/LearningIntro'

export function LearningIntroPage() {
  const navigate = useNavigate()
  return <LearningIntro onComplete={() => navigate('/setup')} />
}
