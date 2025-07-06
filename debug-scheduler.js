// Debug script to test scheduler content generation
console.log('🔍 Debugging Enhanced Scheduler Content Generation...');

// Simulate the content generation process
async function debugContentGeneration() {
  try {
    console.log('📅 Current IST time:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('📅 Current day of week:', new Date().getDay());
    
    // Test IST day bounds
    const istNow = new Date();
    const istString = istNow.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istString);
    
    console.log('🌍 IST Date:', istDate);
    console.log('🌍 IST Day of Week:', istDate.getDay());
    
    // Test the fixed getCurrentIST function
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const fixedIST = new Date(now.getTime() + istOffset);
    
    console.log('🔧 Fixed IST Date:', fixedIST);
    console.log('🔧 Fixed IST Day of Week:', fixedIST.getDay());
    
    // Test day bounds calculation
    const startIST = new Date(fixedIST);
    startIST.setHours(0, 0, 0, 0);
    
    const endIST = new Date(fixedIST);
    endIST.setHours(23, 59, 59, 999);
    
    console.log('📅 IST Day Start:', startIST.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('📅 IST Day End:', endIST.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    
    // Convert to UTC
    const startUTC = new Date(startIST.getTime() - (5.5 * 60 * 60 * 1000));
    const endUTC = new Date(endIST.getTime() - (5.5 * 60 * 60 * 1000));
    
    console.log('🌍 UTC Day Start:', startUTC.toISOString());
    console.log('🌍 UTC Day End:', endUTC.toISOString());
    
    console.log('✅ Debug completed');
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Run debug
debugContentGeneration(); 