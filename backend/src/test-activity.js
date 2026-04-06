import './setup.js';
import { connectDb } from './utils/db.js';
import StudentActivity from './models/StudentActivity.js';
import User from './models/User.js';

async function addTestActivity() {
  try {
    await connectDb();
    
    // Find a student user
    const student = await User.findOne({ role: 'student' });
    
    if (!student) {
      console.log('No student found in database');
      return;
    }
    
    console.log('Found student:', student.email);
    
    // Create test activities for the last 30 days
    const activities = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Add random number of activities per day (0-5)
      const activityCount = Math.floor(Math.random() * 6);
      
      for (let j = 0; j < activityCount; j++) {
        const types = ['VIDEO_WATCH', 'TOPIC_COMPLETED', 'PROBLEM_SOLVED'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        
        activities.push({
          studentId: student._id,
          studentModel: 'User',
          activityType: randomType,
          metadata: {
            test: true,
            day: i,
            index: j
          },
          date: date
        });
      }
    }
    
    console.log(`Creating ${activities.length} test activities...`);
    await StudentActivity.insertMany(activities);
    console.log('Test activities created successfully!');
    
    // Show summary
    const summary = await StudentActivity.aggregate([
      {
        $match: { studentId: student._id }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    console.log('\nRecent activity summary:');
    summary.forEach(s => {
      console.log(`  ${s._id}: ${s.count} activities`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addTestActivity();
