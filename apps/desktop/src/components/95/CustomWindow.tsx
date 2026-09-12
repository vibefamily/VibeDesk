/**
 * CustomWindow - a draggable, minimizable React95 window.
 *
 * Renders the classic beveled frame + gradient title bar with
 * minimize / maximize / close controls. Draggable via the title bar.
 */

import React, { useEffect, useRef, useState } from 'react'
import Draggable from 'react-draggable'
import type { ReactNode } from 'react'
import { useWindowStore } from './windowStore'
import { useUiStore } from '../../stores/uiStore'

interface CustomWindowProps {
  windowId: string
  title: string
  icon: string
  width: number
  height: number
  x: number
  y: number
  zIndex: number
  isMaximized: boolean
  children: ReactNode
}

const TASKBAR_HEIGHT = 40

const CustomWindow: React.FC<CustomWindowProps> = ({
  windowId,
  title,
  icon,
  width,
  height,
  x,
  y,
  zIndex,
  isMaximized,
  children,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const { removeWindow, minimizeWindow, toggleMaximize, focusWindow, updateWindowPosition, updateWindowSize } =
    useWindowStore()
  // The desktop applies a CSS `zoom` for the Interface Size setting; all
  // pointer deltas must be divided by it or dragging/resizing feel dead.
  const zoom = useUiStore((s) => s.zoom)

  // Resize drag state (bottom-right corner handle).
  const [resize, setResize] = useState<{
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const MIN_W = 420
  const MIN_H = 300

  useEffect(() => {
    if (!resize) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(MIN_W, resize.startW + (e.clientX - resize.startX) / zoom)
      const h = Math.max(MIN_H, resize.startH + (e.clientY - resize.startY) / zoom)
      updateWindowSize(windowId, w, h)
    }
    const onUp = () => setResize(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resize, windowId, updateWindowSize, zoom])

  const frame: React.CSSProperties = {
    background: '#c0c0c0',
    border: '2px outset #fff',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '3px 3px 6px rgba(0,0,0,0.35)',
  }

  const titleBar: React.CSSProperties = {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    padding: '2px 3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'move',
    userSelect: 'none',
    flexShrink: 0,
  }

  const titleBtn: React.CSSProperties = {
    width: 16,
    height: 14,
    padding: 0,
    border: '1px outset',
    borderColor: '#fff #000 #000 #fff',
    background: '#c0c0c0',
    cursor: 'pointer',
    fontSize: 9,
    fontWeight: 700,
    lineHeight: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const body = (
    <div style={frame}>
      <div className="win95-title-bar" style={titleBar} onDoubleClick={() => toggleMaximize(windowId)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span
            style={{
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'MS Sans Serif, Arial, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button style={titleBtn} onClick={() => minimizeWindow(windowId)} title="Minimize">
            _
          </button>
          <button
            style={titleBtn}
            onClick={() => toggleMaximize(windowId)}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? '❐' : '□'}
          </button>
          <button
            style={{ ...titleBtn, fontWeight: 700 }}
            onClick={() => removeWindow(windowId)}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#fff',
        }}
      >
        {children}
      </div>
      {/* Resize handle (bottom-right corner) */}
      <div
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setResize({ startX: e.clientX, startY: e.clientY, startW: width, startH: height })
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 0 55%, #808080 55% 70%, transparent 70%)',
          zIndex: 5,
        }}
      />
    </div>
  )

  if (isMaximized) {
    return (
      <div
        onMouseDownCapture={() => focusWindow(windowId)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: `calc(100vh - ${TASKBAR_HEIGHT}px)`,
          // Render-time baseline: even windows opened before a zIndex
          // migration keep stacking above the desktop drag strip.
          zIndex: 100 + zIndex,
        }}
      >
        {body}
      </div>
    )
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".win95-title-bar"
      position={{ x, y }}
      scale={zoom}
      onStop={(_e, data) => updateWindowPosition(windowId, data.x, data.y)}
      bounds="parent"
    >
      <div
        ref={nodeRef}
        onMouseDownCapture={() => focusWindow(windowId)}
        style={{
          position: 'absolute',
          width: `${width}px`,
          height: `${height}px`,
          zIndex: 100 + zIndex,
          maxWidth: '100%',
        }}
      >
        {body}
      </div>
    </Draggable>
  )
}

export default CustomWindow
