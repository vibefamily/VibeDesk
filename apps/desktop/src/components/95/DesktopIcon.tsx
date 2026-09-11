/**
 * DesktopIcon - a classic desktop shortcut (React95 style).
 *
 * Double-click (or single click) opens the associated window.
 */

import React from 'react'

interface DesktopIconProps {
  icon: string
  label: string
  hint?: string
  onClick: () => void
}

const DesktopIcon: React.FC<DesktopIconProps> = ({ icon, label, hint, onClick }) => {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onClick}
      style={{
        width: 92,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 4px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={hint}
    >
      <div
        style={{
          fontSize: 44,
          marginBottom: 4,
          filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.45))',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          color: '#fff',
          fontSize: 11,
          textAlign: 'center',
          textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
          fontFamily: 'MS Sans Serif, Arial, sans-serif',
          wordBreak: 'break-word',
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default DesktopIcon
