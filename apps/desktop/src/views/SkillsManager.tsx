/**
 * SkillsManager - global skills catalog (start menu -> Agent -> Skills).
 *
 * Lists every skill the runtime knows about and shows which agents have
 * it enabled. Installing third-party skills from the marketplace is the
 * next step; for now the entry point exists with a disabled placeholder.
 */

import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../stores/agentStore'

interface SkillInfo {
  id: string
  name: string
  description: string
  icon: string
}

const SkillsManager: React.FC = () => {
  const agents = useAgentStore((s) => s.agents)
  const [catalog, setCatalog] = useState<SkillInfo[]>([])

  useEffect(() => {
    window.vibeAPI.agent
      .listSkills()
      .then(setCatalog)
      .catch(() => setCatalog([]))
  }, [])

  const row: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 6px',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    background: '#c0c0c0',
    fontSize: 11,
    color: '#000',
    marginBottom: 4,
  }

  return (
    <div style={{ padding: 8, fontFamily: 'inherit' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 6 }}>
        Skills
      </div>
      <div style={{ fontSize: 10, color: '#333', marginBottom: 8 }}>
        Skills add capabilities to agents. Enable them per agent in the agent&apos;s Skills
        settings (e.g. Trade Agent &gt; Skills). Installing third-party skills comes next.
      </div>
      {catalog.map((s) => {
        const usedBy = agents
          .filter((a) => (a.skills ?? []).includes(s.id))
          .map((a) => a.name)
        return (
          <div key={s.id} style={row}>
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: '#444' }}>{s.description}</div>
            </div>
            <div style={{ fontSize: 10, color: usedBy.length ? '#060' : '#666', whiteSpace: 'nowrap' }}>
              {usedBy.length ? `used by ${usedBy.join(', ')}` : 'not enabled'}
            </div>
          </div>
        )
      })}
      <div style={row}>
        <span style={{ fontSize: 14 }}>➕</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>Install skill</div>
          <div style={{ fontSize: 10, color: '#444' }}>
            Plugin marketplace - bring your own data source, strategy or tool as a skill.
          </div>
        </div>
        <button
          style={{
            padding: '3px 10px',
            fontSize: 11,
            background: '#c0c0c0',
            border: '2px outset',
            borderColor: '#fff #808080 #808080 #fff',
            color: '#808080',
            fontFamily: 'inherit',
            cursor: 'not-allowed',
          }}
          disabled
          title="Coming soon"
        >
          Install
        </button>
      </div>
    </div>
  )
}

export default SkillsManager
