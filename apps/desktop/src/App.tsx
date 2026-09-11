/**
 * Vibe Desktop - main App component (React95 shell).
 *
 * Renders a Windows 95 style desktop: teal wallpaper, the four core
 * module icons (Trade / AI Agents / Wallet / Data), draggable windows
 * and a taskbar. All product logic lives in the view components and
 * stores - this shell only frames them.
 */

import React from 'react'
import { ThemeProvider } from 'styled-components'
import original from 'react95/dist/themes/original'
import { styleReset } from 'react95'
import { createGlobalStyle } from 'styled-components'
import { useEffect } from 'react'
import Desktop from './components/95/Desktop'
import { useWindowStore } from './components/95/windowStore'

const GlobalStyles = createGlobalStyle`
  ${styleReset}

  * {
    box-sizing: border-box;
  }

  html, body, #root {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  body {
    font-family: 'MS Sans Serif', 'Segoe UI', Arial, sans-serif;
  }
`

const App: React.FC = () => {
  // The Chat Center is the default home screen: it opens on startup so the
  // user can start a conversation immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      useWindowStore.getState().openWindow('chat-center', 'Chat Center', '💬')
    }, 120)
    return () => clearTimeout(t)
  }, [])

  return (
    <ThemeProvider theme={original}>
      <GlobalStyles />
      <Desktop />
    </ThemeProvider>
  )
}

export default App
