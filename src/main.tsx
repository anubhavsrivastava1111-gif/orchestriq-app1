import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import Auth from './Auth'
import ProfileSetup from './ProfileSetup'
import { supabase } from './lib/supabase'

type Screen = 'loading' | 'auth' | 'profile' | 'app'

function Root() {
  const [screen, setScreen] = useState<Screen>('loading')

  const checkProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setScreen('auth'); return }

    const { data } = await supabase
      .from('users')
      .select('phone')
      .eq('id', user.id)
      .single()

    if (data?.phone) {
      setScreen('app')
    } else {
      setScreen('profile')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setScreen('auth')
      } else {
        checkProfile()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setScreen('auth')
    })

    return () => subscription.unsubscribe()
  }, [])

  if (screen === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#14B8A6', fontSize: 14, fontFamily: 'Manrope, sans-serif' }}>Loading…</div>
      </div>
    )
  }

  if (screen === 'auth') {
    return <Auth onAuth={() => checkProfile()} />
  }

  if (screen === 'profile') {
    return <ProfileSetup onComplete={() => setScreen('app')} />
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
