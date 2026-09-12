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
import { useAgentStore } from './stores/agentStore'

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

  /* Visible focus indicator for 95-style form fields (styleReset clears
     the default outline, leaving focused inputs looking dead). */
  input:focus,
  textarea:focus,
  select:focus {
    outline: 1px dotted #000;
    outline-offset: -1px;
  }
`

const App: React.FC = () => {
  // Boot directly into the default agent's chat window so the user can
  // start a conversation immediately. On a first run (no agents yet) the
  // bootstrap creates the default General Chat first, so the user lands
  // in a working chat window right away.
  useEffect(() => {
    const t = setTimeout(async () => {
      const store = useAgentStore.getState()
      await store.refresh()
      let def = store.agents[0] ?? null
      if (!def) {
        await store.create({ templateId: 'general-chat', name: 'General Chat' })
        await store.refresh()
        def = useAgentStore.getState().agents[0] ?? null
      }
      if (def) {
        useWindowStore.getState().openChatWindow(def.id, def.name, def.icon)
      } else {
        useWindowStore.getState().openWindow('chat-center', 'Chat Center', '💬')
      }
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
