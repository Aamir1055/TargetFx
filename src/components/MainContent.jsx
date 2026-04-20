import { useState } from 'react'

const MainContent = () => {
  const [count, setCount] = useState(0)

  const features = [
    { title: 'Mobile First', description: 'Responsive design that works on all devices', icon: '📱' },
    { title: 'PWA Ready', description: 'Progressive Web App capabilities for mobile installation', icon: '⚡' },
    { title: 'Dark Mode', description: 'Beautiful dark and light theme support', icon: '🌙' },
    { title: 'Fast', description: 'Built with Vite for lightning-fast development', icon: '🚀' }
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to Your
          <span className="text-blue-600 dark:text-blue-400"> Responsive App</span>
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
          A modern React application that works seamlessly on mobile phones, tablets, and desktop computers.
        </p>
        
        {/* Interactive Counter */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 inline-block mb-8">
          <button
            onClick={() => setCount(count + 1)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            Click me! Count: {count}
          </button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {features.map((feature, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="text-4xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {feature.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {feature.description}
            </p>
          </div>
        ))}
      </div>

      {/* Responsive Content Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Responsive Design Features
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Mobile Optimized
            </h3>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li>• Touch-friendly interface</li>
              <li>• Optimized for small screens</li>
              <li>• Fast loading on mobile networks</li>
              <li>• Swipe gestures support</li>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Desktop Enhanced
            </h3>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              <li>• Full sidebar navigation</li>
              <li>• Keyboard shortcuts</li>
              <li>• Multi-column layouts</li>
              <li>• Hover interactions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainContent