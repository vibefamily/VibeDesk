/**
 * WindowManager - renders all open desktop windows.
 *
 * Maps a window's component key to the actual view component. Views
 * keep their own stores/IPC wiring; the window is just a frame.
 */

import React from 'react'
import { useWindowStore } from './windowStore'
import CustomWindow from './CustomWindow'
import StockTokens from '../../views/StockTokens'
import Agents from '../../views/Agents'
import Wallets from '../../views/Wallets'
import DataSources from '../../views/DataSources'
import Settings from '../../views/Settings'
import ChatCenter from '../../views/ChatCenter'
import ChatWindow from '../../views/ChatWindow'
import InfoCenter from '../../views/InfoCenter'
import Dashboard from '../../views/Dashboard'
import Strategies from '../../views/Strategies'
import Portfolio from '../../views/Portfolio'
import DataCenter from '../../views/DataCenter'
import TradeRun from '../../views/TradeRun'
import SkillsManager from '../../views/SkillsManager'

const WINDOW_COMPONENTS: Record<string, React.FC> = {
  'data-center': DataCenter,
  'stock-tokens': StockTokens,
  'trade-run': TradeRun,
  skills: SkillsManager,
  agents: Agents,
  'chat-center': ChatCenter,
  wallets: Wallets,
  data: DataSources,
  settings: Settings,
  info: InfoCenter,
  dashboard: Dashboard,
  strategies: Strategies,
  portfolio: Portfolio,
}

/**
 * Render the content for a window key as a stable React element.
 * IMPORTANT: never wrap this in a fresh function component — a new
 * anonymous component type on every render makes React unmount/remount
 * the view on any store update (e.g. the z-order bump from
 * focusWindow on mousedown), which steals focus from inputs and resets
 * window-local state.
 */
function renderContent(component: string): React.ReactNode {
  if (component.startsWith('chat:')) {
    return <ChatWindow agentId={component.slice('chat:'.length)} />
  }
  const Comp = WINDOW_COMPONENTS[component]
  return Comp ? <Comp /> : null
}

const WindowManager: React.FC = () => {
  const windows = useWindowStore((s) => s.windows)

  return (
    <>
      {windows.map((win) => {
        if (win.isMinimized) return null
        const content = renderContent(win.component)
        if (content === null) return null
        return (
          <CustomWindow
            key={win.id}
            windowId={win.id}
            title={win.title}
            icon={win.icon}
            width={win.width}
            height={win.height}
            x={win.x}
            y={win.y}
            zIndex={win.zIndex}
            isMaximized={win.isMaximized}
          >
            {content}
          </CustomWindow>
        )
      })}
    </>
  )
}

export default WindowManager
