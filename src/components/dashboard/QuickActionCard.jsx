import { memo } from 'react'
import { useNavigate } from 'react-router-dom'

const QuickActionCard = memo(({ 
  title, 
  description, 
  icon, 
  gradient = 'from-blue-500 to-blue-600',
  onClick,
  path
}) => {
  const navigate = useNavigate()

  const handleClick = () => {
    if (onClick) onClick()
    if (path) navigate(path)
  }

  return (
    <button
      onClick={handleClick}
      className="group p-3 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all duration-200 text-left w-full hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform duration-200`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 mb-0.5 truncate">{title}</p>
          <p className="text-xs text-gray-500 truncate">{description}</p>
        </div>
      </div>
    </button>
  )
})

QuickActionCard.displayName = 'QuickActionCard'

export default QuickActionCard
