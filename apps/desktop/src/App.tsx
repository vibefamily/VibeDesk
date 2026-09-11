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
import Desktop from './components/95/Desktop'

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
  return (
    <ThemeProvider theme={original}>
      <GlobalStyles />
      <Desktop />
    </ThemeProvider>
  )
}

export default App
