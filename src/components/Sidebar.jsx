import { useState } from 'react'
import logo from '../assets/logo/icons8-security-shield-64.png'

function Sidebar({ menuItems, activeView, onViewChange, collapsed, onToggleCollapse }) {
  const [expandedItems, setExpandedItems] = useState(new Set())

  const toggleExpanded = (itemId) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId)
    } else {
      newExpanded.add(itemId)
    }
    setExpandedItems(newExpanded)
  }

  return (
    <div className={`fixed left-0 top-0 h-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-r border-slate-200/60 dark:border-slate-700/60 shadow-xl transition-all duration-300 z-30 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Logo/Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        {!collapsed && (
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img src={logo} alt="Cyberix" className="w-10 h-10 rounded-lg shadow-sm" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
                Cyberix
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Security Suite</p>
            </div>
          </div>
        )}
        
        <button
          onClick={onToggleCollapse}
          className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-700/60 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:shadow-md transition-all duration-200 group border border-slate-200/60 dark:border-slate-600/60"
        >
          <svg 
            className={`w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200 ${collapsed ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="px-3 py-6 space-y-2">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              {item.subItems ? (
                // Expandable menu item with sub-items
                <div>
                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className={`w-full flex items-center px-3 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative ${
                      expandedItems.has(item.id)
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-gradient-to-r hover:from-orange-50 hover:to-orange-100 dark:hover:from-orange-900/20 dark:hover:to-orange-800/20 hover:text-orange-700 dark:hover:text-orange-400 hover:shadow-md'
                    }`}
                    title={collapsed ? item.name : ''}
                  >
                    {/* Active indicator */}
                    {expandedItems.has(item.id) && (
                      <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-white/80 rounded-r-full"></div>
                    )}
                    
                    <div className={`flex items-center justify-center transition-all duration-300 ${
                      expandedItems.has(item.id) ? 'text-white scale-110' : 'text-slate-500 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400'
                    }`}>
                      {item.icon}
                    </div>
                    
                    {!collapsed && (
                      <>
                        <span className="ml-3 truncate font-medium">{item.name}</span>
                        <div className="ml-auto">
                          <svg 
                            className={`w-4 h-4 transition-all duration-300 ${
                              expandedItems.has(item.id) ? 'rotate-90 text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-orange-500 dark:group-hover:text-orange-400'
                            }`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </>
                    )}
                  </button>
                  
                  {/* Sub-items */}
                  {!collapsed && expandedItems.has(item.id) && (
                    <div className="mt-2 ml-4 space-y-1 animate-in slide-in-from-top-2 duration-300">
                      {item.subItems.map((subItem) => (
                        <button
                          key={subItem.id}
                          onClick={() => onViewChange(subItem.id)}
                          className={`w-full flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 group relative ${
                            activeView === subItem.id
                              ? 'bg-gradient-to-r from-orange-100 to-orange-50 dark:from-orange-900/30 dark:to-orange-800/30 text-orange-700 dark:text-orange-400 border-l-2 border-orange-500 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60 hover:text-orange-600 dark:hover:text-orange-400 hover:shadow-sm'
                          }`}
                        >
                          <div className={`flex items-center justify-center transition-all duration-300 ${
                            activeView === subItem.id ? 'text-orange-600 dark:text-orange-400 scale-105' : 'text-slate-400 dark:text-slate-500 group-hover:text-orange-500 dark:group-hover:text-orange-400'
                          }`}>
                            {subItem.icon}
                          </div>
                          <span className="ml-3 truncate">{subItem.name}</span>
                          {activeView === subItem.id && (
                            <div className="ml-auto">
                              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                // Regular menu item
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`w-full flex items-center px-3 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative ${
                    activeView === item.id
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-gradient-to-r hover:from-orange-50 hover:to-orange-100 dark:hover:from-orange-900/20 dark:hover:to-orange-800/20 hover:text-orange-700 dark:hover:text-orange-400 hover:shadow-md'
                  }`}
                  title={collapsed ? item.name : ''}
                >
                  {/* Active indicator */}
                  {activeView === item.id && (
                    <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-white/80 rounded-r-full"></div>
                  )}
                  
                  <div className={`flex items-center justify-center transition-all duration-300 ${
                    activeView === item.id ? 'text-white scale-110' : 'text-slate-500 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400'
                  }`}>
                    {item.icon}
                  </div>
                  
                  {!collapsed && (
                    <span className="ml-3 truncate font-medium">{item.name}</span>
                  )}
                  
                  {!collapsed && activeView === item.id && (
                    <div className="ml-auto">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        {!collapsed ? (
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-sm font-bold">A</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white shadow-sm"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">Admin User</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-medium">administrator@cybersec.com</p>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Online</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-sm font-bold">A</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white shadow-sm"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Sidebar