import { useState } from 'react'
import logo from '../assets/webp/Cybersecurity research-02.webp'

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
    <div className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 shadow-lg transition-all duration-300 z-30 ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Logo/Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex justify-evenly w-full items-center">
            <img src={logo} alt="Cyberix" className="w-10 h-10" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cyberix</h2>
            </div>
          </div>
        )}
        
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg 
            className={`w-4 h-4 text-gray-600 transition-transform ${collapsed ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation Menu */}
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              {item.subItems ? (
                // Expandable menu item with sub-items
                <div>
                  <button
                    onClick={() => toggleExpanded(item.id)}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                      expandedItems.has(item.id)
                        ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={collapsed ? item.name : ''}
                  >
                    <div className={`flex items-center justify-center ${
                      expandedItems.has(item.id) ? 'text-blue-700' : 'text-gray-500'
                    }`}>
                      {item.icon}
                    </div>
                    
                    {!collapsed && (
                      <>
                        <span className="ml-3 truncate">{item.name}</span>
                        <div className="ml-auto">
                          <svg 
                            className={`w-4 h-4 transition-transform duration-200 ${
                              expandedItems.has(item.id) ? 'rotate-90' : ''
                            }`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </>
                    )}
                  </button>
                  
                  {/* Sub-items */}
                  {!collapsed && expandedItems.has(item.id) && (
                    <ul className="ml-6 mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <li key={subItem.id}>
                          <button
                            onClick={() => onViewChange(subItem.id)}
                            className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                              activeView === subItem.id
                                ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            <div className={`flex items-center justify-center ${
                              activeView === subItem.id ? 'text-blue-700' : 'text-gray-400'
                            }`}>
                              {subItem.icon}
                            </div>
                            <span className="ml-3 truncate">{subItem.name}</span>
                            {activeView === subItem.id && (
                              <div className="ml-auto">
                                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                // Regular menu item
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                    activeView === item.id
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  title={collapsed ? item.name : ''}
                >
                  <div className={`flex items-center justify-center ${
                    activeView === item.id ? 'text-blue-700' : 'text-gray-500'
                  }`}>
                    {item.icon}
                  </div>
                  
                  {!collapsed && (
                    <span className="ml-3 truncate">{item.name}</span>
                  )}
                  
                  {!collapsed && activeView === item.id && (
                    <div className="ml-auto">
                      <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    </div>
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        {!collapsed ? (
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">A</span>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Admin User</p>
              <p className="text-xs text-gray-500 truncate">administrator@cybersec.com</p>
            </div>
            <div className="ml-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">A</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Sidebar