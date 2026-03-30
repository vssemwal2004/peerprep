/**
 * Skeleton Loading Components
 * 
 * These replace the generic spinner with layout-aware skeletons that match
 * the actual page structure. Users see the page "streaming in" progressively
 * instead of a blank white/spinner screen.
 * 
 * This dramatically reduces perceived loading time because the brain
 * processes layout shapes as "content is coming" rather than "nothing is happening."
 */

// Base shimmer animation block
function Shimmer({ className = '' }) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
  );
}

// Skeleton for navbar area
export function NavbarSkeleton() {
  return (
    <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Shimmer className="w-8 h-8 rounded-full" />
        <Shimmer className="w-24 h-4" />
      </div>
      <div className="hidden md:flex items-center gap-4">
        <Shimmer className="w-20 h-4" />
        <Shimmer className="w-20 h-4" />
        <Shimmer className="w-20 h-4" />
        <Shimmer className="w-8 h-8 rounded-full" />
      </div>
    </div>
  );
}

// Full page skeleton with layout structure
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8 mt-16">
        {/* Page title skeleton */}
        <Shimmer className="w-64 h-8 mb-2" />
        <Shimmer className="w-96 h-4 mb-8" />
        
        {/* Stats cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <Shimmer className="w-12 h-12 rounded-lg" />
                <div className="flex-1">
                  <Shimmer className="w-24 h-3 mb-2" />
                  <Shimmer className="w-16 h-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Content area skeleton */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <Shimmer className="w-48 h-6 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Shimmer className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Shimmer className="w-3/4 h-4 mb-2" />
                  <Shimmer className="w-1/2 h-3" />
                </div>
                <Shimmer className="w-20 h-8 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Dashboard-specific skeleton (cards grid)
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto mt-16">
        <Shimmer className="w-56 h-8 mb-2" />
        <Shimmer className="w-80 h-4 mb-8" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <Shimmer className="w-12 h-12 rounded-lg" />
                <div className="flex-1">
                  <Shimmer className="w-32 h-4 mb-2" />
                  <Shimmer className="w-24 h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Table/list skeleton for directory pages
export function TableSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-8 px-4">
      <div className="max-w-7xl mx-auto mt-16">
        <div className="flex justify-between items-center mb-6">
          <Shimmer className="w-48 h-8" />
          <Shimmer className="w-64 h-10 rounded-lg" />
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex gap-4">
            <Shimmer className="w-1/4 h-4" />
            <Shimmer className="w-1/4 h-4" />
            <Shimmer className="w-1/4 h-4" />
            <Shimmer className="w-1/4 h-4" />
          </div>
          {/* Table rows */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-4">
              <Shimmer className="w-8 h-8 rounded-full" />
              <Shimmer className="w-1/4 h-4" />
              <Shimmer className="w-1/4 h-3" />
              <Shimmer className="w-1/6 h-3" />
              <Shimmer className="w-16 h-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact inline loader (replaces the generic spinner in protected routes)
export function InlineLoader({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 w-full">
      <div className="text-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-3 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <div className="absolute inset-0 rounded-full h-12 w-12 border-t-3 border-purple-400 dark:border-purple-500 mx-auto animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-gray-400 font-medium">{message}</p>
      </div>
    </div>
  );
}

// Event/form page skeleton 
export function FormSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto mt-16">
        <Shimmer className="w-48 h-8 mb-6" />
        
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i}>
              <Shimmer className="w-24 h-4 mb-2" />
              <Shimmer className="w-full h-10 rounded-lg" />
            </div>
          ))}
          <Shimmer className="w-32 h-10 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;
