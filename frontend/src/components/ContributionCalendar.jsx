import React, { useMemo, useRef, useEffect } from 'react';

// Helper to generate rolling 365 days from today backwards
function getRolling365Days() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);
  
  const monthsMap = new Map();
  const currentDate = new Date(startDate);
  
  while (currentDate <= today) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const key = `${year}-${month}`;
    
    if (!monthsMap.has(key)) {
      monthsMap.set(key, {
        year,
        month,
        days: []
      });
    }
    
    monthsMap.get(key).days.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Convert map to array and fill weeks
  const months = Array.from(monthsMap.values());
  
  // Add padding to first month to align with week grid
  if (months.length > 0) {
    const firstDay = months[0].days[0];
    const startDayOfWeek = firstDay.getDay();
    const padding = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      padding.push(null);
    }
    months[0].days = [...padding, ...months[0].days];
  }
  
  return months;
}

function intensityClass(v) {
  // White/gray background with blue shades for activity (with dark mode support)
  if (!v || v <= 0) return 'bg-slate-100 dark:bg-gray-700 border border-slate-200 dark:border-gray-600';
  if (v >= 1 && v <= 2) return 'bg-blue-200 dark:bg-blue-800';
  if (v >= 3 && v <= 4) return 'bg-blue-400 dark:bg-blue-600';
  if (v >= 5 && v <= 7) return 'bg-blue-600 dark:bg-blue-500';
  return 'bg-blue-700 dark:bg-blue-400';
}

export default function ContributionCalendar({ 
  activity = {}, 
  title = 'Contribution Calendar',
  stats = null
}) {
  const months = useMemo(() => getRolling365Days(), []);
  const scrollContainerRef = useRef(null);

  // Scroll to the right (current month) on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [months]);
  
  return (
    <div className="w-full">
      <h3 className="text-base font-semibold text-slate-800 dark:text-gray-100 mb-4">{title}</h3>
      
      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {/* Active Days */}
          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
            <div className="text-xs text-slate-600 dark:text-gray-400 mb-1">Active Days</div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
              {stats.totalActiveDays || 0} / {stats.totalDaysInRange || 365}
            </div>
          </div>
          
          {/* Current Streak */}
          <div className="bg-violet-50 dark:bg-violet-900/30 p-3 rounded-lg border border-violet-100 dark:border-violet-800">
            <div className="text-xs text-slate-600 dark:text-gray-400 mb-1">Current Streak</div>
            <div className="text-lg font-bold text-violet-700 dark:text-violet-400">
              {stats.currentStreak || 0} days
            </div>
          </div>
          
          {/* Best Streak */}
          <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg border border-amber-100 dark:border-amber-800">
            <div className="text-xs text-slate-600 dark:text-gray-400 mb-1">Best Streak</div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
              {stats.bestStreak || 0} days
            </div>
          </div>
          
          {/* Courses Enrolled */}
          <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800">
            <div className="text-xs text-slate-600 dark:text-gray-400 mb-1">Courses Enrolled</div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {stats.totalSubjects || 0}
            </div>
          </div>
          
          {/* Videos Watched */}
          <div className="bg-pink-50 dark:bg-pink-900/30 p-3 rounded-lg border border-pink-100 dark:border-pink-800">
            <div className="text-xs text-slate-600 dark:text-gray-400 mb-1">Videos Watched</div>
            <div className="text-lg font-bold text-pink-700 dark:text-pink-400">
              {stats.totalVideosWatched || 0} / {stats.totalVideosTotal || 0}
            </div>
          </div>
        </div>
      )}
      
      {/* Horizontal scrollable grid */}
      <div ref={scrollContainerRef} className="overflow-x-auto pb-2">
        {Object.keys(activity).length === 0 && (
          <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              No activity data yet. Start watching videos or solving problems to see your contribution calendar!
            </p>
          </div>
        )}
        <div className="flex gap-3 min-w-max">
          {months.map(({ year, month, days }) => {
            const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short' });
            
            return (
              <div key={`${year}-${month}`} className="flex flex-col">
                <div className="text-xs text-slate-500 dark:text-gray-400 mb-2 text-center font-medium">
                  {monthName}
                </div>
                {/* 7 rows for days of week, columns for weeks */}
                <div className="grid grid-rows-7 grid-flow-col gap-1">
                  {days.map((date, i) => {
                    if (!date) {
                      return <div key={`empty-${i}`} className="w-2.5 h-2.5" />;
                    }
                    
                    // Create UTC date string in YYYY-MM-DD format to match backend
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const key = `${year}-${month}-${day}`;
                    
                    const v = activity[key] || 0;
                    const cls = intensityClass(v);
                    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    
                    return (
                      <div
                        key={key}
                        title={`${formattedDate} (${dayOfWeek}): ${v} activities`}
                        className={`w-2.5 h-2.5 rounded-sm ${cls} hover:ring-2 hover:ring-blue-500 dark:hover:ring-blue-400 transition-all cursor-pointer`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-end gap-4 mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-gray-400">Less</span>
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 bg-slate-100 dark:bg-gray-700 rounded-sm border border-slate-300 dark:border-gray-600" title="No activity" />
            <div className="w-2.5 h-2.5 bg-blue-200 dark:bg-blue-800 rounded-sm" title="1-2 activities" />
            <div className="w-2.5 h-2.5 bg-blue-400 dark:bg-blue-600 rounded-sm" title="3-4 activities" />
            <div className="w-2.5 h-2.5 bg-blue-600 dark:bg-blue-500 rounded-sm" title="5-7 activities" />
            <div className="w-2.5 h-2.5 bg-blue-700 dark:bg-blue-400 rounded-sm" title="8+ activities" />
          </div>
          <span className="text-xs text-slate-500 dark:text-gray-400">More</span>
        </div>
      </div>
    </div>
  );
}
