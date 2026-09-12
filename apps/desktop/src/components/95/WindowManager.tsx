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

const WINDOW_COMPONENTS: Record<string, React.FC> = {
  'data-center': DataCenter,
  'stock-tokens': StockTokens,
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

/** Resolve the component for a window key. Chat windows are dynamic:
 *  a component key of `chat:<agentId>` renders that session's window. */
function resolveComponent(component: string): React.FC | null {
  if (component.startsWith('chat:')) {
    const agentId = component.slice('chat:'.length)
    return () => <ChatWindow agentId={agentId} />
  }
  return WINDOW_COMPONENTS[component] ?? null
}

const WindowManager: React.FC = () => {
  const windows = useWindowStore((s) => s.windows)

  return (
    <>
      {windows.map((win) => {
        if (win.isMinimized) return null
        const Content = resolveComponent(win.component)
        if (!Content) return null
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
            <Content />
          </CustomWindow>
        )
      })}
    </>
  )
}

export default WindowManager
